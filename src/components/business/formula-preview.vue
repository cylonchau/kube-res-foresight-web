<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';

defineOptions({ name: 'FormulaPreview' });

interface Props {
  history: number[];
  forecast: number[];
  height?: number;
}

const props = withDefaults(defineProps<Props>(), { height: 220 });
const { t, locale } = useI18n();

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 48, right: 16, top: 32, bottom: 24 },
      xAxis: { type: 'category', name: t('page.forecast.algorithms.formula.stepAxis') },
      yAxis: { type: 'value', scale: true },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const n = props.history.length;
  const labels = Array.from({ length: n + props.forecast.length }, (_, i) => i - n + 1);
  await updateOptions(opts => ({
    ...opts,
    xAxis: { type: 'category', data: labels, name: t('page.forecast.algorithms.formula.stepAxis') },
    series: [
      { name: t('page.forecast.algorithms.formula.history'), type: 'line', showSymbol: false, data: props.history },
      {
        name: t('page.forecast.algorithms.formula.forecast'),
        type: 'line',
        showSymbol: false,
        lineStyle: { type: 'dashed' },
        data: [...Array(Math.max(n - 1, 0)).fill(null), props.history[n - 1], ...props.forecast]
      }
    ] as never
  }));
}

watch(() => [props.history, props.forecast], draw, { deep: true });
watch(locale, draw);
</script>

<template>
  <div ref="domRef" :style="{ height: `${height}px` }" class="w-full"></div>
</template>
