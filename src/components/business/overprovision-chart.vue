<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { valueAxisFor } from '@/utils/chart-axis';
import { axisTimeLabel, axisTooltip } from '@/utils/date';
import { formatMetric } from '@/utils/format';

defineOptions({ name: 'OverprovisionChart' });

/**
 * The use of one Pod over the window with its moving averages (MA5, MA15, MA25, each labelled with the step of a point: MA5@1m is five
 * minutes), and the request and the suggestion as lines. It draws what the analysis was made from.
 */
interface Props {
  chart: Api.Overprovision.Chart | null | undefined;
  height?: number;
  /** the limit of the Pod, drawn as a line when it is known */
  limit?: number;
  /** the P90, P95 and P99 of the use over the window, drawn as thin lines */
  quantiles?: { p90: number; p95: number; p99: number };
}

const props = withDefaults(defineProps<Props>(), { height: 220, limit: 0, quantiles: undefined });
const { t, locale } = useI18n();

const unit = computed(() => (props.chart?.resource === 'memory' ? 'bytes' : 'cores'));
const hasData = computed(() => Boolean(props.chart?.ts.length));

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', confine: true },
      legend: { type: 'scroll', top: 0 },
      grid: { left: 64, right: 24, top: 36, bottom: 28 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', scale: true },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const c = props.chart;
  if (!c || !c.ts.length) return;
  const line = (name: string, values: number[], extra: Record<string, unknown> = {}) => ({
    name,
    type: 'line',
    showSymbol: false,
    data: c.ts.map((ts, i) => [ts * 1000, values[i]]),
    ...extra
  });
  const marks = [
    c.request > 0 && {
      yAxis: c.request,
      name: t('page.overprovision.chartRequest'),
      lineStyle: { color: '#d03050', type: 'dashed' }
    },
    c.suggested > 0 && {
      yAxis: c.suggested,
      name: t('page.overprovision.chartSuggested'),
      lineStyle: { color: '#18a058', type: 'dashed' }
    },
    (props.limit ?? 0) > 0 && {
      yAxis: props.limit,
      name: t('page.overprovision.limit'),
      lineStyle: { color: '#f0a020', type: 'dashed' }
    },
    ...(props.quantiles
      ? (['p90', 'p95', 'p99'] as const).map(key => ({
          yAxis: props.quantiles![key],
          name: key.toUpperCase(),
          lineStyle: { color: '#909399', type: 'dotted', width: 1 },
          label: { position: 'insideStartTop', fontSize: 10 }
        }))
      : [])
  ].filter(Boolean);
  const series = [
    line(t('page.overprovision.chartUsage'), c.value, {
      lineStyle: { width: 1.5 },
      areaStyle: { opacity: 0.08 },
      markLine: { symbol: 'none', silent: true, label: { formatter: '{b}', position: 'insideEndTop' }, data: marks }
    }),
    line(c.ma_labels[0], c.ma5, { lineStyle: { width: 1 } }),
    line(c.ma_labels[1], c.ma15, { lineStyle: { width: 1 } }),
    line(c.ma_labels[2], c.ma25, { lineStyle: { width: 1 } })
  ];
  const all = [...c.value, c.request, c.suggested, props.limit ?? 0].filter(v => Number.isFinite(v) && v > 0);
  await updateOptions(opts => ({
    ...opts,
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: axisTooltip((value: unknown) => formatMetric(Number(value), unit.value))
    },
    yAxis: {
      type: 'value',
      scale: false,
      min: 0,
      max: Math.max(...all, 0) * 1.08 || undefined,
      ...valueAxisFor(unit.value, all)
    },
    series: series as never
  }));
}

watch(() => [props.chart, props.limit, props.quantiles], draw, { flush: 'post' });
watch(locale, draw);
onMounted(draw);
</script>

<template>
  <div>
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="t('page.overprovision.noData')"
    />
    <div v-show="hasData" ref="domRef" :style="{ height: `${height}px` }" class="w-full"></div>
  </div>
</template>
