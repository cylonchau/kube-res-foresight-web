<script setup lang="ts">
import { computed, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { formatDecimal, formatMetric } from '@/utils/format';

defineOptions({ name: 'CompareChart' });

interface Props {
  /** actual values (candles) of the metric, read from Prometheus */
  actual: Api.Forecast.LiveSeries | null;
  /** actual replica count of the same workload, when the module has a replica source */
  actualReplicas?: Api.Forecast.LiveSeries | null;
  /** the forecasts of every algorithm, with the replicas each needs */
  algorithms: Array<{ algorithm_id: string; points: Api.Forecast.ComparePoint[] }>;
  unit: string;
  height?: number;
  /** draw the actual values as candles (K line) or as a line */
  candle?: boolean;
}

const props = withDefaults(defineProps<Props>(), { actualReplicas: null, height: 420, candle: true });
const { t } = useI18n();

const hasData = computed(() => Boolean(props.actual?.candles.length) || props.algorithms.some(a => a.points.length));
const time = (iso: string) => new Date(iso).getTime();
const stamp = (ms: number) => new Date(ms).toLocaleString();

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { type: 'scroll', top: 0 },
      toolbox: { right: 8, feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: {} } },
      grid: [{ left: 72, right: 72, top: 48, bottom: 72 }],
      xAxis: { type: 'time' },
      yAxis: [
        { type: 'value', scale: true },
        { type: 'value', scale: true, minInterval: 1, splitLine: { show: false } }
      ],
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20 }],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const series: Record<string, unknown>[] = [];
  const names = {
    actual: t('page.forecast.compare.actual'),
    replicasActual: t('page.forecast.compare.actualReplicas')
  };
  if (props.actual?.candles.length) {
    series.push(
      props.candle
        ? {
            name: names.actual,
            type: 'candlestick',
            // the candle is the summary of the bucket Prometheus returned: open, close, lowest and highest value
            data: props.actual.candles.map(c => [time(c.time), c.open, c.close, c.low, c.high]),
            encode: { x: 0, y: [1, 2, 3, 4] },
            itemStyle: { color: '#e5534b', color0: '#2f9e6e', borderColor: '#e5534b', borderColor0: '#2f9e6e' }
          }
        : {
            name: names.actual,
            type: 'line',
            showSymbol: false,
            lineStyle: { width: 2 },
            data: props.actual.candles.map(c => [time(c.time), c.mean])
          }
    );
  }
  for (const alg of props.algorithms) {
    series.push({
      name: alg.algorithm_id,
      type: 'line',
      showSymbol: alg.points.length < 80,
      symbolSize: 5,
      lineStyle: { width: 2, type: 'dashed' },
      // value, time the forecast was made, replicas it needs
      data: alg.points.map(p => ({ value: [time(p.time), p.value], predictedAt: p.predicted_at, replicas: p.replicas }))
    });
  }
  if (props.actualReplicas?.candles.length) {
    series.push({
      name: names.replicasActual,
      type: 'line',
      step: 'end',
      yAxisIndex: 1,
      showSymbol: false,
      lineStyle: { width: 1.5, color: '#8a95a5' },
      itemStyle: { color: '#8a95a5' },
      data: props.actualReplicas.candles.map(c => [time(c.time), c.close])
    });
  }
  await updateOptions(opts => ({
    ...opts,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      confine: true,
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const at = list[0]?.axisValue ?? list[0]?.value?.[0];
        const rows = [`<b>${stamp(Number(at))}</b>`];
        for (const p of list) {
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
            rows.push(
              `${p.marker}${p.seriesName}: ${t('page.forecast.compare.predicted')} ${formatMetric(raw.value[1], props.unit)}${rep} <span style="opacity:.6">(${t('page.forecast.compare.predictedAt')} ${stamp(time(raw.predictedAt))})</span>`
            );
          } else {
            rows.push(`${p.marker}${p.seriesName}: ${formatMetric(Array.isArray(raw) ? raw[1] : p.value, props.unit)}`);
          }
        }
        return rows.join('<br/>');
      }
    },
    yAxis: [
      { type: 'value', scale: true, name: props.unit, axisLabel: { formatter: (v: number) => formatDecimal(v, 3) } },
      {
        type: 'value',
        scale: true,
        minInterval: 1,
        name: t('page.forecast.compare.replicas'),
        splitLine: { show: false },
        show: Boolean(props.actualReplicas?.candles.length)
      }
    ],
    series: series as never
  }));
}

watch(() => [props.actual, props.actualReplicas, props.algorithms, props.candle, props.unit], draw, { deep: false });
</script>

<template>
  <div>
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="t('page.forecast.compare.empty')"
    />
    <div v-show="hasData" ref="domRef" :style="{ height: `${height}px` }" class="min-h-280px w-full"></div>
  </div>
</template>
