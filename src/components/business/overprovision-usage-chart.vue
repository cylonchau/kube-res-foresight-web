<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useElementSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { valueAxisFor } from '@/utils/chart-axis';
import { axisTimeLabelFor, formatDateTime } from '@/utils/date';
import { formatMetric } from '@/utils/format';

defineOptions({ name: 'OverprovisionUsageChart' });

/**
 * One chart for the CPU and the memory of a module: the use over the window as Prometheus answered it, the request, the suggestion, the limit and the
 * quantiles. The two resources are two panels of the same
 * chart, side by side (one above the other when the page is narrow), and the figures are written above each panel, not on the plot, so nothing is drawn over
 * a line or a label. `pod` draws one Pod, `total` the sum of all the replicas.
 */
interface Props {
  mode: 'pod' | 'total';
  charts: Api.Overprovision.Chart[];
  /** the limit of one Pod by resource, when known */
  limits?: Partial<Record<Api.Overprovision.Resource, number>>;
  /** the P90, P95 and P99 of the use by resource: of one Pod in `pod`, of all the replicas in `total` */
  quantiles?: Partial<Record<Api.Overprovision.Resource, { p90: number; p95: number; p99: number }>>;
  /** the height of the plot of one panel */
  plotHeight?: number;
}
const props = withDefaults(defineProps<Props>(), { limits: () => ({}), quantiles: () => ({}), plotHeight: 250 });
const { t, locale } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

type Res = Api.Overprovision.Resource;
interface Panel {
  resource: Res;
  chart: Api.Overprovision.Chart;
  ts: number[];
  value: number[];
}
const unitOf = (resource: Res) => (resource === 'memory' ? 'bytes' : 'cores');
const nameOf = (resource: Res) => (resource === 'cpu' ? p('sectionCpu') : p('sectionMemory'));

const panels = computed<Panel[]>(() =>
  props.charts
    .map(chart => {
      const total = props.mode === 'total';
      return {
        resource: chart.resource,
        chart,
        ts: total ? (chart.total_ts ?? []) : chart.ts,
        value: total ? (chart.total ?? []) : chart.value
      };
    })
    .filter(panel => panel.ts.length > 0)
);
const hasData = computed(() => panels.value.length > 0);

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', confine: true },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);
const { width } = useElementSize(domRef);
const stacked = computed(() => width.value > 0 && width.value < 760);

const COLORS = {
  usage: '#2080f0',
  request: '#d03050',
  suggested: '#18a058',
  limit: '#f0a020',
  quantile: '#909399'
};

/** how many lines the legend takes in a chart as wide as this */
const legendRows = (names: number, w: number) => Math.max(1, Math.ceil((names * 118) / Math.max(w - 16, 200)));
const AXIS_BOTTOM = 22;
const GAP = 22;

/** the figures of one panel as a line of text above it */
function figures(panel: Panel) {
  const { resource, chart } = panel;
  const times = props.mode === 'total' ? Math.max(chart.replicas || 1, 1) : 1;
  const fmt = (value: number) => formatMetric(value, unitOf(resource));
  const out: string[] = [];
  if (chart.request > 0) out.push(`${p('chartRequest')} ${fmt(chart.request * times)}`);
  if (chart.suggested > 0) out.push(`${p('chartSuggested')} ${fmt(chart.suggested * times)}`);
  const limit = props.limits?.[resource] ?? 0;
  if (limit > 0) out.push(`${p('limit')} ${fmt(limit * times)}`);
  const q = props.quantiles?.[resource];
  if (q) out.push(`P90 ${fmt(q.p90)} · P95 ${fmt(q.p95)} · P99 ${fmt(q.p99)}`);
  return out.join('  |  ');
}

async function draw() {
  const list = panels.value;
  if (!list.length || !domRef.value) return;
  const w = Math.max(width.value, 320);
  const sideBySide = !stacked.value && list.length > 1;
  const panelW = sideBySide ? w / 2 : w;
  const total = props.mode === 'total';

  const names = new Set<string>();
  const series: Array<Record<string, unknown>> = [];
  const xAxis: Array<Record<string, unknown>> = [];
  const yAxis: Array<Record<string, unknown>> = [];
  const grid: Array<Record<string, unknown>> = [];
  const title: Array<Record<string, unknown>> = [];

  const subtexts = list.map(figures);
  const subtextLines = Math.max(
    ...subtexts.map(text => Math.max(1, Math.ceil((text.length * 6.2) / Math.max(panelW - 28, 160))))
  );
  const titleH = 24 + subtextLines * 15;
  const legendH = legendRows(10, w) * 22 + 6;
  const rowsOfPanels = sideBySide ? 1 : list.length;

  list.forEach((panel, i) => {
    const { resource, chart } = panel;
    const times = total ? Math.max(chart.replicas || 1, 1) : 1;
    const rowIndex = sideBySide ? 0 : i;
    const top = legendH + rowIndex * (titleH + props.plotHeight + AXIS_BOTTOM + GAP) + titleH;
    const colLeft = sideBySide ? (i === 0 ? 8 : '52%') : 8;
    const colRight = sideBySide ? (i === 0 ? '52%' : 14) : 14;
    grid.push({ top, height: props.plotHeight, left: colLeft, right: colRight, containLabel: true });
    title.push({
      text: nameOf(resource),
      subtext: subtexts[i],
      left: sideBySide ? (i === 0 ? 8 : '52%') : 8,
      top: top - titleH,
      itemGap: 3,
      textStyle: { fontSize: 13, fontWeight: 600 },
      subtextStyle: { fontSize: 11, lineHeight: 15, width: panelW - 28, overflow: 'break' }
    });
    const first = panel.ts[0] * 1000;
    const last = panel.ts[panel.ts.length - 1] * 1000;
    const spanMs = Math.max(last - first, 1);
    xAxis.push({
      type: 'time',
      gridIndex: i,
      min: first,
      max: last,
      axisLabel: { formatter: (value: number) => axisTimeLabelFor(value, spanMs), hideOverlap: true },
      splitLine: { show: false }
    });

    const id = (key: string) => `${resource}:${key}`;
    const line = (
      key: string,
      name: string,
      data: Array<[number, number | null]>,
      extra: Record<string, unknown> = {}
    ) => {
      names.add(name);
      series.push({ id: id(key), name, type: 'line', xAxisIndex: i, yAxisIndex: i, showSymbol: false, data, ...extra });
    };
    const points = (values: number[]) => panel.ts.map((ts, k) => [ts * 1000, values[k]] as [number, number]);
    const flat = (value: number) => [[first, value] as [number, number], [last, value] as [number, number]];

    line(
      'usage',
      t(total ? 'page.overprovision.chartTotalUsage' : 'page.overprovision.chartUsage'),
      points(panel.value),
      {
        lineStyle: { width: 1.6, color: COLORS.usage },
        itemStyle: { color: COLORS.usage },
        areaStyle: { opacity: 0.08, color: COLORS.usage }
      }
    );
    const dashed = (key: string, name: string, value: number, color: string, type = 'dashed') =>
      value > 0 &&
      line(key, name, flat(value), { lineStyle: { width: 1.2, type, color }, itemStyle: { color }, silent: true });
    dashed('request', p('chartRequest'), chart.request * times, COLORS.request);
    dashed('suggested', p('chartSuggested'), chart.suggested * times, COLORS.suggested);
    dashed('limit', p('limit'), (props.limits?.[resource] ?? 0) * times, COLORS.limit);
    const q = props.quantiles?.[resource];
    if (q) {
      dashed('p90', 'P90', q.p90, COLORS.quantile, 'dotted');
      dashed('p95', 'P95', q.p95, COLORS.quantile, 'dotted');
      dashed('p99', 'P99', q.p99, COLORS.quantile, 'dotted');
    }

    const all = [
      ...panel.value,
      chart.request * times,
      chart.suggested * times,
      (props.limits?.[resource] ?? 0) * times,
      ...(q ? [q.p99] : [])
    ].filter(v => Number.isFinite(v) && v > 0);
    const axis = valueAxisFor(unitOf(resource), all);
    // a size in bytes has its ticks on round numbers of its unit: the top is the next one up, so no odd figure is written at the top of the axis
    const interval = 'interval' in axis ? (axis.interval as number | undefined) : undefined;
    yAxis.push({
      type: 'value',
      gridIndex: i,
      scale: false,
      min: 0,
      max: interval ? Math.ceil(Math.max(...all, 0) / interval) * interval : undefined,
      splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      ...axis,
      name: ''
    });
  });

  const totalHeight = legendH + rowsOfPanels * (titleH + props.plotHeight + AXIS_BOTTOM) + (rowsOfPanels - 1) * GAP + 6;
  if (domRef.value) domRef.value.style.height = `${totalHeight}px`;

  await updateOptions(
    opts =>
      ({
        ...opts,
        legend: {
          type: 'plain',
          top: 0,
          left: 8,
          right: 8,
          itemWidth: 16,
          itemHeight: 8,
          itemGap: 12,
          textStyle: { fontSize: 11 },
          data: [...names]
        },
        title,
        grid,
        xAxis,
        yAxis,
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: list.map((_, i) => i),
            zoomOnMouseWheel: 'shift',
            moveOnMouseMove: true,
            filterMode: 'none'
          }
        ],
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        tooltip: {
          trigger: 'axis',
          confine: true,
          transitionDuration: 0,
          formatter: (params: unknown) => {
            const items = (Array.isArray(params) ? params : [params]) as Array<{
              axisValue?: number;
              seriesId?: string;
              seriesName?: string;
              marker?: string;
              value?: unknown;
            }>;
            if (!items.length) return '';
            const rows = [`<b>${formatDateTime(Number(items[0].axisValue))}</b>`];
            for (const item of items) {
              const raw = Array.isArray(item.value) ? item.value[1] : item.value;
              if (raw === null || raw === undefined) continue;
              const resource = (item.seriesId ?? '').split(':')[0] as Res;
              const label = list.length > 1 ? `${nameOf(resource)} · ${item.seriesName}` : item.seriesName;
              rows.push(`${item.marker ?? ''}${label}: ${formatMetric(Number(raw), unitOf(resource))}`);
            }
            return rows.join('<br/>');
          }
        },
        series: series as never
      }) as ECOption
  );
}

watch(() => [props.charts, props.limits, props.quantiles, props.mode, props.plotHeight], draw, {
  flush: 'post',
  deep: false
});
watch([locale, stacked, width], draw, { flush: 'post' });
onMounted(draw);
</script>

<template>
  <div>
    <NEmpty v-if="!hasData" class="h-120px justify-center" :description="t('page.overprovision.noData')" />
    <div v-show="hasData" ref="domRef" class="w-full" style="height: 420px"></div>
  </div>
</template>
