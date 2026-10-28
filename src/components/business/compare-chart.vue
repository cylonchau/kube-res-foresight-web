<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { formatDecimal, formatMetric } from '@/utils/format';
import { gapPairs, withBreaks } from '@/utils/series-gaps';

defineOptions({ name: 'CompareChart' });

export type LineType = 'line' | 'step' | 'candle';

interface Props {
  /** actual values (candles) of the metric, read from Prometheus */
  actual: Api.Forecast.LiveSeries | null;
  /** actual replica count of the same workload, when the module has a replica source */
  actualReplicas?: Api.Forecast.LiveSeries | null;
  /** the forecasts of every algorithm, with the replicas each needs */
  algorithms: Array<{ algorithm_id: string; points: Api.Forecast.ComparePoint[] }>;
  unit: string;
  height?: number;
  /** how the values are drawn: a line, a step line or candles (open / high / low / close of each bucket) */
  lineType?: LineType;
  /**
   * What the legend says about each algorithm: a text with its name, latest value and error, and for one that made no
   * forecast (`idle`) the reason as a tip. The legend is the one place an algorithm is shown or hidden.
   */
  legend?: Record<string, { text: string; tip?: string; idle?: boolean }>;
  /** the step of the chart in seconds: a stretch longer than a few of them without values is drawn as a break */
  bucketSeconds?: number;
  /** the data is being read again */
  loading?: boolean;
  /** why there is nothing to draw, when it is known (the actual values could not be read, or Prometheus returned none) */
  emptyReason?: string;
}

const props = withDefaults(defineProps<Props>(), {
  actualReplicas: null,
  height: 420,
  lineType: 'line',
  legend: () => ({}),
  bucketSeconds: 60,
  loading: false,
  emptyReason: ''
});
const emit = defineEmits<{ refresh: [] }>();
const { t } = useI18n();

/** the room kept at the right of the legend for the refresh button */
const LEGEND_RIGHT = 92;
const LEGEND_ROW = 22;
/** how many forecast lines are drawn before the user picks more in the legend */
const MAX_DEFAULT_LINES = 6;

// the palette of Grafana's classic theme: thin lines, no symbols, no decoration
const PALETTE = [
  '#7eb26d',
  '#eab839',
  '#6ed0e0',
  '#ef843c',
  '#1f78c1',
  '#ba43a9',
  '#705da0',
  '#508642',
  '#cca300',
  '#e0752d'
];
const ACTUAL = '#f2495c';

const hasData = computed(() => Boolean(props.actual?.candles.length) || props.algorithms.some(a => a.points.length));
const time = (iso: string) => new Date(iso).getTime();
const stamp = (ms: number) => new Date(ms).toLocaleString();

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      // no toolbox: the wheel and drag zoom the plot, and the slider below is a thin strip
      // the right axis (replicas) takes room only when there is one: the plot uses the whole width of the card
      grid: [{ left: 56, right: props.actualReplicas?.candles.length ? 56 : 24, top: 40, bottom: 44 }],
      xAxis: { type: 'time' },
      yAxis: [
        { type: 'value', scale: true },
        { type: 'value', scale: true, minInterval: 1, splitLine: { show: false } }
      ],
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 14, bottom: 6, showDetail: false, brushSelect: false, borderColor: 'transparent' }
      ],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

/** the order of the series as drawn and listed in the legend: the forecasts first, then what actually happened */
const seriesOrder = ref('');

/** how many rows the wrapped legend takes in the width the chart has: each entry is its text (capped) plus the marker */
function legendRowCount(names: string[]): number {
  const width = Math.max((domRef.value?.clientWidth || 800) - LEGEND_RIGHT, 240);
  let rows = 1;
  let used = 0;
  for (const name of names) {
    const entry = 12 + 5 + Math.min(name.length * 7 + 4, 110) + 14;
    if (used + entry > width && used > 0) {
      rows += 1;
      used = 0;
    }
    used += entry;
  }
  return rows;
}

async function draw() {
  const series: Record<string, unknown>[] = [];
  const names = {
    actual: t('page.forecast.compare.actual'),
    replicasActual: t('page.forecast.compare.actualReplicas')
  };
  const stepped = props.lineType === 'step' ? 'end' : false;
  // the forecasts come first and the actual values after them, in the legend and in the tooltip: what was predicted is read
  // against what happened
  props.algorithms.forEach((alg, index) => {
    series.push({
      name: alg.algorithm_id,
      type: 'line',
      step: stepped,
      // a short stretch (a forecast that exists for one run only) must stay visible: the symbols show where the points are sparse
      showSymbol: true,
      showAllSymbol: 'auto',
      symbolSize: 5,
      smooth: false,
      // the forecasts are drawn in front of the actual values, so a forecast is never hidden behind what happened
      z: 10,
      lineStyle: { width: 1.5, color: PALETTE[index % PALETTE.length] },
      itemStyle: { color: PALETTE[index % PALETTE.length] },
      // value, time the forecast was made, replicas it needs; a stretch with no forecast is left open, not bridged by a line
      data: withBreaks(
        alg.points,
        props.bucketSeconds,
        p => time(p.time),
        p => ({ value: [time(p.time), p.value], predictedAt: p.predicted_at, replicas: p.replicas }),
        at => ({ value: [at, null] })
      )
    });
  });
  // an algorithm that made no forecast still has its legend entry, greyed, with the reason as a tip
  for (const [id, info] of Object.entries(props.legend)) {
    if (!info.idle || series.some(item => item.name === id)) continue;
    series.push({ name: id, type: 'line', data: [], lineStyle: { color: '#b8c0cc' }, itemStyle: { color: '#b8c0cc' } });
  }
  if (props.actual?.candles.length) {
    series.push(
      props.lineType === 'candle'
        ? {
            name: names.actual,
            type: 'candlestick',
            // the candle is the summary of the bucket Prometheus returned: open, close, lowest and highest value
            data: props.actual.candles.map(c => [time(c.time), c.open, c.close, c.low, c.high]),
            encode: { x: 0, y: [1, 2, 3, 4] },
            itemStyle: { color: ACTUAL, color0: '#2f9e6e', borderColor: ACTUAL, borderColor0: '#2f9e6e' }
          }
        : {
            name: names.actual,
            type: 'line',
            step: stepped,
            showSymbol: true,
            showAllSymbol: 'auto',
            symbolSize: 4,
            // the actual values are the line the forecasts are read against: thicker, behind the forecasts
            z: 5,
            lineStyle: { width: 2.5, color: ACTUAL },
            itemStyle: { color: ACTUAL },
            data: withBreaks(
              props.actual.candles,
              props.bucketSeconds,
              c => time(c.time),
              c => [time(c.time), c.mean],
              at => [at, null]
            )
          }
    );
  }
  if (props.actualReplicas?.candles.length) {
    series.push({
      name: names.replicasActual,
      type: 'line',
      step: 'end',
      yAxisIndex: 1,
      showSymbol: false,
      lineStyle: { width: 1, color: '#8a95a5', type: 'dotted' },
      itemStyle: { color: '#8a95a5' },
      data: props.actualReplicas.candles.map(c => [time(c.time), c.close])
    });
  }
  // Where a series has no values for a stretch, a dashed line of its colour joins the two sides and the stretch of the actual
  // values is shaded: it shows WHERE data is missing, it is not data and no value is filled in. The line has the name of its
  // series, so hiding the series in the legend hides it too.
  const gapSeries: Record<string, unknown>[] = [];
  const addGaps = (name: string, color: string, pairs: ReturnType<typeof gapPairs>, shade: boolean) => {
    if (!pairs.length) return;
    gapSeries.push({
      id: `gap:${name}`,
      name,
      type: 'line',
      silent: true,
      showSymbol: false,
      z: 4,
      lineStyle: { width: 1.5, type: 'dashed', color, opacity: 0.85 },
      itemStyle: { color },
      data: pairs.flatMap(pair => [pair.from, pair.to, [pair.to[0], null]]),
      ...(shade
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: 'rgba(128, 128, 128, 0.10)' },
              data: pairs.map(pair => [{ xAxis: pair.from[0] }, { xAxis: pair.to[0] }])
            }
          }
        : {})
    });
  };
  props.algorithms.forEach((alg, index) =>
    addGaps(
      alg.algorithm_id,
      PALETTE[index % PALETTE.length],
      gapPairs(
        alg.points,
        props.bucketSeconds,
        p => time(p.time),
        p => p.value
      ),
      false
    )
  );
  if (props.actual?.candles.length && props.lineType !== 'candle') {
    addGaps(
      names.actual,
      ACTUAL,
      gapPairs(
        props.actual.candles,
        props.bucketSeconds,
        c => time(c.time),
        c => c.mean
      ),
      true
    );
  }
  // everything right of "now" is ahead of the actual values: the forecasts that have not come true yet, shaded
  const now = Date.now();
  const end = Math.max(
    0,
    ...props.algorithms.flatMap(alg => alg.points.map(p => time(p.time))),
    ...(props.actual?.candles.map(c => time(c.time)) ?? [])
  );
  const target = series.find(item => item.type === 'line' && item.yAxisIndex === undefined) ?? series[0];
  if (target && end > now) {
    target.markArea = {
      silent: true,
      itemStyle: { color: 'rgba(110, 160, 255, 0.08)' },
      label: {
        show: true,
        position: 'insideTopRight',
        color: '#6b7a90',
        formatter: t('page.forecast.compare.futureZone')
      },
      data: [[{ xAxis: now }, { xAxis: end }]]
    };
    target.markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: { type: 'solid', color: '#6b7a90', width: 1 },
      label: { formatter: t('page.forecast.compare.now'), position: 'insideStartTop' },
      data: [{ xAxis: now }]
    };
  }
  // The legend is the algorithm names only, wrapped onto as many short rows as it needs: it never scrolls or pages and never
  // pushes the chart sideways. What each one forecast last and its error is in the tip shown over the entry, and the plot is
  // moved down by the rows the legend takes.
  const seriesNames = series.map(item => String(item.name));
  const legendRows = legendRowCount(seriesNames);
  // With many algorithms the plot would be a tangle of lines: only the first few forecasts are drawn at first, the others
  // are one click away in the legend. The choice is set when the set of lines changes, so a hidden line stays hidden on refresh.
  const newSet = seriesNames.join('|') !== seriesOrder.value;
  const selected: Record<string, boolean> = {};
  props.algorithms.forEach((alg, index) => {
    selected[alg.algorithm_id] = index < MAX_DEFAULT_LINES;
  });
  seriesOrder.value = seriesNames.join('|');
  await updateOptions(opts => ({
    ...opts,
    grid: [{ left: 56, right: 56, top: 28 + legendRows * LEGEND_ROW, bottom: gapSeries.length ? 58 : 44 }],
    title: gapSeries.length
      ? {
          show: true,
          text: t('page.forecast.compare.gapLegend'),
          left: 56,
          bottom: 24,
          textStyle: { fontSize: 11, fontWeight: 'normal', color: '#8a95a5' }
        }
      : { show: false },
    legend: {
      ...(newSet ? { selected } : {}),
      type: 'plain',
      top: 0,
      left: 0,
      right: LEGEND_RIGHT,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      itemGap: 14,
      textStyle: { fontSize: 12, width: 110, overflow: 'truncate' },
      tooltip: { show: true, confine: true },
      formatter: (name: string) => name,
      data: seriesNames.map(name => {
        const info = props.legend[name];
        const tip = info?.idle ? info.tip : info?.text;
        return tip ? { name, tooltip: { show: true, formatter: () => tip } } : { name };
      })
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      confine: true,
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const at = list[0]?.axisValue ?? list[0]?.value?.[0];
        const rows = [`<b>${stamp(Number(at))}</b>`];
        for (const p of list) {
          // the dashed line over a gap is no value: it is not in the tooltip
          if (String(p.seriesId || '').startsWith('gap:')) continue;
          const raw = p.data;
          if (p.seriesType === 'candlestick') {
            const [, o, c, l, h] = raw;
            rows.push(
              `${p.marker}${p.seriesName}: ${t('page.forecast.compare.open')} ${formatMetric(o, props.unit)} · ${t('page.forecast.compare.close')} ${formatMetric(c, props.unit)} · ${t('page.forecast.compare.low')} ${formatMetric(l, props.unit)} · ${t('page.forecast.compare.high')} ${formatMetric(h, props.unit)}`
            );
          } else if (p.seriesName === names.replicasActual) {
            rows.push(`${p.marker}${p.seriesName}: ${formatDecimal(raw[1], 0)}`);
          } else if (raw?.predictedAt) {
            const rep =
              raw.replicas === null || raw.replicas === undefined
                ? ''
                : ` · ${t('page.forecast.compare.predictedReplicas')} ${raw.replicas}`;
            rows.push(`${p.marker}${p.seriesName}: ${formatMetric(raw.value[1], props.unit)}${rep}`);
          } else {
            rows.push(`${p.marker}${p.seriesName}: ${formatMetric(Array.isArray(raw) ? raw[1] : p.value, props.unit)}`);
          }
        }
        return rows.join('<br/>');
      }
    },
    yAxis: [
      {
        type: 'value',
        scale: true,
        name: props.unit,
        nameGap: 12,
        nameTextStyle: { align: 'left' },
        axisLabel: { formatter: (v: number) => formatDecimal(v, 3) }
      },
      {
        type: 'value',
        scale: true,
        minInterval: 1,
        name: t('page.forecast.compare.replicas'),
        nameGap: 12,
        nameTextStyle: { align: 'right' },
        splitLine: { show: false },
        show: Boolean(props.actualReplicas?.candles.length)
      }
    ],
    series: [...series, ...gapSeries] as never
  }));
}

watch(
  () => [
    props.actual,
    props.actualReplicas,
    props.algorithms,
    props.lineType,
    props.unit,
    props.legend,
    props.bucketSeconds
  ],
  draw,
  {
    deep: false
  }
);
</script>

<template>
  <div>
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="emptyReason || t('page.forecast.compare.empty')"
    />
    <div v-show="hasData" class="chart-box">
      <!-- the chart refreshes by itself: no need to press search again to read the newest data -->
      <NButton
        size="tiny"
        class="chart-refresh"
        :loading="loading"
        :title="t('page.forecast.compare.refreshChart')"
        data-chart-refresh
        @click="emit('refresh')"
      >
        <template #icon><icon-ic-round-refresh /></template>
        {{ t('common.refresh') }}
      </NButton>
      <div
        ref="domRef"
        :style="{ height: `${height}px` }"
        :data-series="seriesOrder"
        class="chart-plot min-h-280px w-full"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.chart-box {
  position: relative;
}
.chart-refresh {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
}
</style>
