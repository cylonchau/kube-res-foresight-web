<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NSelect, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import CompareChart, { type LineType } from '@/components/business/compare-chart.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchCompareModule, fetchGetAlgorithms } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatMetric, formatPercent } from '@/utils/format';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'CompareView' });

/**
 * One page, no tabs: the actual values of a module metric from Prometheus next to the forecasts of every enabled algorithm,
 * as one chart, with the state and the error (WAPE) of each algorithm on tags above it, and the prediction records point by
 * point (predicted value, actual value, error) in one list below. The window reaches one forecast horizon ahead so the newest
 * forecasts, which have not come true yet, are visible. An algorithm without a forecast in the range says why.
 */
const { t } = useI18n();
const message = useMessage();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  algorithms: [] as string[],
  range: lastHours(3) as [number, number] | null,
  lineType: 'line' as LineType
});
const lineTypeOptions = computed(() =>
  (['line', 'step', 'candle'] as const).map(value => ({ label: t(`page.forecast.compare.lineType_${value}`), value }))
);

const selected = computed(() => modules.value.find(item => item.id === search.moduleId));

/** the window reaches into the future by the forecast horizon so the newest forecasts are visible */
function defaultRange(): [number, number] {
  const [from, to] = lastHours(3);
  const horizon = (selected.value?.horizon_minutes || 60) * 60 * 1000;
  return [from, to + horizon];
}

const loading = ref(false);
const compare = ref<Api.Forecast.Compare | null>(null);
const algorithmIds = ref<string[]>([]);
const checkedRowKeys = ref<string[]>([]);

const metricOptions = computed(() =>
  (selected.value?.sources || [])
    .filter(source => source.enabled)
    .map(source => ({ label: source.name, value: source.key }))
);

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

async function load() {
  if (!search.moduleId || !search.metric || !search.range) {
    compare.value = null;
    return;
  }
  loading.value = true;
  try {
    const { data, error } = await fetchCompareModule(search.moduleId, {
      metric: search.metric,
      ...rangeParams(search.range),
      algorithms: search.algorithms.join(',') || undefined
    });
    compare.value = error ? null : data;
    checkedRowKeys.value = [];
    pagination.page = 1;
  } finally {
    loading.value = false;
  }
}

watch(
  () => search.moduleId,
  () => {
    compare.value = null;
    search.algorithms = [];
    if (!metricOptions.value.some(item => item.value === search.metric))
      search.metric = metricOptions.value[0]?.value ?? null;
  }
);

function resetSearch() {
  search.moduleId = modules.value[0]?.id ?? null;
  search.algorithms = [];
  search.lineType = 'line';
  search.metric = metricOptions.value[0]?.value ?? null;
  search.range = defaultRange();
  load();
}

// history is missing only when Prometheus returned nothing for the whole range
const missing = computed(() => Boolean(compare.value?.actual?.missing));

// ---- the point by point list: one row per algorithm per time, next to the actual values of the same time
interface Row {
  key: string;
  time: string;
  algorithm: string;
  predicted: number;
  predictedAt: string;
  predictedReplicas: number | null;
  actual: number | null;
  actualReplicas: number | null;
  /** predicted - actual, and as a share of the actual value; null when the actual value of that time is not known */
  error: number | null;
  errorRate: number | null;
}

const rows = computed<Row[]>(() => {
  const c = compare.value;
  if (!c) return [];
  const actual = new Map((c.actual?.candles || []).map(item => [new Date(item.time).getTime(), item.mean]));
  const replicaCandles = (c.actual_replicas?.candles || []).map(
    item => [new Date(item.time).getTime(), item.close] as const
  );
  const now = Date.now();
  const replicaAt = (at: number) => {
    let found: number | null = null;
    for (const [time, value] of replicaCandles) {
      if (time > at) break;
      found = value;
    }
    return at <= now ? found : null;
  };
  const out: Row[] = [];
  for (const alg of c.algorithms) {
    for (const p of alg.points) {
      const at = new Date(p.time).getTime();
      const real = actual.get(at) ?? null;
      out.push({
        key: `${alg.algorithm_id}|${p.time}`,
        time: p.time,
        algorithm: alg.algorithm_id,
        predicted: p.value,
        predictedAt: p.predicted_at,
        predictedReplicas: p.replicas,
        actual: real,
        actualReplicas: replicaAt(at),
        error: real === null ? null : p.value - real,
        errorRate: real === null || real === 0 ? null : (p.value - real) / Math.abs(real)
      });
    }
  }
  return out.sort((a, b) => b.time.localeCompare(a.time) || a.algorithm.localeCompare(b.algorithm));
});

/** why the chart is empty, when it is known: the reason is said in the chart itself, not in a card above it */
const emptyReason = computed(() => {
  if (compare.value?.actual_error) return t('page.forecast.compare.actualError', { error: compare.value.actual_error });
  if (missing.value) return t('page.forecast.history.missing');
  return '';
});

const unit = computed(() => compare.value?.unit || '');
const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  time: {
    title: t('page.forecast.compare.time'),
    key: 'time',
    width: 170,
    render: (row: Row) => formatDateTime(row.time)
  },
  algorithm: { title: t('page.forecast.modules.algorithm'), key: 'algorithm', width: 150, resizable: true },
  predicted: {
    title: t('page.forecast.compare.predicted'),
    key: 'predicted',
    width: 140,
    align: 'right',
    render: (row: Row) => formatMetric(row.predicted, unit.value)
  },
  predictedReplicas: {
    title: t('page.forecast.compare.predictedReplicas'),
    key: 'predictedReplicas',
    width: 120,
    align: 'right',
    render: (row: Row) => row.predictedReplicas ?? '-'
  },
  actual: {
    title: t('page.forecast.compare.actualValue'),
    key: 'actual',
    width: 140,
    align: 'right',
    render: (row: Row) => formatMetric(row.actual, unit.value)
  },
  actualReplicas: {
    title: t('page.forecast.compare.replicasNow'),
    key: 'actualReplicas',
    width: 120,
    align: 'right',
    render: (row: Row) => row.actualReplicas ?? '-'
  },
  error: {
    title: t('page.forecast.compare.error'),
    key: 'error',
    width: 130,
    align: 'right',
    render: (row: Row) => (row.error === null ? '-' : formatMetric(row.error, unit.value))
  },
  errorRate: {
    title: t('page.forecast.compare.errorRate'),
    key: 'errorRate',
    width: 110,
    align: 'right',
    render: (row: Row) => (row.errorRate === null ? '-' : formatPercent(row.errorRate, 1))
  },
  predictedAt: {
    title: t('page.forecast.compare.predictedAt'),
    key: 'predictedAt',
    width: 170,
    render: (row: Row) => formatDateTime(row.predictedAt)
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_history_points',
  columnMap,
  defaultKeys: [
    '__selection__',
    'time',
    'algorithm',
    'predicted',
    'predictedReplicas',
    'actual',
    'actualReplicas',
    'error',
    'errorRate'
  ]
});

// ---- every enabled algorithm with its state: the ones without a forecast in the range say why
const pointsOf = computed(() => new Map((compare.value?.algorithms || []).map(a => [a.algorithm_id, a.points.length])));
const statuses = computed(() => compare.value?.statuses || []);

// ---- the error of each algorithm over the points that have an actual value (trends)
interface ErrorRow {
  key: string;
  algorithm: string;
  state: Api.Forecast.AlgorithmState;
  reason: string;
  points: number;
  mae: number | null;
  wape: number | null;
  bias: number | null;
}
const errorRows = computed<ErrorRow[]>(() => {
  const byAlgorithm = new Map<string, Row[]>();
  for (const row of rows.value) {
    if (row.error === null || row.actual === null) continue;
    byAlgorithm.set(row.algorithm, [...(byAlgorithm.get(row.algorithm) || []), row]);
  }
  const out: ErrorRow[] = statuses.value.map(item => {
    const list = byAlgorithm.get(item.algorithm_id) || [];
    const base = {
      key: item.algorithm_id,
      algorithm: item.algorithm_id,
      state: item.status,
      reason: reasonText(item.reason)
    };
    if (!list.length) {
      const hasForecast = (pointsOf.value.get(item.algorithm_id) || 0) > 0;
      return {
        ...base,
        points: 0,
        mae: null,
        wape: null,
        bias: null,
        reason: hasForecast ? t('page.forecast.compare.noActualYet') : item.reason
      };
    }
    const abs = list.reduce((sum, r) => sum + Math.abs(r.error!), 0);
    const real = list.reduce((sum, r) => sum + Math.abs(r.actual!), 0);
    return {
      ...base,
      points: list.length,
      mae: abs / list.length,
      wape: real > 0 ? abs / real : null,
      bias: list.reduce((sum, r) => sum + r.error!, 0) / list.length,
      reason: ''
    };
  });
  return out.sort((a, b) => {
    if ((a.wape === null) !== (b.wape === null)) return a.wape === null ? 1 : -1;
    return (a.wape ?? 0) - (b.wape ?? 0) || a.algorithm.localeCompare(b.algorithm);
  });
});
const wapeOf = computed(() => new Map(errorRows.value.map(row => [row.algorithm, row.wape])));

/**
 * What the legend of the chart says about each algorithm: its name, the latest value it forecast and its error, or the
 * state and the reason when it made no forecast. The legend is also where an algorithm is shown or hidden.
 */
const legendLabels = computed(() => {
  const out: Record<string, { text: string; tip?: string; idle?: boolean }> = {};
  for (const item of statuses.value) {
    if (item.status === 'ready') {
      const points = compare.value?.algorithms.find(a => a.algorithm_id === item.algorithm_id)?.points || [];
      const latest = points.reduce<Api.Forecast.ComparePoint | null>(
        (best, p) => (!best || new Date(p.time) > new Date(best.time) ? p : best),
        null
      );
      const wape = wapeOf.value.get(item.algorithm_id);
      const parts = [item.algorithm_id];
      if (latest) parts.push(formatMetric(latest.value, unit.value));
      if (wape !== null && wape !== undefined)
        parts.push(
          `WAPE ${formatPercent(wape, 1)} (Σ|${t('page.forecast.compare.predicted')}-${t('page.forecast.compare.actualValue')}| ÷ Σ${t('page.forecast.compare.actualValue')})`
        );
      out[item.algorithm_id] = { text: parts.join(' · ') };
    } else {
      out[item.algorithm_id] = {
        text: `${item.algorithm_id} · ${t(`page.forecast.ranking.state_${item.status}`)}`,
        tip: reasonText(item.reason),
        idle: true
      };
    }
  }
  return out;
});

/** The checked rows as a CSV: the exact values of the chart. */
function exportChecked() {
  const keys = new Set(checkedRowKeys.value);
  const picked = rows.value.filter(row => keys.has(row.key));
  const lines = ['time,algorithm,predicted,predicted_replicas,actual,actual_replicas,error,predicted_at'];
  for (const r of picked) {
    lines.push(
      [
        r.time,
        r.algorithm,
        formatDecimal(r.predicted),
        r.predictedReplicas ?? '',
        formatDecimal(r.actual, 3) === '-' ? '' : formatDecimal(r.actual),
        r.actualReplicas ?? '',
        r.error === null ? '' : formatDecimal(r.error),
        r.predictedAt
      ].join(',')
    );
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = 'kube-resource-fcst-history.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(async () => {
  cfg.initColumnConfig();
  try {
    const [, algos] = await Promise.all([
      loadModules(),
      fetchGetAlgorithms({ page: 1, page_size: 200, enabled: 'true' })
    ]);
    algorithmIds.value = (algos.data?.list || []).map(item => item.id);
  } catch {
    message.error(t('page.forecast.evaluation.loadFailed'));
  }
  search.moduleId = modules.value[0]?.id ?? null;
  search.metric = metricOptions.value[0]?.value ?? null;
  search.range = defaultRange();
  // the search is submitted by the list-search plugin when the filters above change
});
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <ListSearchCard :model="search" :action-span="6" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect v-model:value="search.metric" :options="metricOptions" />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.compare.lineType')"
      >
        <NSelect v-model:value="search.lineType" :options="lineTypeOptions" />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="flex-shrink-0 rounded-16px shadow-sm">
      <CompareChart
        :legend="legendLabels"
        :actual="compare?.actual ?? null"
        :actual-replicas="compare?.actual_replicas ?? null"
        :algorithms="compare?.algorithms || []"
        :unit="compare?.unit || ''"
        :line-type="search.lineType"
        :bucket-seconds="compare?.bucket_seconds || 60"
        :loading="loading"
        :empty-reason="emptyReason"
        :height="420"
        @refresh="load"
      />
    </NCard>

    <div class="h-520px flex-shrink-0 flex flex-col">
      <ListTablePanel
        v-model:checked-row-keys="checkedRowKeys"
        :title="t('page.forecast.history.recordsTitle')"
        :help="t('page.forecast.history.pointsHelp')"
        :cfg="cfg"
        :loading="loading"
        :data="rows"
        :pagination="pagination"
        :remote="false"
        :row-key="(row: any) => row.key"
        :empty-hint="t('page.forecast.compare.empty')"
        @refresh="load"
      >
        <template #suffix>
          <NButton size="small" :disabled="!checkedRowKeys.length" @click="exportChecked">
            {{ t('page.forecast.metrics.exportCsv') }}
          </NButton>
        </template>
      </ListTablePanel>
    </div>
  </div>
</template>
