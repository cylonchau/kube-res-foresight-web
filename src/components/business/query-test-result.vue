<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NEmpty, NSpace, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { fetchTestMetricQuery } from '@/service/api';
import { valueAxisFor } from '@/utils/chart-axis';
import { formatMetric } from '@/utils/format';
import { gapPairs, withBreaks } from '@/utils/series-gaps';

defineOptions({ name: 'QueryTestResult' });

/** The query as it stands in the form beside this block: the test runs exactly this, nothing is asked again. */
export interface QueryConfig {
  datasource_id: number | null;
  query: string;
  level: string;
  metric: string;
  unit: string;
  step_seconds: number;
  scale: number;
  precision: number;
}

interface Props {
  config: QueryConfig;
  /** the module whose workload fills the variables of the template ({{namespace}}, {{workload}}, ...) */
  moduleId?: number | null;
  /** values for the variables when no module is chosen, so a template can be tried before any module exists */
  sample?: Partial<Record<'namespace' | 'workload' | 'container' | 'service', string>>;
  height?: number;
}

const props = withDefaults(defineProps<Props>(), { moduleId: null, height: 240 });
const emit = defineEmits<{ tested: [ok: boolean] }>();
const { t } = useI18n();

const range = ref(lastHours(1));
const running = ref(false);
const result = ref<Api.Forecast.QueryTestResult | null>(null);

const unit = computed(() => props.config.unit || (props.config.metric === 'custom' ? 'value' : ''));
const stageType = computed(() =>
  result.value?.stage === 'ok' ? 'success' : result.value?.stage === 'empty' ? 'warning' : 'error'
);

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis' },
      grid: { left: 64, right: 24, top: 24, bottom: 36 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }],
      series: [{ type: 'line', showSymbol: false, data: [] as Array<[number, number]> }]
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const points = result.value?.points || [];
  const step = props.config.step_seconds || 60;
  await updateOptions(opts => ({
    ...opts,
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => formatMetric(Number(value), unit.value) },
    yAxis: {
      type: 'value',
      scale: true,
      ...valueAxisFor(
        unit.value,
        points.map(p => p.value)
      )
    },
    series: [
      {
        type: 'line',
        // small points where the line is sparse; the nearest one grows under the pointer
        showSymbol: points.length <= 30,
        symbolSize: 2,
        // a curve through the points that never overshoots them, with a break where the query returned nothing
        smooth: true,
        smoothMonotone: 'x',
        lineStyle: { width: 1.5 },
        emphasis: { scale: 2.4 },
        data: withBreaks(
          points,
          step,
          p => new Date(p.time).getTime(),
          p => [new Date(p.time).getTime(), p.value],
          at => [at, null]
        )
      },
      // the stretch with no data: a dashed amber line joins its two sides. It is no value and is not in the tooltip.
      {
        type: 'line',
        silent: true,
        showSymbol: false,
        tooltip: { show: false },
        z: 1,
        lineStyle: { width: 1.5, type: [5, 4], color: '#e6a23c' },
        itemStyle: { color: '#e6a23c' },
        data: gapPairs(
          points,
          step,
          p => new Date(p.time).getTime(),
          p => p.value
        ).flatMap(pair => [pair.from, pair.to, [pair.to[0], null]])
      }
    ] as never
  }));
}

function sampleValues() {
  const out: Record<string, string> = {};
  Object.entries(props.sample || {}).forEach(([key, value]) => {
    if (value?.trim()) out[key] = value.trim();
  });
  return out;
}

/** Runs the query of the form against its datasource and shows what came back. */
async function run() {
  const c = props.config;
  if (!c.datasource_id || !c.query.trim()) {
    result.value = {
      ok: false,
      stage: 'template',
      error: t('page.monitoring.queryTest.required'),
      samples: 0,
      min: 0,
      max: 0,
      mean: 0,
      last: 0,
      points: [],
      from: '',
      to: ''
    };
    emit('tested', false);
    return;
  }
  running.value = true;
  try {
    const { data, error } = await fetchTestMetricQuery({
      datasource_id: c.datasource_id,
      query: c.query,
      level: c.level,
      metric: c.metric,
      unit: c.metric === 'custom' ? c.unit : undefined,
      step_seconds: c.step_seconds,
      module_id: props.moduleId ?? undefined,
      ...(props.moduleId ? {} : sampleValues()),
      scale: c.scale,
      precision: c.precision,
      ...rangeParams(range.value)
    });
    if (error || !data) return;
    result.value = data;
    emit('tested', data.ok);
    await draw();
  } finally {
    running.value = false;
  }
}

/** A changed query is no longer what was tested: the old result is dropped. */
watch(
  () => [props.config.datasource_id, props.config.query, props.config.level, props.config.step_seconds],
  () => {
    result.value = null;
  }
);

defineExpose({ run });
</script>

<template>
  <div class="query-test">
    <NSpace align="center" class="mb-8px">
      <NButton type="primary" size="small" :loading="running" @click="run">
        {{ t('page.monitoring.queryTest.run') }}
      </NButton>
      <TimeRangeField v-model="range" :clearable="false" />
      <NTag v-if="result" size="small" :bordered="false" :type="stageType">
        {{ t(`page.monitoring.queryTest.stage_${result.stage}`) }}
      </NTag>
      <template v-if="result?.ok">
        <NTag size="small" :bordered="false">{{ t('page.monitoring.queryTest.samples') }} {{ result.samples }}</NTag>
        <NTag size="small" :bordered="false">
          {{ t('page.forecast.metrics.min') }} {{ formatMetric(result.min, unit) }}
        </NTag>
        <NTag size="small" :bordered="false">
          {{ t('page.forecast.metrics.max') }} {{ formatMetric(result.max, unit) }}
        </NTag>
        <NTag size="small" :bordered="false">
          {{ t('page.forecast.metrics.mean') }} {{ formatMetric(result.mean, unit) }}
        </NTag>
        <NTag size="small" :bordered="false">
          {{ t('page.forecast.metrics.last') }} {{ formatMetric(result.last, unit) }}
        </NTag>
      </template>
    </NSpace>
    <NAlert
      v-if="result && !result.ok"
      :type="result.stage === 'empty' ? 'warning' : 'error'"
      :show-icon="false"
      class="mb-8px"
    >
      <div class="whitespace-pre-wrap break-all">{{ result.error }}</div>
    </NAlert>
    <div v-if="result?.rendered" class="mb-8px break-all font-mono text-12px opacity-70">{{ result.rendered }}</div>
    <div v-show="result?.ok" ref="domRef" :style="{ height: `${height}px` }" class="w-full"></div>
    <NEmpty v-if="!result" size="small" :description="t('page.monitoring.queryTest.hint')" />
  </div>
</template>
