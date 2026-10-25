<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import {
  fetchApplyMetricPreset,
  fetchCreateMetricMapping,
  fetchGetDatasourceOptions,
  fetchGetMetricCatalog,
  fetchGetMetricPresets,
  fetchUpdateMetricMapping
} from '@/service/api';

defineOptions({ name: 'MetricMappingForm' });

interface Props {
  /** The mapping being edited; none creates one. */
  editing?: Api.Datasource.MetricMapping | null;
  /** A built-in template to start from: the mapping is created from it and remembers it. */
  preset?: Api.Datasource.Preset | null;
}

const props = withDefaults(defineProps<Props>(), { editing: null, preset: null });
const emit = defineEmits<{ saved: [] }>();
const show = defineModel<boolean>('show', { required: true });

const { t, locale } = useI18n();
const message = useMessage();

const datasources = ref<Api.Datasource.DatasourceOption[]>([]);
const presets = ref<Api.Datasource.Preset[]>([]);
const catalog = ref<Api.Datasource.MetricCatalog>({
  metrics: [],
  levels: [],
  variables: [],
  min_step_seconds: 15,
  max_step_seconds: 3600
});
const saving = ref(false);

/** Template variables are written with double braces, which cannot appear inside a Vue mustache. */
const placeholder = (name: string) => `{{${name}}}`;
const text = (value: Api.Datasource.PresetText) => (locale.value === 'en-US' ? value.en : value.zh);

function emptyForm() {
  return {
    datasource_id: null as number | null,
    name: '',
    metric: null as string | null,
    level: null as string | null,
    query: '',
    step_seconds: 60,
    enabled: true,
    remark: '',
    template: null as string | null
  };
}
const form = reactive(emptyForm());

const datasourceOptions = computed(() => {
  const current = props.editing;
  const options = datasources.value.map(item => ({ label: item.name, value: item.id }));
  // a disabled datasource is not offered for new mappings but stays selectable on its own mappings
  if (current && !datasources.value.some(item => item.id === current.datasource_id)) {
    return [{ label: current.datasource_name, value: current.datasource_id }, ...options];
  }
  return options;
});
const metricOptions = computed(() =>
  catalog.value.metrics.map(item => ({
    label: `${t(`page.datasource.mappings.metric_${item.metric}`)} (${item.unit})`,
    value: item.metric
  }))
);
const levelOptions = computed(() =>
  catalog.value.levels.map(item => ({ label: t(`page.datasource.mappings.level_${item.level}`), value: item.level }))
);
const unit = computed(() => catalog.value.metrics.find(item => item.metric === form.metric)?.unit || '-');
const requiredVariables = computed(
  () => catalog.value.levels.find(item => item.level === form.level)?.required_variables || []
);

/** The templates that fit the chosen metric and level: picking one generates the PromQL, which stays editable. */
const templateOptions = computed(() =>
  presets.value
    .filter(item => (!form.metric || item.metric === form.metric) && (!form.level || item.level === form.level))
    .map(item => ({
      label: `${text(item.name)}${item.verified ? '' : ` (${t('page.datasource.presets.unverified')})`}`,
      value: item.id
    }))
);

function useTemplate(id: string | null) {
  form.template = id;
  const picked = presets.value.find(item => item.id === id);
  if (!picked) return;
  form.query = picked.query;
  form.step_seconds = picked.step_seconds;
  form.metric ??= picked.metric;
  form.level ??= picked.level;
  if (!form.name.trim()) form.name = picked.id;
}

const title = computed(() => {
  if (props.preset) return text(props.preset.name);
  return t(props.editing ? 'page.datasource.mappings.editTitle' : 'page.datasource.mappings.addTitle');
});

watch(show, async visible => {
  if (!visible) return;
  Object.assign(form, emptyForm());
  const [options, metricCatalog, presetList] = await Promise.all([
    fetchGetDatasourceOptions(),
    fetchGetMetricCatalog(),
    fetchGetMetricPresets()
  ]);
  datasources.value = options.data || [];
  if (metricCatalog.data) catalog.value = metricCatalog.data;
  presets.value = presetList.data?.list || [];
  if (props.editing) {
    const row = props.editing;
    Object.assign(form, {
      datasource_id: row.datasource_id,
      name: row.name,
      metric: row.metric,
      level: row.level,
      query: row.query,
      step_seconds: row.step_seconds,
      enabled: row.enabled,
      remark: row.remark,
      template: row.preset_id || null
    });
  } else if (props.preset) {
    Object.assign(form, {
      name: props.preset.id,
      metric: props.preset.metric,
      level: props.preset.level,
      query: props.preset.query,
      step_seconds: props.preset.step_seconds,
      template: props.preset.id
    });
  }
});

async function save() {
  if (!form.datasource_id || !form.name.trim() || !form.metric || !form.level || !form.query.trim()) {
    message.warning(t('page.datasource.mappings.required'));
    return;
  }
  saving.value = true;
  try {
    let error: unknown;
    if (props.preset) {
      ({ error } = await fetchApplyMetricPreset(props.preset.id, {
        datasource_id: form.datasource_id,
        name: form.name.trim(),
        step_seconds: form.step_seconds,
        query: form.query.trim()
      }));
    } else {
      const payload: Api.Datasource.MetricMappingPayload = {
        datasource_id: form.datasource_id,
        name: form.name.trim(),
        metric: form.metric,
        level: form.level,
        query: form.query.trim(),
        step_seconds: form.step_seconds,
        enabled: form.enabled,
        remark: form.remark
      };
      ({ error } = props.editing
        ? await fetchUpdateMetricMapping(props.editing.id, payload)
        : await fetchCreateMetricMapping(payload));
    }
    if (!error) {
      show.value = false;
      message.success(props.editing ? t('common.modifySuccess') : t('common.addSuccess'));
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="title" class="edit-modal-wide">
    <div class="max-h-70vh overflow-y-auto pr-8px">
      <NForm :model="form" label-placement="top">
        <NFormItem :label="t('page.datasource.mappings.datasource')">
          <NSelect
            v-model:value="form.datasource_id"
            :placeholder="t('common.selectField', { field: t('page.datasource.mappings.datasource') })"
            :options="datasourceOptions"
          />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.name')">
          <NInput
            v-model:value="form.name"
            :placeholder="t('common.inputField', { field: t('page.datasource.mappings.name') })"
          />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.metric')">
          <NSelect v-model:value="form.metric" :disabled="Boolean(preset)" :options="metricOptions" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.level')">
          <NSelect v-model:value="form.level" :disabled="Boolean(preset)" :options="levelOptions" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.mappings.unit')">
          <NInput :value="unit" readonly />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.mappings.step') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">
                  {{
                    t('page.datasource.mappings.stepHint', {
                      min: catalog.min_step_seconds,
                      max: catalog.max_step_seconds
                    })
                  }}
                </div>
              </IconTooltip>
            </span>
          </template>
          <NInputNumber
            v-model:value="form.step_seconds"
            :min="catalog.min_step_seconds"
            :max="catalog.max_step_seconds"
            class="w-full"
          />
        </NFormItem>
        <NFormItem v-if="!preset">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.mappings.template') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.datasource.mappings.templateHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect
            :value="form.template"
            clearable
            filterable
            :options="templateOptions"
            :placeholder="t('page.datasource.mappings.templatePlaceholder')"
            @update:value="useTemplate"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.mappings.query') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">
                  <div>{{ t('page.datasource.mappings.queryHint') }}</div>
                  <div>
                    {{ t('page.datasource.mappings.variables') }}: {{ catalog.variables.map(placeholder).join(' ') }}
                  </div>
                </div>
              </IconTooltip>
              <template v-if="requiredVariables.length">
                <NTag v-for="name in requiredVariables" :key="name" size="small" :bordered="false" type="warning">
                  {{ placeholder(name) }}
                </NTag>
              </template>
            </span>
          </template>
          <NInput
            v-model:value="form.query"
            type="textarea"
            :rows="5"
            class="font-mono"
            :placeholder="t('common.inputField', { field: t('page.datasource.mappings.query') })"
          />
        </NFormItem>
        <template v-if="!preset">
          <NFormItem :label="t('page.datasource.connections.enabled')">
            <NSwitch v-model:value="form.enabled" />
          </NFormItem>
          <NFormItem :label="t('common.remark')">
            <NInput
              v-model:value="form.remark"
              type="textarea"
              :placeholder="t('common.inputField', { field: t('common.remark') })"
            />
          </NFormItem>
        </template>
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
