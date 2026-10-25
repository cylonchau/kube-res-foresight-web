<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NSelect, NSwitch, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import BatchActions from '@/components/business/batch-actions.vue';
import CompareChart from '@/components/business/compare-chart.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchCompareModule } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatMetric } from '@/utils/format';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'MonitoringCurves' });

/**
 * The curve of one metric of a module's dataset, read from Prometheus at the moment of the request for the chosen range (the
 * history from before the module existed included): candles (open, high, low, close of each bucket) or a line, zoom, tooltip.
 */
const { t } = useI18n();
const route = useRoute();
const { modules, moduleOptions, loadModules } = useForecastModules();

const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  range: lastHours(24) as [number, number] | null,
  candle: true
});
const loading = ref(false);
const compare = ref<Api.Forecast.Compare | null>(null);
const checkedRowKeys = ref<string[]>([]);

const selected = computed(() => modules.value.find(item => item.id === search.moduleId));
const metricOptions = computed(() =>
  (selected.value?.sources || [])
    .filter(source => source.enabled)
    .map(source => ({ label: source.name, value: source.key }))
);
const actual = computed(() => compare.value?.actual ?? null);
const unit = computed(() => compare.value?.unit || '');

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
      predictions: false
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
    if (!metricOptions.value.some(item => item.value === search.metric))
      search.metric = metricOptions.value[0]?.value ?? null;
  }
);

function resetSearch() {
  search.moduleId = modules.value[0]?.id ?? null;
  search.metric = metricOptions.value[0]?.value ?? null;
  search.range = lastHours(24);
  search.candle = true;
  load();
}

// ---- the values behind the chart, a bucket per row
interface Row {
  key: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  mean: number;
  count: number;
}
const rows = computed<Row[]>(() =>
  [...(actual.value?.candles || [])].reverse().map(c => ({
    key: c.time,
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    mean: c.mean,
    count: c.count
  }))
);
const value = (row: number) => formatMetric(row, unit.value);
const cfg = useTableColumnConfig({
  pageCode: 'monitoring_curves_points',
  columnMap: {
    __selection__: { type: 'selection', width: 42, minWidth: 42 },
    time: {
      title: t('page.forecast.compare.time'),
      key: 'time',
      width: 180,
      render: (row: Row) => formatDateTime(row.time)
    },
    open: {
      title: t('page.forecast.compare.open'),
      key: 'open',
      width: 130,
      align: 'right',
      render: (row: Row) => value(row.open)
    },
    high: {
      title: t('page.forecast.compare.high'),
      key: 'high',
      width: 130,
      align: 'right',
      render: (row: Row) => value(row.high)
    },
    low: {
      title: t('page.forecast.compare.low'),
      key: 'low',
      width: 130,
      align: 'right',
      render: (row: Row) => value(row.low)
    },
    close: {
      title: t('page.forecast.compare.close'),
      key: 'close',
      width: 130,
      align: 'right',
      render: (row: Row) => value(row.close)
    },
    mean: {
      title: t('page.forecast.metrics.mean'),
      key: 'mean',
      width: 130,
      align: 'right',
      render: (row: Row) => value(row.mean)
    },
    count: { title: t('page.forecast.metrics.points'), key: 'count', width: 90, align: 'center' }
  },
  defaultKeys: ['__selection__', 'time', 'open', 'high', 'low', 'close', 'mean', 'count']
});

const batchActions = computed(() => [{ key: 'export', label: t('page.forecast.metrics.exportCsv') }]);
function exportChecked() {
  const keys = new Set(checkedRowKeys.value);
  const lines = ['time,open,high,low,close,mean,count'];
  for (const r of rows.value.filter(item => keys.has(item.key))) {
    lines.push(
      [
        r.time,
        formatDecimal(r.open),
        formatDecimal(r.high),
        formatDecimal(r.low),
        formatDecimal(r.close),
        formatDecimal(r.mean),
        r.count
      ].join(',')
    );
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = 'kubeforecast-curve.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  const fromRoute = Number(route.query.module_id);
  search.moduleId = modules.value.find(item => item.id === fromRoute)?.id ?? modules.value[0]?.id ?? null;
  search.metric = metricOptions.value[0]?.value ?? null;
  await load();
});
</script>

<template>
  <div class="h-full flex-col gap-12px overflow-auto">
    <ListSearchCard :model="search" :action-span="4" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect v-model:value="search.moduleId" filterable :options="moduleOptions" />
      </NFormItemGi>
      <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.datasource.mappings.metric')">
        <NSelect v-model:value="search.metric" filterable :options="metricOptions" />
      </NFormItemGi>
      <NFormItemGi :span="7" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
      <NFormItemGi :span="2" :label="t('page.forecast.compare.candle')">
        <NSwitch v-model:value="search.candle" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="mb-8px flex flex-wrap items-center gap-8px">
        <span class="text-14px font-medium">{{ t('page.forecast.metrics.chart') }}</span>
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-380px leading-22px">{{ t('page.forecast.metrics.curvesHelp') }}</div>
        </IconTooltip>
        <template v-if="actual">
          <NTag size="small" :bordered="false" :type="actual.missing ? 'error' : 'success'">
            {{ actual.missing ? t('page.forecast.history.missing') : t('page.forecast.metrics.fromPrometheus') }}
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.history.present') }} {{ actual.quality.present }} / {{ actual.quality.expected }}
          </NTag>
          <NTag size="small" :bordered="false">
            {{ t('page.forecast.compare.bucket', { seconds: actual.bucket_seconds }) }}
          </NTag>
        </template>
        <NTag v-if="compare?.actual_error" size="small" type="error" :bordered="false">
          {{ t('page.forecast.compare.actualError', { error: compare.actual_error }) }}
        </NTag>
      </div>
      <CompareChart :actual="actual" :algorithms="[]" :unit="unit" :candle="search.candle" :height="380" />
    </NCard>

    <div class="h-460px flex flex-col">
      <ListTablePanel
        v-model:checked-row-keys="checkedRowKeys"
        :title="t('page.forecast.metrics.pointsTitle')"
        :help="t('page.forecast.metrics.pointsHelp')"
        :cfg="cfg"
        :loading="loading"
        :data="rows"
        :pagination="pagination"
        :remote="false"
        :row-key="(row: any) => row.key"
        :empty-hint="t('page.forecast.metrics.empty')"
        @refresh="load"
      >
        <template #suffix>
          <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="exportChecked" />
          <NButton size="small" :disabled="!rows.length" @click="checkedRowKeys = rows.map(r => r.key)">
            {{ t('common.selectAll') }}
          </NButton>
        </template>
      </ListTablePanel>
    </div>
  </div>
</template>
