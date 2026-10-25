<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NTag
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TimeRangeField from '@/components/business/time-range-field.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { fetchGetDatasourceOptions, fetchGetMetricCatalog, fetchTestMetricQuery } from '@/service/api';
import { formatDecimal, formatMetric } from '@/utils/format';

defineOptions({ name: 'PromqlTester' });

/** What the dialog edits: the PromQL of a dataset metric and how its values are shaped. */
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
  initial: Partial<QueryConfig>;
  /** the dialog only checks the query: there is nothing to apply (a metric that is already saved) */
  testOnly?: boolean;
  /** the module whose workload fills the variables of the template ({{namespace}}, {{workload}}, ...) */
  moduleId?: number | null;
}

const props = withDefaults(defineProps<Props>(), { moduleId: null, testOnly: false });
const emit = defineEmits<{ apply: [config: QueryConfig] }>();
const show = defineModel<boolean>('show', { required: true });

const { t } = useI18n();
const { moduleOptions, loadModules } = useForecastModules();

const form = reactive<QueryConfig & { module_id: number | null; range: [number, number] | null }>({
  datasource_id: null,
  query: '',
  level: 'workload',
  metric: 'custom',
  unit: '',
  step_seconds: 60,
  scale: 1,
  precision: 6,
  module_id: null,
  range: lastHours(1)
});
const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const catalog = ref<Api.Datasource.MetricCatalog>({
  metrics: [],
  levels: [],
  variables: [],
  min_step_seconds: 15,
  max_step_seconds: 3600
});
const running = ref(false);
const result = ref<Api.Forecast.QueryTestResult | null>(null);
/** the query that was tested: a changed query has to be tested again before it is used */
const tested = ref('');

const datasourceOptions = computed(() => datasources.value.map(item => ({ label: item.name, value: item.id })));
const metricOptions = computed(() =>
  catalog.value.metrics.map(item => ({
    label: `${t(`page.datasource.mappings.metric_${item.metric}`)} (${item.unit})`,
    value: item.metric
  }))
);
const levelOptions = computed(() =>
  catalog.value.levels.map(item => ({ label: t(`page.datasource.mappings.level_${item.level}`), value: item.level }))
);
/** the template variables as they are written in a query */
const variableList = computed(() => catalog.value.variables.map(name => '{{' + name + '}}').join(' '));
const kindUnit = computed(() => catalog.value.metrics.find(item => item.metric === form.metric)?.unit || '');
const unit = computed(() => (form.metric === 'custom' ? form.unit || 'value' : kindUnit.value));
const fingerprint = () =>
  JSON.stringify([
    form.datasource_id,
    form.query,
    form.level,
    form.metric,
    form.unit,
    form.step_seconds,
    form.scale,
    form.precision,
    form.module_id
  ]);
const canApply = computed(() => Boolean(result.value?.ok) && tested.value === fingerprint());

const stageType = computed(() =>
  result.value?.stage === 'ok' ? 'success' : result.value?.stage === 'empty' ? 'warning' : 'error'
);

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis' },
      grid: { left: 64, right: 24, top: 24, bottom: 48 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', scale: true },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16 }],
      series: [{ type: 'line', showSymbol: false, data: [] as Array<[number, number]> }]
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function draw() {
  const points = result.value?.points || [];
  await updateOptions(opts => ({
    ...opts,
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => formatMetric(Number(value), unit.value) },
    yAxis: {
      type: 'value',
      scale: true,
      name: unit.value,
      axisLabel: { formatter: (value: number) => formatDecimal(value, 3) }
    },
    series: [
      { type: 'line', showSymbol: points.length < 60, data: points.map(p => [new Date(p.time).getTime(), p.value]) }
    ] as never
  }));
}

async function run() {
  if (!form.datasource_id || !form.query.trim()) {
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
    return;
  }
  running.value = true;
  try {
    const { data, error } = await fetchTestMetricQuery({
      datasource_id: form.datasource_id,
      query: form.query,
      level: form.level,
      metric: form.metric,
      unit: form.metric === 'custom' ? form.unit : undefined,
      step_seconds: form.step_seconds,
      module_id: form.module_id ?? undefined,
      scale: form.scale,
      precision: form.precision,
      ...rangeParams(form.range)
    });
    if (error || !data) return;
    result.value = data;
    tested.value = fingerprint();
    await draw();
  } finally {
    running.value = false;
  }
}

function apply() {
  emit('apply', {
    datasource_id: form.datasource_id,
    query: form.query.trim(),
    level: form.level,
    metric: form.metric,
    unit: form.unit,
    step_seconds: form.step_seconds,
    scale: form.scale,
    precision: form.precision
  });
  show.value = false;
}

watch(show, async visible => {
  if (!visible) return;
  result.value = null;
  tested.value = '';
  Object.assign(form, {
    datasource_id: props.initial.datasource_id ?? null,
    query: props.initial.query ?? '',
    level: props.initial.level || 'workload',
    metric: props.initial.metric || 'custom',
    unit: props.initial.unit ?? '',
    step_seconds: props.initial.step_seconds || 60,
    scale: props.initial.scale || 1,
    precision: props.initial.precision ?? 6,
    module_id: props.moduleId ?? null,
    range: lastHours(1)
  });
  const [options, metricCatalog] = await Promise.all([
    fetchGetDatasourceOptions(),
    fetchGetMetricCatalog(),
    loadModules()
  ]);
  datasources.value = options.data || [];
  if (metricCatalog.data) catalog.value = metricCatalog.data;
  if (!form.datasource_id && datasources.value.length === 1) form.datasource_id = datasources.value[0].id;
});
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="t('page.monitoring.queryTest.title')" class="w-980px max-w-95vw">
    <div class="tester max-h-72vh overflow-y-auto pr-8px">
      <NForm :model="form" label-placement="top" class="tester__form">
        <NFormItem :label="t('page.datasource.mappings.datasource')">
          <NSelect v-model:value="form.datasource_id" filterable :options="datasourceOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.monitoring.queryTest.module') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.monitoring.queryTest.moduleHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect v-model:value="form.module_id" clearable filterable :options="moduleOptions" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.metric')">
          <NSelect v-model:value="form.metric" :options="metricOptions" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.level')">
          <NSelect v-model:value="form.level" :options="levelOptions" />
        </NFormItem>
        <NFormItem v-if="form.metric === 'custom'" :label="t('page.monitoring.datasets.unit')">
          <NInput v-model:value="form.unit" :placeholder="t('page.monitoring.datasets.unitPlaceholder')" />
        </NFormItem>
        <NFormItem v-else :label="t('page.monitoring.datasets.unit')">
          <NInput :value="kindUnit" readonly />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.step')">
          <NInputNumber
            v-model:value="form.step_seconds"
            :min="catalog.min_step_seconds"
            :max="catalog.max_step_seconds"
            class="w-full"
          />
        </NFormItem>
        <NFormItem :label="t('page.monitoring.datasets.scale')">
          <NInputNumber v-model:value="form.scale" :min="0.000000000001" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.monitoring.datasets.precision')">
          <NInputNumber v-model:value="form.precision" :min="0" :max="12" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem class="tester__wide" :label="t('common.timeRange')">
          <TimeRangeField v-model="form.range" :clearable="false" />
        </NFormItem>
        <NFormItem class="tester__wide">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              PromQL
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">
                  {{ t('page.monitoring.queryTest.queryHint') }}
                  <div class="mt-4px font-mono text-12px">
                    {{ variableList }}
                  </div>
                </div>
              </IconTooltip>
            </span>
          </template>
          <NInput
            v-model:value="form.query"
            type="textarea"
            :rows="5"
            class="font-mono"
            :placeholder="t('page.monitoring.datasets.queryHint')"
          />
        </NFormItem>
      </NForm>

      <NSpace align="center" class="mb-8px">
        <NButton type="primary" :loading="running" @click="run">{{ t('page.monitoring.queryTest.run') }}</NButton>
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
      <div v-show="result?.ok" ref="domRef" class="h-260px w-full"></div>
      <NEmpty v-if="!result" :description="t('page.monitoring.queryTest.hint')" />
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="show = false">{{ t('common.cancel') }}</NButton>
        <NButton v-if="!testOnly" type="primary" :disabled="!canApply" @click="apply">
          {{ t('page.monitoring.queryTest.apply') }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.tester__form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 16px;
}
.tester__wide {
  grid-column: 1 / -1;
}
@media (max-width: 900px) {
  .tester__form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
