<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCode,
  NDescriptions,
  NDescriptionsItem,
  NFormItemGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import MetricMappingForm from '@/components/business/metric-mapping-form.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchDeleteMetricMapping,
  fetchGetForecastMetricCatalog,
  fetchGetMetricMappings,
  fetchGetMetricPresets
} from '@/service/api';

defineOptions({ name: 'MonitoringMetrics' });

/**
 * The metric catalog is the one place the Prometheus metrics of the platform are listed and managed. Three kinds of
 * entries live side by side, so a metric is defined once and every page reads the same definition:
 *  - mapping: a Prometheus metric (PromQL) bound to a datasource, which modules collect, forecast and evaluate; added and
 *    edited here, the same records as the metric mapping page;
 *  - preset: a read-only PromQL template of the built-in mapping library, added to a datasource as a mapping;
 *  - platform: a metric the platform itself exports (usage, forecasts, accuracy, executions), read-only, drawn on the
 *    metric curve page.
 */
type Origin = 'mapping' | 'preset' | 'platform';
interface Row {
  key: string;
  origin: Origin;
  name: string;
  metric: string;
  level: string;
  unit: string;
  datasource: string;
  query: string;
  enabled?: boolean;
  description: string;
  mapping?: Api.Datasource.MetricMapping;
  preset?: Api.Datasource.Preset;
  platform?: Api.Forecast.MetricDef;
}

const { t, locale } = useI18n();
const message = useMessage();
const router = useRouter();
const ORIGINS: Origin[] = ['mapping', 'preset', 'platform'];

const mappings = ref<Api.Datasource.MetricMapping[]>([]);
const presets = ref<Api.Datasource.Preset[]>([]);
const platform = ref<Api.Forecast.MetricDef[]>([]);
const loading = ref(false);
const search = reactive({ keyword: '', origin: null as Origin | null, metric: null as string | null });

const text = (value: { zh: string; en: string }) => (locale.value === 'en-US' ? value.en : value.zh);
const metricLabel = (metric: string) => (metric ? t(`page.datasource.mappings.metric_${metric}`) : '-');

const all = computed<Row[]>(() => [
  ...mappings.value.map(item => ({
    key: `mapping:${item.id}`,
    origin: 'mapping' as const,
    name: item.name,
    metric: item.metric,
    level: item.level,
    unit: item.unit,
    datasource: item.datasource_name,
    query: item.query,
    enabled: item.enabled,
    description: item.remark || (item.preset_id ? `${t('page.datasource.mappings.preset')}: ${item.preset_id}` : ''),
    mapping: item
  })),
  ...presets.value.map(item => ({
    key: `preset:${item.id}`,
    origin: 'preset' as const,
    name: text(item.name),
    metric: item.metric,
    level: item.level,
    unit: item.unit,
    datasource: '',
    query: item.query,
    description: text(item.scenario),
    preset: item
  })),
  ...platform.value.map(item => ({
    key: `platform:${item.name}`,
    origin: 'platform' as const,
    name: item.name,
    metric: '',
    level: '',
    unit: item.unit,
    datasource: '',
    query: item.export?.name || '',
    description: `${text(item.help)}: ${text(item.value)}`,
    platform: item
  }))
]);

const metricOptions = computed(() => {
  const kinds = new Set([...mappings.value.map(item => item.metric), ...presets.value.map(item => item.metric)]);
  return [...kinds].map(value => ({ label: metricLabel(value), value }));
});
const originOptions = computed(() =>
  ORIGINS.map(value => ({ label: t(`page.forecast.metrics.origin_${value}`), value }))
);

const rows = computed(() => {
  const keyword = search.keyword.trim().toLowerCase();
  return all.value.filter(
    item =>
      (!search.origin || item.origin === search.origin) &&
      (!search.metric || item.metric === search.metric) &&
      (!keyword || `${item.name} ${item.query} ${item.description} ${item.datasource}`.toLowerCase().includes(keyword))
  );
});

const pagination = reactive({
  page: 1,
  pageSize: 15,
  showSizePicker: true,
  pageSizes: [15, 30, 50, 100],
  onChange: (page: number) => (pagination.page = page),
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});

async function load() {
  loading.value = true;
  try {
    const [mapped, built, exported] = await Promise.all([
      fetchGetMetricMappings({ page: 1, page_size: 200 }),
      fetchGetMetricPresets(),
      fetchGetForecastMetricCatalog()
    ]);
    mappings.value = mapped.data?.list || [];
    presets.value = built.data?.list || [];
    platform.value = exported.data?.list || [];
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  Object.assign(search, { keyword: '', origin: null, metric: null });
  pagination.page = 1;
}

// ---- add, edit and add-from-template share the form of the mapping page
const formVisible = ref(false);
const editing = ref<Api.Datasource.MetricMapping | null>(null);
const fromPreset = ref<Api.Datasource.Preset | null>(null);

function openForm(mapping?: Api.Datasource.MetricMapping, preset?: Api.Datasource.Preset) {
  editing.value = mapping ?? null;
  fromPreset.value = preset ?? null;
  formVisible.value = true;
}

async function remove(row: Row) {
  if (!row.mapping) return;
  const { error } = await fetchDeleteMetricMapping(row.mapping.id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await load();
  }
}

const detail = ref<Row | null>(null);

/** The curve of a platform metric is drawn on its own page. */
function drawCurve(row: Row) {
  router.push({ path: '/monitoring/curves', query: { name: row.name } });
}

const originType = { mapping: 'success', preset: 'info', platform: 'default' } as const;

const columnMap: Record<string, any> = {
  name: {
    title: t('page.forecast.metrics.name'),
    key: 'name',
    width: 240,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  origin: {
    title: t('page.forecast.metrics.origin'),
    key: 'origin',
    width: 130,
    align: 'center',
    render: (row: Row) =>
      h(NTag, { size: 'small', bordered: false, type: originType[row.origin] }, () =>
        t(`page.forecast.metrics.origin_${row.origin}`)
      )
  },
  metric: {
    title: t('page.datasource.mappings.metric'),
    key: 'metric',
    width: 120,
    align: 'center',
    render: (row: Row) => metricLabel(row.metric)
  },
  level: {
    title: t('page.datasource.mappings.level'),
    key: 'level',
    width: 110,
    align: 'center',
    render: (row: Row) => (row.level ? t(`page.datasource.mappings.level_${row.level}`) : '-')
  },
  unit: { title: t('page.forecast.metrics.unit'), key: 'unit', width: 90, align: 'center' },
  datasource: {
    title: t('page.datasource.mappings.datasource'),
    key: 'datasource',
    width: 150,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Row) => row.datasource || '-'
  },
  query: {
    title: t('page.forecast.metrics.promql'),
    key: 'query',
    minWidth: 360,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Row) =>
      row.enabled === undefined
        ? '-'
        : h(NTag, { size: 'small', bordered: false, type: row.enabled ? 'success' : 'default' }, () =>
            t(row.enabled ? 'common.enable' : 'common.disable')
          )
  },
  description: {
    title: t('page.forecast.metrics.meaning'),
    key: 'description',
    minWidth: 240,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: 230,
    fixed: 'right',
    align: 'center',
    render: (row: Row) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'small', onClick: () => (detail.value = row) }, () => t('page.forecast.metrics.detail')),
        row.origin === 'mapping'
          ? [
              h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openForm(row.mapping) }, () =>
                t('common.edit')
              ),
              h(
                NPopconfirm,
                { onPositiveClick: () => remove(row) },
                {
                  trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, () => t('common.delete')),
                  default: () => t('common.confirmDelete')
                }
              )
            ]
          : row.origin === 'preset'
            ? h(
                NButton,
                { size: 'small', type: 'primary', ghost: true, onClick: () => openForm(undefined, row.preset) },
                () => t('page.datasource.presets.apply')
              )
            : h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => drawCurve(row) }, () =>
                t('page.forecast.metrics.queryThis')
              )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'monitoring_metric_catalog',
  columnMap,
  defaultKeys: ['name', 'origin', 'metric', 'level', 'unit', 'datasource', 'query', 'enabled', 'actions']
});

onMounted(() => {
  cfg.initColumnConfig();
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="7" @search="pagination.page = 1" @reset="resetSearch">
      <NFormItemGi :span="8" :label="t('common.keyword')">
        <NInput v-model:value="search.keyword" clearable :placeholder="t('page.forecast.metrics.keywordPlaceholder')" />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.metrics.origin')"
      >
        <NSelect
          v-model:value="search.origin"
          clearable
          :options="originOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.metrics.origin') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          clearable
          :options="metricOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.metric') })"
        />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      :title="t('page.forecast.metrics.catalog')"
      :help="t('page.forecast.metrics.catalogHint')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :pagination="pagination"
      :remote="false"
      :row-key="(row: any) => row.key"
      show-add
      @add="openForm()"
      @refresh="load"
    />

    <MetricMappingForm v-model:show="formVisible" :editing="editing" :preset="fromPreset" @saved="load" />

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail?.name"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="detail" class="max-h-70vh overflow-y-auto pr-8px">
        <NDescriptions :column="1" label-placement="left" size="small" bordered>
          <NDescriptionsItem :label="t('page.forecast.metrics.origin')">
            {{ t(`page.forecast.metrics.origin_${detail.origin}`) }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.metric" :label="t('page.datasource.mappings.metric')">
            {{ metricLabel(detail.metric) }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.level" :label="t('page.datasource.mappings.level')">
            {{ t(`page.datasource.mappings.level_${detail.level}`) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.metrics.unit')">{{ detail.unit || '-' }}</NDescriptionsItem>
          <NDescriptionsItem v-if="detail.datasource" :label="t('page.datasource.mappings.datasource')">
            {{ detail.datasource }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.platform" :label="t('page.forecast.metrics.labels')">
            {{ detail.platform.labels.join(', ') || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.platform" :label="t('page.forecast.metrics.retention')">
            {{
              detail.platform.retention_days
                ? t('page.forecast.metrics.days', { days: detail.platform.retention_days })
                : t('page.forecast.metrics.lookback')
            }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.preset" :label="t('page.datasource.presets.columns.source')">
            {{ detail.preset.source.component }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="detail.preset" :label="t('page.datasource.presets.limitations')">
            {{ text(detail.preset.limitations) }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.metrics.meaning')">
            {{ detail.description || '-' }}
          </NDescriptionsItem>
        </NDescriptions>
        <template v-if="detail.query">
          <div class="mb-6px mt-12px font-medium">
            {{ detail.origin === 'platform' ? t('page.forecast.metrics.exported') : t('page.forecast.metrics.promql') }}
          </div>
          <NCode :code="detail.query" language="promql" word-wrap />
        </template>
      </div>
    </NModal>
  </div>
</template>
