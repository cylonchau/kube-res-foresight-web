<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NCheckbox, NEmpty, NPopover } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { axisTimeLabel, formatDateTime } from '@/utils/date';
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
  /** the plot takes the height the parent gives it, instead of `height` */
  fill?: boolean;
}

/** The point a click landed on: the line it belongs to, its time and value, and for a forecast when it was made. */
export interface PickedPoint {
  series: string;
  /** the actual values, or the forecast of an algorithm */
  kind: 'actual' | 'forecast';
  time: number;
  value: number;
  predictedAt?: string;
  replicas?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  actualReplicas: null,
  height: 420,
  lineType: 'line',
  legend: () => ({}),
  bucketSeconds: 60,
  loading: false,
  emptyReason: '',
  fill: false
});
/**
 * The curves the user switched off. null means no choice was made: the first few forecasts are drawn. The page keeps the choice and gives
 * it back at the next visit, so it is not made again.
 */
const chosenHidden = defineModel<string[] | null>('hidden', { default: null });
const emit = defineEmits<{ refresh: []; pick: [point: PickedPoint] }>();
const { t } = useI18n();

/** the plot starts below a toolbar of a fixed height, so choosing lines never moves it */
const PLOT_TOP = 16;
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
const ACTUAL = '#5b6b82';
const REPLICAS = '#7aa2d6';
/** the colour of a stretch with no data: the line over it only shows where the series is missing, it is not a value */
const GAP = '#e6a23c';
/** a click counts for the nearest point within this many pixels */
const PICK_RADIUS = 28;

const hasData = computed(() => Boolean(props.actual?.candles.length) || props.algorithms.some(a => a.points.length));
/** whether the plot has a stretch with no actual data (drawn as a dashed line): the tip in the toolbar explains it */
const hasGaps = ref(false);
const time = (iso: string) => new Date(iso).getTime();
const stamp = (ms: number) => formatDateTime(ms);

const { domRef, chart, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
      legend: { show: false },
      // no toolbox: the wheel and drag zoom the plot, and the slider below is a thin strip
      // the right axis (replicas) takes room only when there is one: the plot uses the whole width of the card
      grid: [{ left: 56, right: props.actualReplicas?.candles.length ? 56 : 24, top: PLOT_TOP, bottom: 44 }],
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
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

/** the order of the series as drawn, and the lines the user switched off in the list of curves */
const seriesOrder = ref('');
const hidden = ref<string[]>([]);
const isHidden = (name: string) => hidden.value.includes(name);

/** what the list of curves offers: every line of the chart, with the colour it is drawn in and what it last said */
interface Entry {
  name: string;
  color: string;
  tip?: string;
  idle?: boolean;
}
const entries = computed<Entry[]>(() => {
  const out: Entry[] = props.algorithms.map((alg, index) => ({
    name: alg.algorithm_id,
    color: PALETTE[index % PALETTE.length],
    tip: props.legend[alg.algorithm_id]?.text
  }));
  for (const [id, info] of Object.entries(props.legend)) {
    if (info.idle && !out.some(item => item.name === id)) {
      out.push({ name: id, color: '#b8c0cc', tip: info.tip, idle: true });
    }
  }
  if (props.actual?.candles.length) out.push({ name: t('page.forecast.compare.actual'), color: ACTUAL });
  if (props.actualReplicas?.candles.length) {
    out.push({ name: t('page.forecast.compare.actualReplicas'), color: REPLICAS });
  }
  return out;
});
const shownCount = computed(() => entries.value.filter(item => !item.idle && !isHidden(item.name)).length);
const drawable = computed(() => entries.value.filter(item => !item.idle).length);

function toggle(name: string, on: boolean) {
  hidden.value = on ? hidden.value.filter(item => item !== name) : [...hidden.value, name];
  chosenHidden.value = hidden.value;
  draw();
}
function showAll() {
  hidden.value = [];
  chosenHidden.value = hidden.value;
  draw();
}
function showOnly(count: number) {
  const names = entries.value.filter(item => !item.idle).map(item => item.name);
  hidden.value = names.slice(count);
  chosenHidden.value = hidden.value;
  draw();
}

/** what is drawn, kept for the click: the nearest point of any visible line is the one picked */
let picks: Array<{ name: string; kind: 'actual' | 'forecast'; axis: number; data: unknown[] }> = [];

/** the value pair of a drawn point, which is a pair or an object holding one */
function pairOf(point: unknown): unknown[] | undefined {
  const value = Array.isArray(point) ? point : (point as { value?: unknown[] })?.value;
  return Array.isArray(value) ? value : undefined;
}

async function draw() {
  const series: Record<string, unknown>[] = [];
  picks = [];
  const names = {
    actual: t('page.forecast.compare.actual'),
    replicasActual: t('page.forecast.compare.actualReplicas')
  };
  const stepped = props.lineType === 'step' ? 'end' : false;
  // A new set of lines starts with the first few forecasts drawn; the others are one tick away in the list of curves. The
  // choice is made only when the set changes, so a line the user switched off stays off on refresh.
  const allNames = entries.value.map(item => item.name).join('|');
  if (allNames !== seriesOrder.value) {
    seriesOrder.value = allNames;
    // the choice the user made before (kept by the page) comes back; without one, the first few forecasts are drawn. A saved choice
    // names only curves that still exist: one that is gone is dropped, and a curve that is new is drawn.
    const existing = new Set(entries.value.map(item => item.name));
    hidden.value = chosenHidden.value
      ? chosenHidden.value.filter(name => existing.has(name))
      : props.algorithms.slice(MAX_DEFAULT_LINES).map(alg => alg.algorithm_id);
  }
  // the forecasts come first and the actual values after them: what was predicted is read against what happened
  props.algorithms.forEach((alg, index) => {
    if (isHidden(alg.algorithm_id)) return;
    const color = PALETTE[index % PALETTE.length];
    const data = withBreaks(
      alg.points,
      props.bucketSeconds,
      p => time(p.time),
      p => ({ value: [time(p.time), p.value], predictedAt: p.predicted_at, replicas: p.replicas }),
      at => ({ value: [at, null] })
    );
    picks.push({ name: alg.algorithm_id, kind: 'forecast', axis: 0, data });
    series.push({
      name: alg.algorithm_id,
      type: 'line',
      step: stepped,
      // small points, and only where the line is sparse; hovering shows the nearest one larger
      showSymbol: alg.points.length <= 30,
      symbolSize: 2,
      // a curve through the points that never overshoots them, not a stiff polyline
      smooth: !stepped,
      smoothMonotone: 'x',
      // the forecasts are drawn in front of the actual values, so a forecast is never hidden behind what happened
      z: 10,
      lineStyle: { width: 1.5, color },
      itemStyle: { color },
      // pointing at one forecast (its row in the list of curves or the line itself) brings it forward and dims the others
      emphasis: { focus: 'series', blurScope: 'coordinateSystem', scale: 3, lineStyle: { width: 2.5 } },
      blur: { lineStyle: { opacity: 0.3 }, itemStyle: { opacity: 0.3 } },
      data
    });
  });
  if (props.actual?.candles.length && !isHidden(names.actual)) {
    if (props.lineType === 'candle') {
      series.push({
        name: names.actual,
        type: 'candlestick',
        // the candle is the summary of the bucket Prometheus returned: open, close, lowest and highest value
        data: props.actual.candles.map(c => [time(c.time), c.open, c.close, c.low, c.high]),
        encode: { x: 0, y: [1, 2, 3, 4] },
        itemStyle: { color: ACTUAL, color0: '#2f9e6e', borderColor: ACTUAL, borderColor0: '#2f9e6e', borderWidth: 2 }
      });
    } else {
      const data = withBreaks(
        props.actual.candles,
        props.bucketSeconds,
        c => time(c.time),
        c => [time(c.time), c.mean],
        at => [at, null]
      );
      picks.push({ name: names.actual, kind: 'actual', axis: 0, data });
      series.push({
        name: names.actual,
        type: 'line',
        step: stepped,
        showSymbol: props.actual.candles.length <= 30,
        symbolSize: 2,
        smooth: !stepped,
        smoothMonotone: 'x',
        // the actual values are the ground the forecasts are read against: a thick neutral line over a faint area, behind them
        z: 3,
        lineStyle: { width: 3, color: ACTUAL },
        areaStyle: { color: ACTUAL, opacity: 0.12 },
        itemStyle: { color: ACTUAL },
        emphasis: { scale: 2.4 },
        data
      });
    }
  }
  if (props.actualReplicas?.candles.length && !isHidden(names.replicasActual)) {
    series.push({
      name: names.replicasActual,
      type: 'line',
      step: 'end',
      yAxisIndex: 1,
      showSymbol: false,
      // context, further back than the actual values: a translucent stepped area on the right axis, not a line to compare
      z: 1,
      silent: true,
      lineStyle: { width: 1, color: REPLICAS },
      areaStyle: { color: REPLICAS, opacity: 0.15 },
      itemStyle: { color: REPLICAS },
      data: props.actualReplicas.candles.map(c => [time(c.time), c.close])
    });
  }
  // Where a series has no values for a stretch, a dashed line in another colour (amber) joins the two sides and the stretch
  // of the actual values is shaded: it shows WHERE data is missing, it is not data and no value is filled in. The line has
  // the name of its series, so hiding the series hides it too.
  const gapSeries: Record<string, unknown>[] = [];
  const addGaps = (name: string, pairs: ReturnType<typeof gapPairs>, shade: boolean) => {
    if (!pairs.length || isHidden(name)) return;
    gapSeries.push({
      id: `gap:${name}`,
      name,
      type: 'line',
      silent: true,
      showSymbol: false,
      z: 4,
      lineStyle: { width: 1.5, type: [5, 4], color: GAP },
      itemStyle: { color: GAP },
      data: pairs.flatMap(pair => [pair.from, pair.to, [pair.to[0], null]]),
      ...(shade
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: 'rgba(230, 162, 60, 0.10)' },
              data: pairs.map(pair => [{ xAxis: pair.from[0] }, { xAxis: pair.to[0] }])
            }
          }
        : {})
    });
  };
  props.algorithms.forEach(alg =>
    addGaps(
      alg.algorithm_id,
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
  const end = Math.max(0, ...picks.flatMap(item => item.data.map(point => Number(pairOf(point)?.[0] ?? 0))));
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
  hasGaps.value = gapSeries.length > 0;
  await updateOptions(opts => ({
    ...opts,
    grid: [
      {
        left: 56,
        right: props.actualReplicas?.candles.length ? 56 : 24,
        top: PLOT_TOP + 22,
        bottom: 44
      }
    ],
    // what the dashed line over a gap means is said in the tip of the toolbar, not in a line under the plot
    title: { show: false },
    legend: { show: false },
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

/** A click picks the nearest point of the visible lines within a few pixels and tells the page which it was. */
function pickAt(x: number, y: number) {
  const c = chart.value;
  if (!c) return;
  let best: { dist: number; point: PickedPoint } | null = null;
  for (const line of picks) {
    for (const item of line.data) {
      const value = pairOf(item);
      if (!value || value[1] === null || value[1] === undefined) continue;
      const px = c.convertToPixel({ xAxisIndex: 0, yAxisIndex: line.axis }, [Number(value[0]), Number(value[1])]);
      if (!px) continue;
      const dist = Math.hypot(px[0] - x, px[1] - y);
      if (dist <= PICK_RADIUS && (!best || dist < best.dist)) {
        const extra = (Array.isArray(item) ? {} : item) as { predictedAt?: string; replicas?: number | null };
        best = {
          dist,
          point: {
            series: line.name,
            kind: line.kind,
            time: Number(value[0]),
            value: Number(value[1]),
            predictedAt: extra.predictedAt,
            replicas: extra.replicas
          }
        };
      }
    }
  }
  if (best) emit('pick', best.point);
}
watch(chart, c => {
  c?.getZr().on('click', (e: { offsetX: number; offsetY: number }) => pickAt(e.offsetX, e.offsetY));
});

// ---- full screen: the chart takes the whole screen, the page behind it is untouched
const rootRef = ref<HTMLElement | null>(null);
const full = ref(false);
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else rootRef.value?.requestFullscreen?.().catch(() => {});
}
const onFull = () => {
  full.value = document.fullscreenElement === rootRef.value;
};
onMounted(() => document.addEventListener('fullscreenchange', onFull));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFull));

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
  <div ref="rootRef" class="chart-root" :class="{ 'chart-full': full, 'chart-fill': fill }">
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="emptyReason || t('page.forecast.compare.empty')"
    />
    <div v-show="hasData" class="chart-box">
      <!-- one row of a fixed height above the plot: choosing lines or going full screen never moves the plot -->
      <div class="chart-bar">
        <NPopover trigger="click" placement="bottom-start" :to="rootRef ?? undefined" :show-arrow="false">
          <template #trigger>
            <NButton size="tiny" data-chart-curves>
              {{ t('page.forecast.compare.curves') }} {{ shownCount }} / {{ drawable }}
            </NButton>
          </template>
          <div class="curve-list">
            <div class="curve-tools">
              <NButton size="tiny" quaternary @click="showAll">{{ t('common.selectAll') }}</NButton>
              <NButton size="tiny" quaternary @click="showOnly(MAX_DEFAULT_LINES)">
                {{ t('page.forecast.compare.firstOnly', { n: MAX_DEFAULT_LINES }) }}
              </NButton>
            </div>
            <div v-for="item in entries" :key="item.name" class="curve-item" :title="item.tip">
              <NCheckbox
                :checked="!item.idle && !isHidden(item.name)"
                :disabled="item.idle"
                @update:checked="on => toggle(item.name, on)"
              >
                <span class="curve-dot" :style="{ background: item.color }"></span>
                <span class="curve-name">{{ item.name }}</span>
              </NCheckbox>
              <span v-if="item.tip" class="curve-tip">{{ item.tip }}</span>
            </div>
          </div>
        </NPopover>
        <span class="chart-hint">{{ t('page.forecast.compare.clickHint') }}</span>
        <IconTooltip v-if="hasGaps" icon="mdi-help-circle" placement="bottom">
          <div class="max-w-320px leading-22px">{{ t('page.forecast.compare.gapLegend') }}</div>
        </IconTooltip>
        <span class="flex-1"></span>
        <!-- the chart refreshes by itself: no need to press search again to read the newest data -->
        <NButton
          size="tiny"
          :loading="loading"
          :title="t('page.forecast.compare.refreshChart')"
          data-chart-refresh
          @click="emit('refresh')"
        >
          <template #icon><icon-ic-round-refresh /></template>
          {{ t('common.refresh') }}
        </NButton>
        <NButton size="tiny" data-chart-full :title="t('page.forecast.compare.fullscreen')" @click="toggleFull">
          <template #icon>
            <icon-gridicons-fullscreen-exit v-if="full" />
            <icon-gridicons-fullscreen v-else />
          </template>
        </NButton>
      </div>
      <div
        ref="domRef"
        :style="fill || full ? undefined : { height: `${height}px` }"
        :data-series="seriesOrder"
        class="chart-plot min-h-280px w-full"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.chart-root {
  display: flex;
  flex-direction: column;
}
.chart-fill,
.chart-full {
  height: 100%;
}
.chart-full {
  padding: 12px 16px;
  background: #fff;
}
:global(.dark) .chart-full {
  background: #18181c;
}
.chart-box {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.chart-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.chart-hint {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.55;
}
.chart-plot {
  flex: 1;
}
.curve-list {
  max-width: 420px;
  min-width: 260px;
  max-height: 320px;
  overflow-y: auto;
}
.curve-tools {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}
.curve-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.curve-dot {
  display: inline-block;
  width: 10px;
  height: 4px;
  margin: 0 6px 2px 0;
  border-radius: 2px;
}
.curve-name {
  font-size: 13px;
}
.curve-tip {
  max-width: 200px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.6;
}
</style>
