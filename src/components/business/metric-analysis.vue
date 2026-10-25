<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { NButton, NCard, NEmpty, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import MetricSeriesChart from '@/components/business/metric-series-chart.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { type MetricResult, downloadSeriesCsv, formatNumber, summarize } from '@/utils/metric-series';

defineOptions({ name: 'MetricAnalysis' });

/**
 * The result of a metric query, laid out by what each part is for: the chart (the shape over time), the summary (one
 * card per series, with how the forecasts compare with the measured values) and the data points (the exact values, paged).
 */
interface Props {
  results: MetricResult[];
  nameOf: (item: MetricResult, labels: Record<string, string>) => string;
  loading?: boolean;
  title: string;
  help?: string;
  /** names the file of the CSV export and the saved column layout of the data point list */
  pageCode: string;
  chartHeight?: number;
  /** the heading of the summary section */
  summaryTitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  help: '',
  chartHeight: 360,
  summaryTitle: ''
});

const emit = defineEmits<{ refresh: [] }>();
const { t } = useI18n();

const summary = computed(() => summarize(props.results, props.nameOf));

/** the measured series is what a forecast is compared with */
const measured = computed(() => {
  for (const item of props.results) {
    if (!item.actual) continue;
    const values = item.result.series.flatMap(series => series.points.map(point => point.value));
    if (values.length) return { max: Math.max(...values), mean: values.reduce((a, b) => a + b, 0) / values.length };
  }
  return null;
});
const measuredNames = computed(
  () =>
    new Set(
      props.results
        .filter(item => item.actual)
        .flatMap(item => item.result.series.map(series => props.nameOf(item, series.labels)))
    )
);

const cards = computed(() =>
  summary.value.map(row => {
    const isMeasured = measuredNames.value.has(row.name);
    const against =
      measured.value && !isMeasured && measured.value.max > 0
        ? (row.max - measured.value.max) / measured.value.max
        : null;
    return { ...row, isMeasured, against };
  })
);
const signed = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

// ---- the exact values, paged
interface Point {
  key: string;
  time: number;
  series: string;
  value: number;
}
const MAX_POINTS = 20000;
const points = computed<Point[]>(() => {
  const rows: Point[] = [];
  for (const item of props.results) {
    for (const series of item.result.series) {
      const name = props.nameOf(item, series.labels);
      for (const point of series.points) {
        if (rows.length >= MAX_POINTS) break;
        rows.push({
          key: `${item.def.name}|${name}|${point.ts}`,
          time: point.ts * 1000,
          series: name,
          value: point.value
        });
      }
    }
  }
  return rows.sort((a, b) => b.time - a.time);
});

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
watch(
  () => props.results,
  () => (pagination.page = 1)
);

const columnMap: Record<string, any> = {
  time: {
    title: t('page.forecast.metrics.time'),
    key: 'time',
    width: 190,
    render: (row: Point) => formatDateTime(new Date(row.time).toISOString())
  },
  series: { title: t('page.forecast.metrics.series'), key: 'series', minWidth: 220, ellipsis: { tooltip: true } },
  value: {
    title: t('page.forecast.metrics.value'),
    key: 'value',
    width: 160,
    align: 'right',
    render: (row: Point) => formatNumber(row.value)
  }
};
const cfg = useTableColumnConfig({
  pageCode: `${props.pageCode}_points`,
  columnMap,
  defaultKeys: ['time', 'series', 'value']
});
cfg.initColumnConfig();
</script>

<template>
  <div class="analysis">
    <!-- the shape over time -->
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="mb-8px flex flex-wrap items-center justify-between gap-12px">
        <div class="flex flex-wrap items-center gap-6px text-14px font-medium">
          {{ title }}
          <IconTooltip v-if="help" icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ help }}</div>
          </IconTooltip>
          <slot name="meta" />
        </div>
        <NButton size="small" :disabled="!summary.length" @click="downloadSeriesCsv(results, pageCode, nameOf)">
          {{ t('page.forecast.metrics.exportCsv') }}
        </NButton>
      </div>
      <MetricSeriesChart :results="results" :height="chartHeight" />
    </NCard>

    <!-- one card per series -->
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="mb-10px flex items-center gap-6px text-14px font-medium">
        {{ summaryTitle || t('page.forecast.metrics.summary') }}
        <IconTooltip icon="mdi-help-circle" placement="top">
          <div class="max-w-360px leading-22px">{{ t('page.forecast.metrics.summaryHelp') }}</div>
        </IconTooltip>
      </div>
      <div v-if="cards.length" class="cards">
        <div v-for="card in cards" :key="card.key" class="card" :class="{ 'card--measured': card.isMeasured }">
          <div class="card__head">
            <span class="card__name">{{ card.name }}</span>
            <NTag v-if="card.isMeasured" size="small" :bordered="false" type="success">
              {{ t('page.forecast.metrics.actual') }}
            </NTag>
            <NTag
              v-else-if="card.against !== null"
              size="small"
              :bordered="false"
              :type="Math.abs(card.against) <= 0.1 ? 'success' : 'warning'"
            >
              {{ t('page.forecast.metrics.peakVsActual') }} {{ signed(card.against) }}
            </NTag>
          </div>
          <div class="card__stats">
            <div v-for="key in ['last', 'min', 'max', 'mean'] as const" :key="key">
              <div class="card__label">{{ t(`page.forecast.metrics.${key}`) }}</div>
              <div class="card__value">{{ formatNumber(card[key]) }}</div>
            </div>
          </div>
          <div class="card__foot">{{ card.points }} {{ t('page.forecast.metrics.points') }}</div>
        </div>
      </div>
      <NEmpty v-else :description="t('page.forecast.metrics.empty')" />
    </NCard>

    <!-- the exact values -->
    <div class="analysis__points">
      <ListTablePanel
        :title="t('page.forecast.metrics.pointsTitle')"
        :help="t('page.forecast.metrics.pointsHelp')"
        :cfg="cfg"
        :loading="loading"
        :data="points"
        :pagination="pagination"
        :remote="false"
        :row-key="(row: any) => row.key"
        :empty-hint="t('page.forecast.metrics.empty')"
        @refresh="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.analysis__points {
  display: flex;
  flex-direction: column;
  height: 460px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.card {
  padding: 12px 14px;
  border: 1px solid rgb(var(--base-text-color) / 0.1);
  border-radius: 10px;
}
.card--measured {
  border-color: rgb(var(--success-color) / 0.5);
  background: rgb(var(--success-color) / 0.05);
}
.card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.card__name {
  font-weight: 600;
  word-break: break-all;
}
.card__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.card__label {
  font-size: 12px;
  opacity: 0.6;
}
.card__value {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.card__foot {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
