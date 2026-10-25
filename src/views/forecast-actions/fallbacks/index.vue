<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NModal, NSelect, NSpace, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import { useForecastModules, windowStart, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { downloadAuditExport, fetchGetFallbacks } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastActionsFallbacks' });

const REASONS: Api.Forecast.DegradeReason[] = [
  'no_data',
  'stale_data',
  'insufficient_history',
  'predictor_failed',
  'no_prediction',
  'stale_prediction',
  'no_eligible_model',
  'recovering',
  'low_score',
  'short_history',
  'predict_timeout',
  'oom_floor'
];

const { t } = useI18n();
const message = useMessage();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  reason: null as string | null,
  hours: (24 * 7) as number | null
});
const exporting = ref(false);
const detail = ref<Api.Forecast.FallbackRecord | null>(null);

const reasonOptions = computed(() =>
  REASONS.map(value => ({ label: t(`page.forecast.fallbacks.reason_${value}`), value }))
);
const hoursOptions = useWindowOptions();

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.FallbackRecord>(async (page, pageSize) => {
  const { data } = await fetchGetFallbacks({
    module_id: search.moduleId ?? undefined,
    reason: search.reason ?? undefined,
    from: windowStart(search.hours),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

function resetSearch() {
  Object.assign(search, { moduleId: null, reason: null, hours: 24 * 7 });
}

async function exportCsv() {
  exporting.value = true;
  try {
    await downloadAuditExport({
      kind: 'fallbacks',
      module_id: search.moduleId ?? undefined,
      reason: search.reason ?? undefined,
      from: windowStart(search.hours)
    });
  } catch (error) {
    message.error(String((error as Error).message || error));
  } finally {
    exporting.value = false;
  }
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

const columnMap: Record<string, any> = {
  created_at: {
    title: t('page.forecast.fallbacks.startedAt'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.FallbackRecord) => formatDateTime(row.created_at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.FallbackRecord) => moduleName(row.module_id)
  },
  version: {
    title: t('page.forecast.recommendations.version'),
    key: 'version',
    width: 90,
    align: 'center',
    sorter: true
  },
  reasons: {
    title: t('page.forecast.fallbacks.reasons'),
    key: 'reasons',
    minWidth: 280,
    render: (row: Api.Forecast.FallbackRecord) =>
      h(NSpace, { size: 4, wrap: true }, () =>
        Object.entries(row.reasons).map(([field, code]) =>
          h(
            NTag,
            { size: 'small', bordered: false, type: code === 'oom_floor' ? 'error' : 'warning' },
            () =>
              `${t(`page.forecast.explain.field_${field === 'memory_floor' ? 'memory' : field}`)}: ${t(`page.forecast.fallbacks.reason_${code}`, String(code))}`
          )
        )
      )
  },
  duration: {
    title: t('page.forecast.fallbacks.duration'),
    key: 'duration',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.FallbackRecord) => duration(row.duration_seconds)
  },
  recovered_at: {
    title: t('page.forecast.fallbacks.recoveredAt'),
    key: 'recovered_at',
    width: 170,
    render: (row: Api.Forecast.FallbackRecord) =>
      row.recovered_at
        ? formatDateTime(row.recovered_at)
        : h(NTag, { size: 'small', bordered: false, type: 'error' }, () => t('page.forecast.fallbacks.ongoing'))
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 110,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.FallbackRecord) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
          t('page.forecast.recommendations.explain')
        )
      ])
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_fallback',
  columnMap,
  defaultKeys: ['created_at', 'module', 'reasons', 'duration', 'recovered_at', 'operate']
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="8" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="8" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.fallbacks.reason')">
        <NSelect
          v-model:value="search.reason"
          clearable
          :options="reasonOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.fallbacks.reason') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.fallbacks.title')"
      :help="t('page.forecast.fallbacks.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.fallbacks.empty')"
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
      :title="t('page.forecast.fallbacks.detailTitle')"
      class="edit-modal-wide"
      @update:show="value => !value && (detail = null)"
    >
      <div class="max-h-60vh overflow-auto">
        <RecommendationExplain v-if="detail" :detail="detail.detail" />
      </div>
    </NModal>
  </div>
</template>
