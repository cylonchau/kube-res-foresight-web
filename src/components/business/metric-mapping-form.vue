<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { NButton, NForm, NFormItem, NInput, NModal, NSelect, NSpace, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import DurationInput from '@/components/advanced/duration-input.vue';
import StatusSelect from '@/components/business/status-select.vue';
import QueryTestResult, { type QueryConfig } from '@/components/business/query-test-result.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { useForecastModules } from '@/hooks/business/use-forecast-modules';
import {
  fetchCreateMetricMapping,
  fetchGetDatasourceOptions,
  fetchGetMetricCatalog,
  fetchGetMetricPresets,
  fetchUpdateMetricMapping
} from '@/service/api/datasource';

defineOptions({ name: 'MetricTemplateForm' });

/**
 * A metric template: the PromQL of one kind of metric at one level, written once with the variables of a module
 * ({{namespace}}, {{workload}}, ...). Modules choose the templates they are calculated from; the query is rendered with the
 * module's own parameters. The test below renders it for the module picked beside it and runs it, in this same form.
 */
const props = defineProps<{ editing: Api.Datasource.MetricMapping | null }>();
const emit = defineEmits<{ saved: [] }>();
const show = defineModel<boolean>('show', { required: true });

const { t, locale } = useI18n();
const message = useMessage();
const { moduleOptions, loadModules } = useForecastModules();

const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const catalog = ref<Api.Datasource.MetricCatalog>({
  metrics: [],
  levels: [],
  variables: [],
  min_step_seconds: 15,
  max_step_seconds: 3600
});
const presets = ref<Api.Datasource.Preset[]>([]);
const saving = ref(false);
const previewModule = ref<number | null>(null);
// no module yet (a metric is often made first): the variables of the query can be given by hand for the test
const sample = reactive<Record<'namespace' | 'workload' | 'container' | 'service', string>>({
  namespace: '',
  workload: '',
  container: '',
  service: ''
});

const form = reactive({
  datasource_id: null as number | null,
  name: '',
  metric: 'cpu',
  level: 'workload',
  unit: '',
  step_seconds: 60,
  query: '',
  enabled: true,
  remark: ''
});

const sampleVariables = computed(() =>
  (['namespace', 'workload', 'container', 'service'] as const).filter(name =>
    new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(form.query)
  )
);

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
const kindUnit = computed(() => catalog.value.metrics.find(item => item.metric === form.metric)?.unit || '');
const isCustom = computed(() => form.metric === 'custom');
const presetOptions = computed(() => presets.value.map(item => ({ label: item.name.zh, value: item.id })));
const pickedPreset = ref<Api.Datasource.Preset>();
const pickedText = (value: Api.Datasource.PresetText) => (locale.value === 'en-US' ? value.en : value.zh);
const variableList = computed(() => catalog.value.variables.map(name => '{{' + name + '}}').join(' '));

const testConfig = computed<QueryConfig>(() => ({
  datasource_id: form.datasource_id,
  query: form.query,
  level: form.level,
  metric: form.metric,
  unit: isCustom.value ? form.unit : kindUnit.value,
  step_seconds: form.step_seconds,
  scale: 1,
  precision: 6
}));

async function loadPresets(metric: string) {
  presets.value = [];
  pickedPreset.value = undefined;
  if (!metric || metric === 'custom') return;
  const { data } = await fetchGetMetricPresets({ metric });
  presets.value = data?.list || [];
}

function applyPreset(id: string | null) {
  const preset = presets.value.find(item => item.id === id);
  pickedPreset.value = preset;
  if (!preset) return;
  Object.assign(form, { query: preset.query, level: preset.level, step_seconds: preset.step_seconds });
  if (isCustom.value) form.unit = preset.unit;
  if (!form.name) form.name = preset.name.zh;
}

async function save() {
  if (!form.name.trim() || !form.datasource_id || !form.query.trim()) {
    message.warning(t('page.datasource.mappings.required'));
    return;
  }
  saving.value = true;
  try {
    const payload: Api.Datasource.MetricMappingPayload = {
      datasource_id: form.datasource_id,
      name: form.name.trim(),
      metric: form.metric,
      level: form.level,
      query: form.query.trim(),
      unit: isCustom.value ? form.unit.trim() : kindUnit.value,
      step_seconds: form.step_seconds,
      enabled: form.enabled,
      remark: form.remark
    };
    const { error } = props.editing
      ? await fetchUpdateMetricMapping(props.editing.id, payload)
      : await fetchCreateMetricMapping(payload);
    if (!error) {
      message.success(props.editing ? t('common.modifySuccess') : t('common.addSuccess'));
      show.value = false;
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}

watch(show, async visible => {
  if (!visible) return;
  const [options, metricCatalog] = await Promise.all([
    fetchGetDatasourceOptions(),
    fetchGetMetricCatalog(),
    loadModules()
  ]);
  datasources.value = options.data || [];
  if (metricCatalog.data) catalog.value = metricCatalog.data;
  const row = props.editing;
  Object.assign(form, {
    datasource_id: row?.datasource_id ?? (datasources.value.length === 1 ? datasources.value[0].id : null),
    name: row?.name ?? '',
    metric: row?.metric ?? 'cpu',
    level: row?.level ?? 'workload',
    unit: row?.unit ?? '',
    step_seconds: row?.step_seconds ?? 60,
    query: row?.query ?? '',
    enabled: row?.enabled ?? true,
    remark: row?.remark ?? ''
  });
  previewModule.value = null;
  await loadPresets(form.metric);
});
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="editing ? t('page.datasource.mappings.editTitle') : t('page.datasource.mappings.addTitle')"
    class="edit-modal-wide"
  >
    <div class="max-h-72vh overflow-y-auto pr-8px">
      <NForm :model="form" label-placement="top">
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.name')" :help="t('page.formHelp.mappingName')" />
          </template>
          <NInput v-model:value="form.name" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.datasource')" :help="t('page.formHelp.mappingDatasource')" />
          </template>
          <NSelect v-model:value="form.datasource_id" filterable :options="datasourceOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.metric')" :help="t('page.formHelp.mappingMetric')" />
          </template>
          <NSelect
            v-model:value="form.metric"
            :disabled="Boolean(editing)"
            :options="metricOptions"
            @update:value="loadPresets"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.level')" :help="t('page.formHelp.mappingLevel')" />
          </template>
          <NSelect v-model:value="form.level" :options="levelOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.mappings.unit')" :help="t('page.formHelp.mappingUnit')" />
          </template>
          <NInput
            v-if="isCustom"
            v-model:value="form.unit"
            :placeholder="t('page.monitoring.datasets.unitPlaceholder')"
          />
          <NInput v-else :value="kindUnit" readonly />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.monitoring.datasets.queryStep')" :help="t('page.formHelp.datasetStep')" />
          </template>
          <DurationInput
            v-model="form.step_seconds"
            unit="seconds"
            :min="catalog.min_step_seconds"
            :max="catalog.max_step_seconds"
            :presets="[60, 300, 900, 3600]"
          />
        </NFormItem>
        <NFormItem v-if="presetOptions.length">
          <template #label>
            <HelpLabel :label="t('page.monitoring.datasets.usePreset')" :help="t('page.formHelp.datasetPreset')" />
          </template>
          <div class="w-full">
            <NSelect
              :value="null"
              clearable
              filterable
              :options="presetOptions"
              :placeholder="t('page.monitoring.datasets.usePresetHint')"
              @update:value="applyPreset"
            />
            <div v-if="pickedPreset" class="mt-4px text-12px leading-20px opacity-70">
              <div>{{ pickedText(pickedPreset.scenario) }}</div>
              <div v-if="pickedText(pickedPreset.usage)">{{ pickedText(pickedPreset.usage) }}</div>
              <div v-if="pickedText(pickedPreset.limitations)">{{ pickedText(pickedPreset.limitations) }}</div>
              <div>
                {{ t('page.datasource.presets.columns.source') }}: {{ pickedPreset.source.component }} ·
                {{ t('page.datasource.presets.series') }}: {{ pickedPreset.source.metrics.join(', ') }} ·
                {{ t('page.datasource.presets.labels') }}: {{ pickedPreset.source.labels.join(', ') }}
              </div>
              <div v-if="!pickedPreset.verified">{{ t('page.datasource.presets.unverifiedHint') }}</div>
            </div>
          </div>
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel label="PromQL" :help="`${t('page.monitoring.queryTest.queryHint')} ${variableList}`" />
          </template>
          <NInput
            v-model:value="form.query"
            type="textarea"
            class="font-mono"
            :autosize="{ minRows: 3, maxRows: 8 }"
            :placeholder="t('page.monitoring.datasets.queryHint')"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.datasource.connections.enabled')" :help="t('page.formHelp.mappingEnabled')" />
          </template>
          <StatusSelect v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('common.remark')" :help="t('page.formHelp.mappingRemark')" />
          </template>
          <NInput v-model:value="form.remark" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel
              :label="t('page.datasource.mappings.previewModule')"
              :help="t('page.formHelp.templatePreviewModule')"
            />
          </template>
          <NSelect v-model:value="previewModule" clearable filterable :options="moduleOptions" />
        </NFormItem>
        <NFormItem
          v-for="name in sampleVariables"
          v-show="!previewModule"
          :key="name"
          :label="t('page.datasource.mappings.sampleValue', { name })"
        >
          <NInput v-model:value="sample[name]" :placeholder="t('page.datasource.mappings.samplePlaceholder')" />
        </NFormItem>
        <div>
          <QueryTestResult :config="testConfig" :module-id="previewModule" :sample="sample" />
        </div>
      </NForm>
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="show = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>
