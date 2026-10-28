<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { NButton, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import HelpLabel from '@/components/common/help-label.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import QueryTestResult, { type QueryConfig } from '@/components/business/query-test-result.vue';
import { useForecastModules } from '@/hooks/business/use-forecast-modules';
import { fetchGetDatasourceOptions, fetchGetMetricCatalog } from '@/service/api';

defineOptions({ name: 'PromqlTester' });

interface Props {
  initial: Partial<QueryConfig>;
  /** the module whose workload fills the variables of the template ({{namespace}}, {{workload}}, ...) */
  moduleId?: number | null;
  /** run the query as soon as the dialog opens: a metric that is already saved only needs to be looked at */
  autoRun?: boolean;
}

const props = withDefaults(defineProps<Props>(), { moduleId: null, autoRun: false });
const show = defineModel<boolean>('show', { required: true });

const { t } = useI18n();
const { moduleOptions, loadModules } = useForecastModules();

/**
 * The metric preview: the query of a metric (or any query typed here) is run against Prometheus and the values are shown.
 * Nothing is saved from here; the datasets page edits and tests a query in its own form.
 */
const form = reactive<QueryConfig & { module_id: number | null }>({
  datasource_id: null,
  query: '',
  level: 'workload',
  metric: 'custom',
  unit: '',
  step_seconds: 60,
  scale: 1,
  precision: 6,
  module_id: null
});
const resultRef = ref<InstanceType<typeof QueryTestResult>>();
const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const catalog = ref<Api.Datasource.MetricCatalog>({
  metrics: [],
  levels: [],
  variables: [],
  min_step_seconds: 15,
  max_step_seconds: 3600
});

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
const configOf = computed<QueryConfig>(() => ({
  ...form,
  unit: form.metric === 'custom' ? form.unit : kindUnit.value
}));

watch(show, async visible => {
  if (!visible) return;
  Object.assign(form, {
    datasource_id: props.initial.datasource_id ?? null,
    query: props.initial.query ?? '',
    level: props.initial.level || 'workload',
    metric: props.initial.metric || 'custom',
    unit: props.initial.unit ?? '',
    step_seconds: props.initial.step_seconds || 60,
    scale: props.initial.scale || 1,
    precision: props.initial.precision ?? 6,
    module_id: props.moduleId ?? null
  });
  const [options, metricCatalog] = await Promise.all([
    fetchGetDatasourceOptions(),
    fetchGetMetricCatalog(),
    loadModules()
  ]);
  datasources.value = options.data || [];
  if (metricCatalog.data) catalog.value = metricCatalog.data;
  if (!form.datasource_id && datasources.value.length === 1) form.datasource_id = datasources.value[0].id;
  if (props.autoRun && form.datasource_id && form.query.trim()) {
    await nextTick();
    resultRef.value?.run();
  }
});
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="t('page.monitoring.queryTest.title')" class="w-980px max-w-95vw">
    <div class="tester max-h-74vh overflow-y-auto pr-8px">
      <NForm :model="form" label-placement="top" class="tester__form">
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.datasource')" :help="t('page.formHelp.testDatasource')" />
          </template>
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
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.metric')" :help="t('page.formHelp.testMetric')" />
          </template>
          <NSelect v-model:value="form.metric" :options="metricOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.level')" :help="t('page.formHelp.testLevel')" />
          </template>
          <NSelect v-model:value="form.level" :options="levelOptions" />
        </NFormItem>
        <NFormItem v-if="form.metric === 'custom'" :label="t('page.monitoring.datasets.unit')">
          <NInput v-model:value="form.unit" :placeholder="t('page.monitoring.datasets.unitPlaceholder')" />
        </NFormItem>
        <NFormItem v-else :label="t('page.monitoring.datasets.unit')">
          <NInput :value="kindUnit" readonly />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.step')" :help="t('page.formHelp.testStep')" />
          </template>
          <NInputNumber
            v-model:value="form.step_seconds"
            :min="catalog.min_step_seconds"
            :max="catalog.max_step_seconds"
            class="w-full"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.monitoring.datasets.scale')" :help="t('page.formHelp.testScale')" />
          </template>
          <NInputNumber v-model:value="form.scale" :min="0.000000000001" class="w-full" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.monitoring.datasets.precision')" :help="t('page.formHelp.testPrecision')" />
          </template>
          <NInputNumber v-model:value="form.precision" :min="0" :max="12" :precision="0" class="w-full" />
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
            :rows="4"
            class="font-mono"
            :placeholder="t('page.monitoring.datasets.queryHint')"
          />
        </NFormItem>
      </NForm>
      <QueryTestResult ref="resultRef" :config="configOf" :module-id="form.module_id" />
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="show = false">{{ t('common.close') }}</NButton>
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
