<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { NEmpty } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { valueAxisFor } from '@/utils/chart-axis';
import { axisTimeLabel, axisTooltip } from '@/utils/date';
import { formatMetric } from '@/utils/format';

defineOptions({ name: 'OverprovisionHistoryChart' });

/**
 * The history of the analysis of one resource: for every stored result of the window, the P90, P95 and P99 of the use, the request and the
 * suggestion, over the time the analysis was made. It shows how the use and the advice moved from one analysis to the next.
 */
interface Props {
  rows: Api.Overprovision.Stored[];
  resource: Api.Overprovision.Resource;
  height?: number;
}

const props = withDefaults(defineProps<Props>(), { height: 200 });
const { t, locale } = useI18n();

const unit = computed(() => (props.resource === 'memory' ? 'bytes' : 'cores'));
// the rows come newest first; a line goes from the oldest to the newest
const ordered = computed(() =>
  props.rows
    .filter(row => row.resource === props.resource)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
);
const hasData = computed(() => ordered.value.length > 0);

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', confine: true },
      legend: { type: 'scroll', top: 0 },
      grid: { left: 64, right: 24, top: 36, bottom: 28 },
      xAxis: { type: 'time', axisLabel: { formatter: axisTimeLabel } },
      yAxis: { type: 'value', scale: false, min: 0 },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const rows = ordered.value;
  if (!rows.length) return;
  const line = (
    name: string,
    pick: (row: Api.Overprovision.Stored) => number | null,
    extra: Record<string, unknown> = {}
  ) => ({
    name,
    type: 'line',
    showSymbol: rows.length < 40,
    data: rows.map(row => [new Date(row.created_at).getTime(), pick(row)]),
    lineStyle: { width: 1.5 },
    ...extra
  });
  const series = [
    line('P90', row => row.p90),
    line('P95', row => row.p95),
    line('P99', row => row.p99),
    line(t('page.overprovision.request'), row => row.request, { lineStyle: { width: 1.5, type: 'dashed' } }),
    line(t('page.overprovision.suggested'), row => (row.suggested > 0 ? row.suggested : null), {
      lineStyle: { width: 1.5, type: 'dashed' }
    })
  ];
  const all = rows.flatMap(row => [row.p99, row.request, row.suggested]).filter(v => Number.isFinite(v) && v > 0);
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

watch(ordered, draw, { flush: 'post' });
watch(locale, draw);
onMounted(draw);
</script>

<template>
  <div>
    <NEmpty
      v-if="!hasData"
      :style="{ height: `${height}px` }"
      class="justify-center"
      :description="t('page.overprovision.historyEmpty')"
    />
    <div v-show="hasData" ref="domRef" :style="{ height: `${height}px` }" class="w-full"></div>
  </div>
</template>
