<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { axisTimeLabel, axisTooltip } from '@/utils/date';

defineOptions({ name: 'InventoryTrendChart' });

/**
 * A count over the time of the reports of the operator: the nodes and those that are ready, or the replicas of a workload and the bounds of its HPA.
 * Counts are whole numbers: the axis never shows a half node.
 */
export interface TrendSeries {
  name: string;
  /** [time in ms, count]; a null count leaves a gap */
  data: Array<[number, number | null]>;
  /** a line that is a bound or a setting, drawn dashed */
  dashed?: boolean;
  /** the count holds until the next report: drawn as steps */
  step?: boolean;
}

interface Props {
  series: TrendSeries[];
  height?: number;
  empty: string;
}

const props = withDefaults(defineProps<Props>(), { height: 170 });
const { locale } = useI18n();

const hasData = computed(() => props.series.some(item => item.data.some(point => point[1] !== null)));

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', confine: true },
      legend: { type: 'scroll', top: 0 },
      grid: { left: 44, right: 24, top: 34, bottom: 28 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', min: 0, minInterval: 1 },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  if (!hasData.value) return;
  await updateOptions(opts => ({
    ...opts,
    tooltip: { trigger: 'axis', confine: true, formatter: axisTooltip((value: unknown) => String(value ?? '-')) },
    series: props.series.map(item => ({
      name: item.name,
      type: 'line',
      step: item.step ? 'end' : false,
      showSymbol: item.data.length < 40,
      data: item.data,
      lineStyle: { width: 1.5, type: item.dashed ? 'dashed' : 'solid' }
    })) as never
  }));
}

watch(() => props.series, draw, { flush: 'post', deep: true });
watch(locale, draw);
onMounted(draw);
</script>

<template>
  <div>
    <NEmpty v-if="!hasData" :style="{ height: `${height}px` }" class="justify-center" :description="empty" />
    <div v-show="hasData" ref="domRef" :style="{ height: `${height}px` }" class="w-full"></div>
  </div>
</template>
