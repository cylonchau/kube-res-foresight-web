<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInputNumber, NModal, NSelect, NSpace, NTag, useMessage } from 'naive-ui';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import { useForecastModules, windowStart, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { downloadAuditExport, fetchGetRecommendations } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastActionsRecommendations' });

const { t } = useI18n();
const message = useMessage();
const MIB = 1024 * 1024;
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const route = useRoute();
const search = reactive({
  moduleId: null as number | null,
  version: null as number | null,
  source: null as string | null,
  degraded: null as string | null,
  hours: (24 * 7) as number | null
});
const exporting = ref(false);
const detail = ref<Api.Forecast.Recommendation | null>(null);

const sourceOptions = computed(() =>
  ['algorithm', 'fixed_period', 'fallback', 'original', 'bypass', 'oom_floor'].map(value => ({
    label: t(`page.forecast.recommendations.source_${value}`),
    value
  }))
);
const degradedOptions = computed(() => [
  { label: t('page.forecast.recommendations.degradedOnly'), value: 'true' },
  { label: t('page.forecast.recommendations.healthyOnly'), value: 'false' }
]);
const hoursOptions = useWindowOptions();

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
function filters() {
  return {
    module_id: search.moduleId ?? undefined,
    version: search.version ?? undefined,
    source: search.source ?? undefined,
    degraded: search.degraded === null ? undefined : search.degraded === 'true',
    from: windowStart(search.hours)
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
  Object.assign(search, { moduleId: null, version: null, source: null, degraded: null, hours: 24 * 7 });
}

async function exportCsv() {
  exporting.value = true;
  try {
    await downloadAuditExport({
      kind: 'recommendations',
      module_id: search.moduleId ?? undefined,
      from: windowStart(search.hours)
    });
  } catch (error) {
    message.error(String((error as Error).message || error));
  } finally {
    exporting.value = false;
  }
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
    render: (row: Api.Forecast.Recommendation) => source(row.cpu_source, row.cpu_set, `${row.cpu_milli} m`)
  },
  memory: {
    title: t('page.forecast.recommendations.memory'),
    key: 'memory',
    width: 220,
    resizable: true,
    render: (row: Api.Forecast.Recommendation) =>
      h('span', [
        source(row.memory_source, row.memory_set, `${Math.round(row.memory_bytes / MIB)} MiB`),
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
    render: (row: Api.Forecast.Recommendation) => (row.algorithm ? `${row.algorithm} (${row.score.toFixed(1)})` : '-')
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
    width: 110,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Recommendation) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
          t('page.forecast.recommendations.explain')
        )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_recommendation',
  columnMap,
  defaultKeys: ['module', 'created_at', 'cpu', 'memory', 'gpu', 'replicas', 'algorithm', 'degraded', 'operate']
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  // an execution record links here with the module and the version it acted on
  const moduleId = Number(route.query.module_id);
  const version = Number(route.query.version);
  if (moduleId > 0) search.moduleId = moduleId;
  if (version > 0) {
    search.version = version;
    search.hours = null;
  }
  list.search();
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
      <NFormItemGi class="list-search-short-field" :span="2" :label="t('page.forecast.recommendations.version')">
        <NInputNumber v-model:value="search.version" clearable :min="1" :show-button="false" />
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
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
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
    >
      <template #suffix>
        <NButton size="small" :loading="exporting" @click="exportCsv">
          {{ t('page.forecast.recommendations.export') }}
        </NButton>
      </template>
    </ListTablePanel>
    <NModal
      :show="detail !== null"
      preset="card"
      :title="t('page.forecast.recommendations.explain')"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div class="max-h-60vh overflow-auto">
        <RecommendationExplain v-if="detail" :detail="detail.detail" />
      </div>
    </NModal>
  </div>
</template>
