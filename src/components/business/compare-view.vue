<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NSelect, NSwitch, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import CompareChart from '@/components/business/compare-chart.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchCompareModule, fetchGetAlgorithms } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatMetric } from '@/utils/format';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'CompareView' });

/**
 * The actual values of a module metric from Prometheus next to the forecasts of every enabled algorithm that has one, with
 * the actual and the predicted replicas, as an interactive chart and a point by point list. `history` looks back (and reports
 * the gaps Prometheus really has); `trends` also looks ahead by the forecast horizon, to show the forecasts that have not come true yet.
 */
const props = defineProps<{ mode: 'history' | 'trends' }>();
const isTrends = computed(() => props.mode === 'trends');

const { t } = useI18n();
const message = useMessage();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  algorithms: [] as string[],
  range: lastHours(24) as [number, number] | null,
  candle: true
});

const selected = computed(() => modules.value.find(item => item.id === search.moduleId));

/** a trend window reaches into the future by the forecast horizon so the newest forecasts are visible */
function defaultRange(): [number, number] {
  const [from, to] = lastHours(24);
  const horizon = (selected.value?.horizon_minutes || 60) * 60 * 1000;
  return [from, isTrends.value ? to + horizon : to];
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
const algorithmOptions = computed(() => algorithmIds.value.map(value => ({ label: value, value })));

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
  search.candle = true;
  search.metric = metricOptions.value[0]?.value ?? null;
  search.range = defaultRange();
  load();
}

const quality = computed(() => compare.value?.actual?.quality);
// history is missing only when Prometheus returned nothing for the whole range
const missing = computed(() => Boolean(compare.value?.actual?.missing));
const missingPercent = computed(() => formatDecimal((quality.value?.missing_ratio || 0) * 100, 2));
const sparse = computed(() => (quality.value?.missing_ratio || 0) > 0.05);

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
}

const rows = computed<Row[]>(() => {
  const c = compare.value;
  if (!c) return [];
  const actual = new Map((c.actual?.candles || []).map(item => [new Date(item.time).getTime(), item.mean]));
  const replicas = new Map((c.actual_replicas?.candles || []).map(item => [new Date(item.time).getTime(), item.close]));
  const out: Row[] = [];
  for (const alg of c.algorithms) {
    for (const p of alg.points) {
      const at = new Date(p.time).getTime();
      out.push({
        key: `${alg.algorithm_id}|${p.time}`,
        time: p.time,
        algorithm: alg.algorithm_id,
        predicted: p.value,
        predictedAt: p.predicted_at,
        predictedReplicas: p.replicas,
        actual: actual.get(at) ?? null,
        actualReplicas: replicas.get(at) ?? null
      });
    }
  }
  return out.sort((a, b) => b.time.localeCompare(a.time) || a.algorithm.localeCompare(b.algorithm));
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
    'predictedAt'
  ]
});

// ---- the gaps Prometheus really has in the range
interface Gap {
  from: string;
  to: string;
  steps: number;
}
const gaps = computed<Gap[]>(() => quality.value?.gaps || []);
const gapPagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (page: number) => (gapPagination.page = page),
  onUpdatePageSize: (size: number) => {
    gapPagination.pageSize = size;
    gapPagination.page = 1;
  }
});
const gapCfg = useTableColumnConfig({
  pageCode: 'forecast_history_gap',
  columnMap: {
    from: {
      title: t('page.forecast.history.gapFrom'),
      key: 'from',
      width: 190,
      render: (row: Gap) => formatDateTime(row.from)
    },
    to: {
      title: t('page.forecast.history.gapTo'),
      key: 'to',
      width: 190,
      render: (row: Gap) => formatDateTime(row.to)
    },
    steps: { title: t('page.forecast.history.gapSteps'), key: 'steps', width: 120, align: 'center' }
  },
  defaultKeys: ['from', 'to', 'steps']
});

/** The checked rows as a CSV: the exact values of the chart. */
function exportChecked() {
  const keys = new Set(checkedRowKeys.value);
  const picked = rows.value.filter(row => keys.has(row.key));
  const lines = ['time,algorithm,predicted,predicted_replicas,actual,actual_replicas,predicted_at'];
  for (const r of picked) {
    lines.push(
      [
        r.time,
        r.algorithm,
        formatDecimal(r.predicted),
        r.predictedReplicas ?? '',
        formatDecimal(r.actual, 3) === '-' ? '' : formatDecimal(r.actual),
        r.actualReplicas ?? '',
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
  gapCfg.initColumnConfig();
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
  await load();
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
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.forecast.compare.algorithms')">
        <NSelect
          v-model:value="search.algorithms"
          multiple
          clearable
          filterable
          :max-tag-count="2"
          :options="algorithmOptions"
          :placeholder="t('page.forecast.compare.allAlgorithms')"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
      <NFormItemGi :span="3" :label="t('page.forecast.compare.candle')">
        <NSwitch v-model:value="search.candle" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="mb-8px flex flex-wrap items-center gap-8px">
        <span class="text-14px font-medium">
          {{ isTrends ? t('page.forecast.trends.title') : t('page.forecast.history.title') }}
        </span>
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-420px leading-22px">
            {{ isTrends ? t('page.forecast.trends.help') : t('page.forecast.history.help') }}
            <div v-if="compare?.replica_basis" class="mt-6px opacity-80">
              {{ t('page.forecast.compare.replicaBasis') }}: {{ compare.replica_basis }}
            </div>
            <div class="mt-6px opacity-80">{{ t('page.forecast.compare.sameObject') }}</div>
          </div>
        </IconTooltip>
        <template v-if="quality && !isTrends">
          <NTag size="small" :bordered="false" :type="missing ? 'error' : sparse ? 'warning' : 'success'">
            {{
              missing
                ? t('page.forecast.history.missing')
                : `${t('page.forecast.history.missingRatio')} ${missingPercent}%`
            }}
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.present') }} {{ quality.present }} / {{ quality.expected }}
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.longestGap') }} {{ quality.longest_gap_steps }}
          </NTag>
          <NTag v-if="compare?.bucket_seconds" size="small" :bordered="false">
            {{ t('page.forecast.compare.bucket', { seconds: compare.bucket_seconds }) }}
          </NTag>
        </template>
        <NTag v-if="compare?.actual_error" size="small" type="error" :bordered="false">
          {{ t('page.forecast.compare.actualError', { error: compare.actual_error }) }}
        </NTag>
      </div>
      <CompareChart
        :actual="compare?.actual ?? null"
        :actual-replicas="compare?.actual_replicas ?? null"
        :algorithms="compare?.algorithms || []"
        :unit="compare?.unit || ''"
        :candle="search.candle"
        :height="420"
      />
    </NCard>

    <div class="h-460px flex flex-col">
      <ListTablePanel
        v-model:checked-row-keys="checkedRowKeys"
        :title="t('page.forecast.compare.points')"
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

    <div v-if="gaps.length && !isTrends" class="h-360px flex flex-col">
      <ListTablePanel
        :title="t('page.forecast.history.gaps')"
        :cfg="gapCfg"
        :loading="loading"
        :data="gaps"
        :pagination="gapPagination"
        :remote="false"
        :row-key="(row: any) => `${row.from}-${row.to}`"
        @refresh="load"
      />
    </div>
  </div>
</template>
