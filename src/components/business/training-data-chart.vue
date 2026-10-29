<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NEmpty, NSpin, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { fetchGetTrainingData } from '@/service/api';
import { axisTimeLabel, axisTooltip } from '@/utils/date';
import { formatMetric } from '@/utils/format';

defineOptions({ name: 'TrainingDataChart' });

/**
 * What one training record worked on: the stored samples of its history window (the data that went in) and the forecast it
 * wrote (what came out), on one time axis.
 */
const props = defineProps<{ runId: number }>();
const { t } = useI18n();

const loading = ref(false);
const data = ref<Api.Forecast.TrainingData | null>(null);
const hasData = computed(() => Boolean(data.value?.input.length || data.value?.forecast.length));

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', confine: true, formatter: axisTooltip() },
      legend: { top: 4, left: 8 },
      grid: { left: 72, right: 24, top: 56, bottom: 80 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 28, bottom: 12 }],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const unit = data.value?.unit || '';
  const pair = (list: Api.Forecast.TrainingPoint[]) => list.map(p => [new Date(p.time).getTime(), p.value]);
  await updateOptions(opts => ({
    ...opts,
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: axisTooltip((value: unknown) => formatMetric(Number(value), unit))
    },
    yAxis: { type: 'value', scale: true, name: unit },
    series: [
      {
        name: t('page.forecast.runs.dataInput'),
        type: 'line',
        showSymbol: (data.value?.input.length || 0) < 80,
        lineStyle: { width: 2 },
        data: pair(data.value?.input || [])
      },
      {
        name: t('page.forecast.runs.dataForecast'),
        type: 'line',
        showSymbol: (data.value?.forecast.length || 0) < 80,
        lineStyle: { width: 2, type: 'dashed' },
        data: pair(data.value?.forecast || [])
      }
    ] as never
  }));
}

async function load() {
  loading.value = true;
  try {
    const { data: result, error } = await fetchGetTrainingData(props.runId);
    data.value = error ? null : result;
    await draw();
  } finally {
    loading.value = false;
  }
}

watch(() => props.runId, load);
onMounted(load);
</script>

<template>
  <NSpin :show="loading">
    <div class="mb-8px flex flex-wrap items-center gap-8px text-13px">
      <NTag size="small" :bordered="false">{{ t('page.forecast.runs.dataInput') }} {{ data?.input.length ?? 0 }}</NTag>
      <NTag size="small" :bordered="false" type="info">
        {{ t('page.forecast.runs.dataForecast') }} {{ data?.forecast.length ?? 0 }}
      </NTag>
      <span class="opacity-65">{{ t('page.forecast.runs.dataHelp') }}</span>
    </div>
    <NEmpty
      v-if="!hasData && !loading"
      class="h-320px justify-center"
      :description="t('page.forecast.runs.dataEmpty')"
    />
    <div v-show="hasData" ref="domRef" class="h-360px w-full"></div>
  </NSpin>
</template>
