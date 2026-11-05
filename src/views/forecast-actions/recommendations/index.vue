<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NModal, NSelect, NSpace, NTag } from 'naive-ui';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import SnapshotHistoryModal from '@/components/business/snapshot-history-modal.vue';
import { useForecastModules } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetRecommendations } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatCpuMilli, formatMemoryBytes } from '@/utils/format';
import { helpTitle } from '@/utils/help-title';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'ForecastActionsRecommendations' });

const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const route = useRoute();

/** the module whose snapshot history is open over the page */
const historyOf = ref<number | null>(null);
function openSnapshots(row: Api.Forecast.Recommendation) {
  historyOf.value = row.module_id;
}
const search = reactive({
  moduleId: null as number | null,
  source: null as string | null,
  degraded: null as string | null
});
const detail = ref<Api.Forecast.Recommendation | null>(null);
/** the versions of the module of the open snapshot: the page lists the current one, the older ones are read here */
const versions = ref<Api.Forecast.Recommendation[]>([]);
const versionOptions = computed(() =>
  versions.value.map(item => ({ label: `v${item.version} · ${formatDateTime(item.created_at)}`, value: item.id }))
);

async function openDetail(row: Api.Forecast.Recommendation) {
  detail.value = row;
  versions.value = [];
  const { data } = await fetchGetRecommendations({ module_id: row.module_id, page: 1, page_size: 20 });
  versions.value = data?.list || [];
}
function pickVersion(id: number) {
  const found = versions.value.find(item => item.id === id);
  if (found) detail.value = found;
}

const sourceOptions = computed(() =>
  ['algorithm', 'fixed_period', 'fixed_count', 'fallback', 'original', 'bypass', 'oom_floor'].map(value => ({
    label: t(`page.forecast.recommendations.source_${value}`),
    value
  }))
);
const degradedOptions = computed(() => [
  { label: t('page.forecast.recommendations.degradedOnly'), value: 'true' },
  { label: t('page.forecast.recommendations.healthyOnly'), value: 'false' }
]);

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
function filters() {
  return {
    module_id: search.moduleId ?? undefined,
    source: search.source ?? undefined,
    degraded: search.degraded === null ? undefined : search.degraded === 'true',
    // one row per module: the current snapshot
    latest: true
  };
}
const list = usePagedList<Api.Forecast.Recommendation>(async (page, pageSize) => {
  const { data } = await fetchGetRecommendations({ ...filters(), page, page_size: pageSize, ...sortParams() });
  return data;
});
searchList = () => {
  list.search();
};

function resetSearch() {
  Object.assign(search, { moduleId: null, source: null, degraded: null });
}

function source(value: string, set: boolean, text: string) {
  return set
    ? h('span', [
        text,
        ' ',
        h(
          NTag,
          {
            size: 'small',
            bordered: false,
            type:
              value === 'algorithm'
                ? 'info'
                : value === 'fixed_period'
                  ? 'warning'
                  : value === 'fallback'
                    ? 'error'
                    : 'default'
          },
          { default: () => t(`page.forecast.recommendations.source_${value}`, value) }
        )
      ])
    : h(NTag, { size: 'small', bordered: false }, { default: () => t('page.forecast.recommendations.keepOriginal') });
}

const columnMap: Record<string, any> = {
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.Recommendation) => moduleName(row.module_id)
  },
  version: {
    title: t('page.forecast.recommendations.version'),
    key: 'version',
    width: 90,
    align: 'center',
    sorter: true
  },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.Recommendation) => formatDateTime(row.created_at)
  },
  valid_until: {
    title: t('page.forecast.recommendations.validUntil'),
    key: 'valid_until',
    width: 170,
    render: (row: Api.Forecast.Recommendation) => formatDateTime(row.valid_until)
  },
  cpu: {
    title: 'CPU',
    key: 'cpu',
    width: 190,
    resizable: true,
    render: (row: Api.Forecast.Recommendation) => source(row.cpu_source, row.cpu_set, formatCpuMilli(row.cpu_milli))
  },
  memory: {
    title: t('page.forecast.recommendations.memory'),
    key: 'memory',
    width: 220,
    resizable: true,
    render: (row: Api.Forecast.Recommendation) =>
      h('span', [
        source(row.memory_source, row.memory_set, formatMemoryBytes(row.memory_bytes)),
        row.oom_floor
          ? h(NTag, { size: 'small', bordered: false, type: 'error', class: 'ml-4px' }, () =>
              t('page.forecast.recommendations.oomFloor')
            )
          : null
      ])
  },
  replicas: {
    title: t('page.forecast.modules.replicas'),
    key: 'replicas',
    width: 190,
    resizable: true,
    render: (row: Api.Forecast.Recommendation) => source(row.replicas_source, row.replicas_set, String(row.replicas))
  },
  spec: {
    title: () => helpTitle(t('page.forecast.recommendations.specVersion'), t('page.forecast.recommendations.help')),
    key: 'spec',
    width: 150,
    align: 'center',
    render: (row: Api.Forecast.Recommendation) =>
      h(NSpace, { size: 4, justify: 'center', wrap: false }, () => [
        h(NTag, { size: 'small', bordered: false, type: 'info' }, () =>
          t('page.forecast.recommendations.specVersionTag', { version: row.resource_version || 1 })
        ),
        row.resource_held
          ? h(NTag, { size: 'small', bordered: false }, () => t('page.forecast.recommendations.specHeld'))
          : null
      ])
  },
  gpu: {
    title: 'GPU',
    key: 'gpu',
    width: 160,
    render: (row: Api.Forecast.Recommendation) => source(row.gpu_source, row.gpu_set, String(row.gpu))
  },
  algorithm: {
    title: t('page.forecast.recommendations.algorithm'),
    key: 'algorithm',
    width: 190,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Recommendation) => (row.algorithm ? `${row.algorithm} (${row.score.toFixed(2)})` : '-')
  },
  effective_max: {
    title: t('page.forecast.recommendations.effectiveMax'),
    key: 'effective_max_replicas',
    width: 120,
    align: 'center',
    render: (row: Api.Forecast.Recommendation) => row.effective_max_replicas || '-'
  },
  degraded: {
    title: t('page.forecast.recommendations.degraded'),
    key: 'degraded',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Recommendation) =>
      row.degraded
        ? h(NTag, { size: 'small', bordered: false, type: 'warning' }, () =>
            t('page.forecast.recommendations.degradedTag')
          )
        : '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([t('page.forecast.recommendations.explain'), t('page.forecast.recommendations.history')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Recommendation) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => openDetail(row) }, () =>
          t('page.forecast.recommendations.explain')
        ),
        h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => openSnapshots(row) }, () =>
          t('page.forecast.recommendations.history')
        )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_recommendation',
  columnMap,
  defaultKeys: ['module', 'cpu', 'memory', 'replicas', 'spec', 'created_at', 'gpu', 'algorithm', 'degraded', 'operate'],
  // a width saved before the buttons grew must not clip them
  columnMinWidths: { operate: 150 }
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  // an execution record links here with the module and the version it acted on
  const moduleId = Number(route.query.module_id);
  const version = Number(route.query.version);
  list.search();
  if (moduleId > 0 && version > 0) {
    const { data } = await fetchGetRecommendations({ module_id: moduleId, version, page: 1, page_size: 1 });
    if (data?.list?.[0]) openDetail(data.list[0]);
  }
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="5" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.recommendations.sourceLabel')"
      >
        <NSelect
          v-model:value="search.source"
          clearable
          :options="sourceOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.recommendations.sourceLabel') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.recommendations.degraded')"
      >
        <NSelect
          v-model:value="search.degraded"
          clearable
          :options="degradedOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.recommendations.degraded') })"
        />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.recommendations.title')"
      :help="t('page.forecast.recommendations.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.recommendations.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    ></ListTablePanel>
    <NModal
      :show="detail !== null"
      preset="card"
      :title="t('page.forecast.recommendations.explain')"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div v-if="versionOptions.length > 1" class="mb-8px flex items-center gap-8px">
        <span class="text-13px opacity-70">{{ t('page.forecast.recommendations.version') }}</span>
        <NSelect
          :value="detail?.id"
          :options="versionOptions"
          size="small"
          class="w-260px"
          @update:value="pickVersion"
        />
      </div>
      <div class="max-h-60vh overflow-auto">
        <RecommendationExplain v-if="detail" :detail="detail.detail" :module-id="detail.module_id" />
      </div>
    </NModal>
    <SnapshotHistoryModal
      :show="historyOf !== null"
      :module-id="historyOf"
      :module-name="historyOf ? moduleName(historyOf) : ''"
      @update:show="value => !value && (historyOf = null)"
    />
  </div>
</template>
