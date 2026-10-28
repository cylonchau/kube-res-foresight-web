<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NPopconfirm, NSelect, NSpace, NTag, useDialog, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import MetricMappingForm from '@/components/business/metric-mapping-form.vue';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchDeleteMetricMappings,
  fetchDeleteMetricMapping,
  fetchGetDatasourceOptions,
  fetchGetMetricCatalog,
  fetchGetMetricMappings
} from '@/service/api/datasource';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'DatasourceMetricMappings' });

const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();

const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const catalog = ref<Api.Datasource.MetricCatalog>({
  metrics: [],
  levels: [],
  variables: [],
  min_step_seconds: 15,
  max_step_seconds: 3600
});
const checkedRowKeys = ref<number[]>([]);

const search = reactive<{
  keyword: string;
  datasource_id: number | null;
  metric: string | null;
  level: string | null;
  enabled: 'true' | 'false' | null;
}>({ keyword: '', datasource_id: null, metric: null, level: null, enabled: null });

const metricLabel = (metric: string) => t(`page.datasource.mappings.metric_${metric}`);
const levelLabel = (level: string) => t(`page.datasource.mappings.level_${level}`);

const datasourceOptions = computed(() => datasources.value.map(item => ({ label: item.name, value: item.id })));
const metricOptions = computed(() =>
  catalog.value.metrics.map(item => ({ label: `${metricLabel(item.metric)} (${item.unit})`, value: item.metric }))
);
const levelOptions = computed(() =>
  catalog.value.levels.map(item => ({ label: levelLabel(item.level), value: item.level }))
);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);

const list = usePagedList<Api.Datasource.MetricMapping>(async (page, pageSize) => {
  const { data } = await fetchGetMetricMappings({
    page,
    page_size: pageSize,
    keyword: search.keyword.trim() || undefined,
    datasource_id: search.datasource_id ?? undefined,
    metric: search.metric ?? undefined,
    level: search.level ?? undefined,
    enabled: search.enabled === null ? undefined : search.enabled === 'true'
  });
  return data;
});
const runSearch = () => list.search();
const reload = () => list.reload();

function resetSearch() {
  Object.assign(search, { keyword: '', datasource_id: null, metric: null, level: null, enabled: null });
  runSearch();
}

// ---- form
const formVisible = ref(false);
const editing = ref<Api.Datasource.MetricMapping | null>(null);

function open(row?: Api.Datasource.MetricMapping) {
  editing.value = row ?? null;
  formVisible.value = true;
}

async function remove(id: number) {
  const { error } = await fetchDeleteMetricMapping(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    checkedRowKeys.value = checkedRowKeys.value.filter(key => key !== id);
    await reload();
  }
}

function batchRemove() {
  if (!checkedRowKeys.value.length) return;
  dialog.warning({
    title: t('common.tip'),
    content: t('common.confirmBatchDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    async onPositiveClick() {
      const { error } = await fetchBatchDeleteMetricMappings(checkedRowKeys.value);
      if (error) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await reload();
    }
  });
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: { title: t('page.datasource.mappings.name'), key: 'name', width: 180, resizable: true },
  datasource_name: {
    title: t('page.datasource.mappings.datasource'),
    key: 'datasource_name',
    width: 160,
    resizable: true
  },
  metric: {
    title: t('page.datasource.mappings.metric'),
    key: 'metric',
    width: 110,
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) =>
      h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => metricLabel(row.metric) })
  },
  level: {
    title: t('page.datasource.mappings.level'),
    key: 'level',
    width: 110,
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) => levelLabel(row.level)
  },
  unit: { title: t('page.datasource.mappings.unit'), key: 'unit', width: 90, align: 'center' },
  preset_id: {
    title: t('page.datasource.mappings.preset'),
    key: 'preset_id',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Datasource.MetricMapping) => row.preset_id || '-'
  },
  step_seconds: {
    title: t('page.datasource.mappings.step'),
    key: 'step_seconds',
    width: 100,
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) => `${row.step_seconds} s`
  },
  query: {
    title: t('page.datasource.mappings.query'),
    key: 'query',
    width: 420,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) =>
      h(
        NTag,
        { size: 'small', type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  remark: { title: t('common.remark'), key: 'remark', width: 200, resizable: true, ellipsis: { tooltip: true } },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) => formatDateTime(row.created_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: 104,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Datasource.MetricMapping) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
};

const cfg = useTableColumnConfig({
  pageCode: 'metric_mapping_manage',
  columnMap,
  defaultKeys: [
    '__selection__',
    'name',
    'datasource_name',
    'metric',
    'level',
    'unit',
    'step_seconds',
    'preset_id',
    'query',
    'enabled',
    'actions'
  ]
});

onMounted(async () => {
  cfg.initColumnConfig();
  runSearch();
  const [options, metricCatalog] = await Promise.all([fetchGetDatasourceOptions(), fetchGetMetricCatalog()]);
  datasources.value = options.data || [];
  if (metricCatalog.data) catalog.value = metricCatalog.data;
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="5" @search="runSearch" @reset="resetSearch">
      <NFormItemGi :span="6" :label="t('page.datasource.mappings.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.datasource.mappings.keywordPlaceholder')"
          @keyup.enter="runSearch"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.datasource.mappings.datasource')"
      >
        <NSelect
          v-model:value="search.datasource_id"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.datasource') })"
          :options="datasourceOptions"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.metric') })"
          :options="metricOptions"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.mappings.level')"
      >
        <NSelect
          v-model:value="search.level"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.level') })"
          :options="levelOptions"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.connections.enabled')"
      >
        <NSelect
          v-model:value="search.enabled"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.connections.enabled') })"
          :options="enabledOptions"
        />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.datasource.mappings.title')"
      :help="t('page.datasource.mappings.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="(row: any) => row.id"
      show-add
      show-delete
      :disabled-delete="checkedRowKeys.length === 0"
      @add="open()"
      @delete="batchRemove"
      @refresh="reload"
    />

    <MetricMappingForm v-model:show="formVisible" :editing="editing" @saved="reload" />
  </div>
</template>
