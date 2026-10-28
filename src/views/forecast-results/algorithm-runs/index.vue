<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NSelect, NTag, NTooltip } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TrainingRecordsModal from '@/components/business/training-records-modal.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetAlgorithms, fetchGetTrainingSummary } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'ForecastAlgorithmRuns' });

/**
 * How each enabled algorithm ran: the runs it had, how they ended, how long they took, when it last ran and why its runs did
 * not produce a forecast. Every figure is counted from the training records, the record of the real task executions.
 */
const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
/** the algorithm whose training records are open over the page */
const records = ref<string | null>(null);

const search = reactive({ moduleId: null as number | null, range: lastHours(24 * 7) as [number, number] | null });
const loading = ref(false);
const summary = ref<Api.Forecast.TrainingSummary | null>(null);
const enabled = ref<string[]>([]);

interface Row {
  key: string;
  algorithm: string;
  total: number;
  ok: number;
  skipped: number;
  failed: number;
  avgMs: number;
  lastAt: string | null;
  lastStatus: string;
  reasons: Api.Forecast.TrainingReasonCount[];
}

async function load() {
  loading.value = true;
  try {
    const [counts, algorithms] = await Promise.all([
      fetchGetTrainingSummary({ module_id: search.moduleId ?? undefined, ...rangeParams(search.range) }),
      fetchGetAlgorithms({ page: 1, page_size: 200, enabled: 'true' })
    ]);
    summary.value = counts.data || null;
    enabled.value = (algorithms.data?.list || []).map(item => item.id);
  } finally {
    loading.value = false;
  }
}

/** every enabled algorithm, run or not, and any other algorithm that left records in the range */
const rows = computed<Row[]>(() => {
  const byId = new Map((summary.value?.algorithms || []).map(item => [item.algorithm_id, item]));
  const ids = [...new Set([...enabled.value, ...byId.keys()])].sort();
  return ids.map(id => {
    const item = byId.get(id);
    return {
      key: id,
      algorithm: id,
      total: item ? item.ok + item.skipped + item.failed : 0,
      ok: item?.ok ?? 0,
      skipped: item?.skipped ?? 0,
      failed: item?.failed ?? 0,
      avgMs: item?.avg_duration_ms ?? 0,
      lastAt: item?.last_at ?? null,
      lastStatus: item?.last_status ?? '',
      reasons: item?.reasons ?? []
    };
  });
});

const statusType = (status: string) => (status === 'ok' ? 'success' : status === 'failed' ? 'error' : 'warning');
const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

function openRecords(row: Row) {
  records.value = row.algorithm;
}

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  onChange: (page: number) => (pagination.page = page),
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});

const cfg = useTableColumnConfig({
  pageCode: 'forecast_algorithm_runs',
  columnMap: {
    algorithm: { title: t('page.forecast.modules.algorithm'), key: 'algorithm', width: 130, resizable: true },
    status: {
      title: t('page.forecast.algorithmRuns.latest'),
      key: 'status',
      width: 120,
      align: 'center',
      render: (row: Row) =>
        row.lastStatus
          ? h(NTag, { size: 'small', bordered: false, type: statusType(row.lastStatus) }, () =>
              t(`page.forecast.runs.status_${row.lastStatus}`)
            )
          : h(NTag, { size: 'small', bordered: false }, () => t('page.forecast.ranking.state_not_run'))
    },
    total: { title: t('page.forecast.runs.total'), key: 'total', width: 100, align: 'center' },
    ok: { title: t('page.forecast.runs.status_ok'), key: 'ok', width: 90, align: 'center' },
    skipped: { title: t('page.forecast.runs.status_skipped'), key: 'skipped', width: 90, align: 'center' },
    failed: { title: t('page.forecast.runs.status_failed'), key: 'failed', width: 90, align: 'center' },
    hitRate: {
      title: t('page.forecast.runs.hitRate'),
      key: 'hitRate',
      width: 100,
      align: 'center',
      render: (row: Row) => (row.total ? formatPercent(row.ok / row.total, 1) : '-')
    },
    avg: {
      title: t('page.forecast.runs.avgDuration'),
      key: 'avg',
      width: 120,
      align: 'center',
      render: (row: Row) => (row.total ? duration(row.avgMs) : '-')
    },
    lastAt: {
      title: t('page.forecast.runs.lastRun'),
      key: 'lastAt',
      width: 170,
      render: (row: Row) => (row.lastAt ? formatDateTime(row.lastAt) : '-')
    },
    reasons: {
      title: t('page.forecast.algorithmRuns.reasons'),
      key: 'reasons',
      minWidth: 360,
      render: (row: Row) =>
        row.reasons.length
          ? h(
              'div',
              { class: 'flex-col gap-2px py-2px' },
              row.reasons.map(item =>
                h(NTooltip, null, {
                  trigger: () =>
                    h('div', { class: 'reason-line' }, [
                      h(NTag, { size: 'tiny', bordered: false, type: statusType(item.status) }, () =>
                        t(`page.forecast.runs.status_${item.status}`)
                      ),
                      h('span', { class: 'reason-line__text' }, item.reason),
                      h('span', { class: 'reason-line__count' }, t('page.forecast.runs.times', { count: item.count }))
                    ]),
                  default: () => item.reason
                })
              )
            )
          : '-'
    },
    operate: {
      title: t('common.operate'),
      key: 'operate',
      width: 130,
      fixed: 'right',
      align: 'center',
      render: (row: Row) =>
        h(
          NButton,
          { size: 'tiny', type: 'primary', ghost: true, disabled: !row.total, onClick: () => openRecords(row) },
          () => t('page.forecast.algorithmRuns.records')
        )
    }
  },
  defaultKeys: [
    'algorithm',
    'status',
    'total',
    'ok',
    'skipped',
    'failed',
    'hitRate',
    'avg',
    'lastAt',
    'reasons',
    'operate'
  ]
});

function resetSearch() {
  Object.assign(search, { moduleId: null, range: lastHours(24 * 7) });
  load();
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  await load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="9" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('page.forecast.algorithmRuns.allModules')"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.algorithmRuns.title')"
      :help="t('page.forecast.algorithmRuns.help')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :remote="false"
      :pagination="pagination"
      :row-key="(row: any) => row.key"
      :empty-hint="t('page.forecast.algorithmRuns.empty')"
      @refresh="load"
    />
    <TrainingRecordsModal
      :show="records !== null"
      :module-id="search.moduleId"
      :module-name="search.moduleId ? moduleName(search.moduleId) : ''"
      :algorithm-id="records || ''"
      @update:show="value => !value && (records = null)"
    />
  </div>
</template>

<style scoped>
:deep(.reason-line) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
:deep(.reason-line__text) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.reason-line__count) {
  opacity: 0.65;
  white-space: nowrap;
}
</style>
