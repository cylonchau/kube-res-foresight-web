<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { valueAxisFor } from '@/utils/chart-axis';
import { axisTimeLabelFor, formatDateTime } from '@/utils/date';
import { formatMetric } from '@/utils/format';

defineOptions({ name: 'OverprovisionLineChart' });

/**
 * One chart of the resource dashboard: the lines of what the module measures (the use of the CPU, the heap of the JVM ...) and the horizontal reference lines
 * that go with them (Requests, the recommended Requests, Limits, P90, P95 and P99). The dashboard makes one chart for each thing the module has set up and draws no
 * other; the figures of the references are written above the plot, so nothing is drawn over a line.
 */
export interface ChartLine {
  name: string;
  ts: number[];
  value: number[];
  color?: string;
}
export interface ChartRef {
  name: string;
  value: number;
  color: string;
  /** dashed (a configuration) or dotted (a quantile) */
  style?: 'dashed' | 'dotted';
}
export interface ChartSpec {
  key: string;
  title: string;
  /** the unit of the values as the platform stores it: cores, bytes, seconds, or none */
  unit: string;
  lines: ChartLine[];
  refs: ChartRef[];
  /** a line of text under the title (what the references are, in figures) */
  figures?: string;
}

interface Props {
  spec: ChartSpec;
  /** the height of the plot */
  plotHeight?: number;
}
const props = withDefaults(defineProps<Props>(), { plotHeight: 230 });
const { t, locale } = useI18n();

const LINE_COLORS = ['#2080f0', '#18a058', '#f0a020', '#8e44ad', '#00a3a3', '#d03050'];

const lines = computed(() => props.spec.lines.filter(line => line.ts.length > 0));
const hasData = computed(() => lines.value.length > 0);

const { domRef, updateOptions } = useEcharts(
  () => ({ animation: false, tooltip: { trigger: 'axis', confine: true }, series: [] }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  if (!hasData.value || !domRef.value) return;
  const { spec } = props;
  const all = lines.value.flatMap(line => line.ts);
  const first = Math.min(...all) * 1000;
  const last = Math.max(...all) * 1000;
  const spanMs = Math.max(last - first, 1);
  const flat = (value: number) => [[first, value] as [number, number], [last, value] as [number, number]];

  const series: Array<Record<string, unknown>> = [];
  lines.value.forEach((line, index) => {
    const color = line.color ?? LINE_COLORS[index % LINE_COLORS.length];
    series.push({
      id: `line:${index}`,
      name: line.name,
      type: 'line',
      showSymbol: false,
      data: line.ts.map((ts, k) => [ts * 1000, line.value[k]] as [number, number]),
      lineStyle: { width: 1.6, color },
      itemStyle: { color },
      areaStyle: lines.value.length === 1 ? { opacity: 0.08, color } : undefined
    });
  });
  for (const ref of spec.refs.filter(item => item.value > 0)) {
    series.push({
      id: `ref:${ref.name}`,
      name: ref.name,
      type: 'line',
      showSymbol: false,
      silent: true,
      data: flat(ref.value),
      lineStyle: { width: 1.2, type: ref.style ?? 'dashed', color: ref.color },
      itemStyle: { color: ref.color }
    });
  }
  const values = [...lines.value.flatMap(line => line.value), ...spec.refs.map(ref => ref.value)].filter(
    v => Number.isFinite(v) && v > 0
  );
  const axis = valueAxisFor(spec.unit, values);
  // a size in bytes has its ticks on round numbers of its unit: the top is the next one up, so no odd figure is written at the top of the axis
  const interval = 'interval' in axis ? (axis.interval as number | undefined) : undefined;
  const names = series.map(item => item.name as string);
  const subtextLines = spec.figures ? Math.max(1, Math.ceil((spec.figures.length * 6.2) / 420)) : 0;
  const titleH = 26 + subtextLines * 15;
  const legendH = 28;
  const total = titleH + legendH + props.plotHeight + 30;
  if (domRef.value) domRef.value.style.height = `${total}px`;

  await updateOptions(
    opts =>
      ({
        ...opts,
        title: {
          text: spec.title,
          subtext: spec.figures,
          left: 4,
          top: 0,
          itemGap: 3,
          textStyle: { fontSize: 13, fontWeight: 600 },
          subtextStyle: { fontSize: 11, lineHeight: 15 }
        },
        legend: {
          type: 'scroll',
          top: titleH,
          left: 4,
          right: 4,
          itemWidth: 16,
          itemHeight: 8,
          itemGap: 12,
          textStyle: { fontSize: 11 },
          data: names
        },
        grid: { top: titleH + legendH, height: props.plotHeight, left: 8, right: 14, containLabel: true },
        xAxis: {
          type: 'time',
          min: first,
          max: last,
          axisLabel: { formatter: (value: number) => axisTimeLabelFor(value, spanMs), hideOverlap: true },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value',
          scale: false,
          min: 0,
          max: interval ? Math.ceil(Math.max(...values, 0) / interval) * interval : undefined,
          splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
          ...axis,
          name: ''
        },
        dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'shift', moveOnMouseMove: true, filterMode: 'none' }],
        tooltip: {
          trigger: 'axis',
          confine: true,
          transitionDuration: 0,
          formatter: (params: unknown) => {
            const items = (Array.isArray(params) ? params : [params]) as Array<{
              axisValue?: number;
              seriesName?: string;
              marker?: string;
              value?: unknown;
            }>;
            if (!items.length) return '';
            const rows = [`<b>${formatDateTime(Number(items[0].axisValue))}</b>`];
            for (const item of items) {
              const raw = Array.isArray(item.value) ? item.value[1] : item.value;
              if (raw === null || raw === undefined) continue;
              rows.push(`${item.marker ?? ''}${item.seriesName}: ${formatMetric(Number(raw), spec.unit)}`);
            }
            return rows.join('<br/>');
          }
        },
        series: series as never
      }) as ECOption
  );
}

watch(() => [props.spec, props.plotHeight], draw, { flush: 'post', deep: false });
watch(locale, draw, { flush: 'post' });
onMounted(draw);
</script>

<template>
  <div class="min-w-0">
    <NEmpty v-if="!hasData" class="h-120px justify-center" :description="t('page.overprovision.noData')" />
    <div v-show="hasData" ref="domRef" class="w-full" style="height: 320px"></div>
  </div>
</template>
