<script setup lang="ts">
import { computed, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { axisTimeLabel, axisTooltip } from '@/utils/date';
import { type MetricResult, seriesName } from '@/utils/metric-series';

defineOptions({ name: 'MetricSeriesChart' });

interface Props {
  results: MetricResult[];
  height?: number;
}

const props = withDefaults(defineProps<Props>(), { height: 360 });
const { t, locale } = useI18n();

const text = (value: { zh: string; en: string }) => (locale.value === 'en-US' ? value.en : value.zh);
const hasData = computed(() => props.results.some(item => item.result.series.some(series => series.points.length)));

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      tooltip: { trigger: 'axis', formatter: axisTooltip() },
      legend: { type: 'scroll', top: 0 },
      grid: { left: 64, right: 24, top: 40, bottom: 56 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const series = props.results.flatMap(({ def, result, actual }) =>
    result.series.map(item => ({
      name: seriesName(def, item.labels, actual, t('page.forecast.metrics.actual'), text(def.help)),
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      lineStyle: actual ? { type: 'dashed', width: 2 } : undefined,
      data: item.points.map(point => [point.ts * 1000, point.value])
    }))
  );
  const unit = props.results[0]?.result.unit || '';
  await updateOptions(opts => ({
    ...opts,
    yAxis: { type: 'value', scale: true, name: unit },
    series: series as never
  }));
}

watch(() => props.results, draw);
watch(locale, draw);
</script>

<template>
  <div>
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="t('page.forecast.metrics.empty')"
    />
    <div v-show="hasData" ref="domRef" :style="{ height: `${height}px` }" class="min-h-280px w-full"></div>
  </div>
</template>
