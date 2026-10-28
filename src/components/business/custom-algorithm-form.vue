<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import StatusSelect from '@/components/business/status-select.vue';
import AlgorithmParamsEditor from '@/components/advanced/algorithm-params-editor.vue';
import ParamSchemaEditor from '@/components/advanced/param-schema-editor.vue';
import FormulaPreview from '@/components/business/formula-preview.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import {
  fetchCheckFormula,
  fetchCreateAlgorithm,
  fetchGetAlgorithms,
  fetchGetFormulaHelp,
  fetchUpdateAlgorithm
} from '@/service/api';

defineOptions({ name: 'CustomAlgorithmForm' });

interface Props {
  /** the custom algorithm being edited; none creates a new one */
  editing?: Api.Forecast.Algorithm | null;
}

const props = withDefaults(defineProps<Props>(), { editing: null });
const emit = defineEmits<{ saved: [] }>();
const show = defineModel<boolean>('show', { required: true });

const { t } = useI18n();
const message = useMessage();

const categories = ['technical', 'statistical', 'machine_learning', 'deep_learning', 'custom'];
const categoryOptions = computed(() =>
  categories.map(value => ({ label: t(`page.forecast.modules.category_${value}`), value }))
);

function emptyForm() {
  return {
    id: '',
    category: 'technical',
    description: '',
    formula: '',
    min_samples: 12,
    recursive: false,
    enabled: false,
    weight: 1
  };
}

const form = reactive(emptyForm());

// ---- a new algorithm is either derived from a built-in one (its parameters are that algorithm's) or a formula
const kind = ref<'builtin' | 'formula'>('builtin');
const baseCategory = ref('statistical');
const baseId = ref<string | null>(null);
const builtins = ref<Api.Forecast.Algorithm[]>([]);
const baseCategories = ['baseline', 'technical', 'statistical', 'machine_learning', 'deep_learning'];
const baseCategoryOptions = computed(() =>
  baseCategories.map(value => ({ label: t(`page.forecast.modules.category_${value}`), value }))
);
/** every built-in algorithm of the type; one without parameters (Naive) shows that it has none instead of a form */
const baseOptions = computed(() =>
  builtins.value
    .filter(item => item.origin === 'builtin' && item.category === baseCategory.value)
    .map(item => ({ label: item.id, value: item.id }))
);
const base = computed(() => builtins.value.find(item => item.id === baseId.value));
const baseValues = ref<Record<string, unknown>>({});
const derived = computed(() => !props.editing && kind.value === 'builtin');

watch([baseCategory, builtins], () => {
  if (!baseOptions.value.some(option => option.value === baseId.value))
    baseId.value = baseOptions.value[0]?.value ?? null;
});
watch(baseId, () => {
  // each algorithm has its own parameters: start from its own defaults
  baseValues.value = {};
});
const schema = ref<Api.Forecast.ParamSchemaItem[]>([]);
const values = ref<Record<string, unknown>>({});
const saving = ref(false);
const checking = ref(false);
const check = ref<Api.Forecast.FormulaCheckResult | null>(null);
const help = ref<Api.Forecast.FormulaHelp | null>(null);

const idPattern = /^[a-z][a-z0-9_]{2,39}$/;
const idValid = computed(() => idPattern.test(form.id));

const specs = computed<Api.Forecast.ParamSpec[]>(() =>
  schema.value
    .filter(item => item.name.trim())
    .map(item => ({
      name: item.name.trim(),
      type: item.type,
      required: false,
      default: item.default,
      min: item.min,
      max: item.max,
      unit: item.unit,
      description: item.description || item.name
    }))
);

function schemaPayload(): Api.Forecast.ParamSchemaItem[] {
  return schema.value.map(item => ({
    name: item.name.trim(),
    type: item.type,
    default: item.default,
    min: item.min,
    max: item.max,
    unit: item.unit?.trim() || undefined,
    description: item.description.trim() || item.name.trim()
  }));
}

/** only the values of parameters the schema still declares */
function valuesPayload() {
  const names = new Set(specs.value.map(spec => spec.name));
  return Object.fromEntries(Object.entries(values.value).filter(([name]) => names.has(name)));
}

watch(show, async visible => {
  if (!visible) return;
  check.value = null;
  Object.assign(form, emptyForm());
  schema.value = [];
  values.value = {};
  kind.value = 'builtin';
  baseValues.value = {};
  if (!props.editing && !builtins.value.length) {
    const { data } = await fetchGetAlgorithms({ page: 1, page_size: 200 });
    builtins.value = data?.list ?? [];
  }
  if (props.editing) {
    const row = props.editing;
    Object.assign(form, {
      id: row.id,
      category: row.category,
      description: row.note || row.description,
      formula: row.formula || '',
      min_samples: row.min_samples || 12,
      recursive: Boolean(row.recursive),
      enabled: row.enabled,
      weight: row.weight || 1
    });
    schema.value = row.params.map(spec => ({
      name: spec.name,
      type: spec.type === 'string' ? 'float' : spec.type,
      default: spec.default as number | boolean | undefined,
      min: spec.min,
      max: spec.max,
      unit: spec.unit,
      description: spec.description
    }));
    values.value = { ...row.values };
    await runCheck(true);
  }
  if (!help.value) {
    const { data } = await fetchGetFormulaHelp();
    help.value = data;
  }
});

async function runCheck(quiet = false) {
  if (!form.formula.trim()) {
    if (!quiet) message.warning(t('page.forecast.algorithms.formula.required'));
    return false;
  }
  checking.value = true;
  try {
    const { data, error } = await fetchCheckFormula({
      formula: form.formula,
      param_schema: schemaPayload(),
      min_samples: form.min_samples,
      recursive: form.recursive,
      params: valuesPayload(),
      horizon: 48
    });
    check.value = error ? null : data;
    return Boolean(data?.ok);
  } finally {
    checking.value = false;
  }
}

async function saveDerived() {
  if (!idValid.value) {
    message.warning(t('page.forecast.algorithms.impl.idHint'));
    return;
  }
  if (!base.value) {
    message.warning(t('page.forecast.algorithms.impl.pick'));
    return;
  }
  if (!base.value.params.length) {
    message.warning(t('page.forecast.algorithms.impl.sameAsBase', { base: base.value.id }));
    return;
  }
  saving.value = true;
  try {
    const { error } = await fetchCreateAlgorithm({
      id: form.id,
      base: base.value.id,
      description: form.description.trim(),
      params: baseValues.value,
      enabled: form.enabled,
      weight: form.weight
    });
    if (!error) {
      show.value = false;
      message.success(t('common.addSuccess'));
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}

async function save() {
  if (derived.value) {
    await saveDerived();
    return;
  }
  if (!props.editing && !idValid.value) {
    message.warning(t('page.forecast.algorithms.formula.idHint'));
    return;
  }
  if (!(await runCheck())) return;
  saving.value = true;
  try {
    const common = {
      category: form.category,
      description: form.description.trim(),
      formula: form.formula.trim(),
      param_schema: schemaPayload(),
      min_samples: form.min_samples,
      recursive: form.recursive,
      params: valuesPayload(),
      weight: form.weight
    };
    const { error } = props.editing
      ? await fetchUpdateAlgorithm(props.editing.id, { ...common, enabled: form.enabled })
      : await fetchCreateAlgorithm({ ...common, id: form.id, enabled: form.enabled });
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
  <NModal
    v-model:show="show"
    preset="card"
    :title="
      editing ? `${t('page.forecast.algorithms.editTitle')} - ${editing.id}` : t('page.forecast.algorithms.addTitle')
    "
    class="edit-modal-wide"
  >
    <div class="max-h-70vh overflow-y-auto pr-8px">
      <NForm :model="form" label-placement="top">
        <NFormItem v-if="!editing">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.forecast.algorithms.impl.label') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-420px leading-22px">
                  <div>{{ t('page.forecast.algorithms.impl.hint') }}</div>
                  <div class="mt-4px">{{ t('page.forecast.algorithms.formula.intro') }}</div>
                </div>
              </IconTooltip>
            </span>
          </template>
          <NRadioGroup v-model:value="kind">
            <NRadioButton value="builtin">{{ t('page.forecast.algorithms.impl.builtin') }}</NRadioButton>
            <NRadioButton value="formula">{{ t('page.forecast.algorithms.impl.formula') }}</NRadioButton>
          </NRadioGroup>
        </NFormItem>
        <template v-if="derived">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.algorithms.impl.category') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.impl.categoryHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="baseCategory" :options="baseCategoryOptions" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.algorithms.impl.base') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.impl.baseHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect
              v-model:value="baseId"
              :options="baseOptions"
              :placeholder="
                baseOptions.length ? t('page.forecast.algorithms.impl.pick') : t('page.forecast.algorithms.impl.none')
              "
            />
          </NFormItem>
        </template>
        <NFormItem
          :label="t('page.forecast.algorithms.impl.idLabel')"
          :validation-status="form.id && !idValid ? 'error' : undefined"
          :feedback="form.id && !idValid ? t('page.forecast.algorithms.formula.idHint') : undefined"
        >
          <NInput
            v-model:value="form.id"
            :disabled="Boolean(editing)"
            :placeholder="t('page.forecast.algorithms.formula.idPlaceholder')"
          />
        </NFormItem>
        <NFormItem v-if="!derived" :label="t('page.forecast.algorithms.columns.category')">
          <NSelect v-model:value="form.category" :options="categoryOptions" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.algorithms.columns.description')">
          <NInput v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
        </NFormItem>
        <NFormItem v-if="!derived">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.forecast.algorithms.formula.minSamples') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.formula.minSamplesHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInputNumber v-model:value="form.min_samples" :min="1" :max="100000" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem v-if="!derived">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.forecast.algorithms.formula.recursive') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.formula.recursiveHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSwitch v-model:value="form.recursive" />
        </NFormItem>
      </NForm>

      <template v-if="!derived">
        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.algorithms.formula.sectionSchema') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.algorithms.formula.schemaHint') }}</div>
          </IconTooltip>
        </div>
        <ParamSchemaEditor v-model="schema" />

        <div class="mb-8px mt-16px flex items-center gap-6px font-medium">
          {{ t('page.forecast.algorithms.formula.sectionFormula') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-420px leading-22px">
              <div>{{ t('page.forecast.algorithms.formula.formulaHint') }}</div>
              <div v-if="help" class="mt-6px">
                <div class="font-medium">{{ t('page.forecast.algorithms.formula.variables') }}</div>
                <div class="font-mono text-12px">{{ help.variables.join('  ') }}</div>
                <div class="mt-4px font-medium">{{ t('page.forecast.algorithms.formula.functions') }}</div>
                <div class="font-mono text-12px">{{ help.functions.join('  ') }}</div>
              </div>
            </div>
          </IconTooltip>
        </div>
        <NInput
          v-model:value="form.formula"
          type="textarea"
          class="formula-input"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :placeholder="t('page.forecast.algorithms.formula.placeholder')"
        />
        <div v-if="help" class="mt-6px flex flex-wrap gap-4px">
          <NTag v-for="name in help.variables" :key="name" size="small" :bordered="false">{{ name }}</NTag>
        </div>

        <div class="mb-8px mt-16px flex items-center gap-6px font-medium">
          {{ t('page.forecast.algorithms.sectionParams') }}
        </div>
        <AlgorithmParamsEditor v-if="specs.length" v-model="values" :specs="specs" />
        <div v-else class="text-13px opacity-70">{{ t('page.forecast.algorithms.noParams') }}</div>

        <div class="mb-8px mt-16px flex items-center gap-8px font-medium">
          {{ t('page.forecast.algorithms.formula.sectionPreview') }}
          <NButton size="small" :loading="checking" @click="runCheck()">
            {{ t('page.forecast.algorithms.formula.check') }}
          </NButton>
        </div>
        <NAlert v-if="check && !check.ok" type="error" :show-icon="false">{{ check.error }}</NAlert>
        <div v-else-if="check?.ok" class="preview-ok">
          <NAlert type="success" :show-icon="false" class="mb-6px">
            {{ t('page.forecast.algorithms.formula.checkOk') }}
          </NAlert>
          <FormulaPreview :history="check.history || []" :forecast="check.forecast || []" />
        </div>
        <div v-else class="text-13px opacity-70">{{ t('page.forecast.algorithms.formula.previewHint') }}</div>
      </template>
      <template v-else-if="base">
        <div class="mb-8px mt-4px flex items-center gap-6px font-medium">
          {{ t('page.forecast.algorithms.sectionParams') }}
          <span class="text-12px font-normal opacity-60">{{ base.id }}</span>
        </div>
        <AlgorithmParamsEditor v-if="base.params.length" :key="base.id" v-model="baseValues" :specs="base.params" />
        <div v-else class="text-13px opacity-70">
          {{ t('page.forecast.algorithms.impl.noExtraParams', { base: base.id }) }}
        </div>
      </template>

      <NForm :model="form" label-placement="top" class="mt-16px">
        <NFormItem :label="t('page.forecast.algorithms.columns.enabled')">
          <StatusSelect v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.algorithms.columns.weight')">
          <NInputNumber v-model:value="form.weight" :min="0.1" :max="100" :step="0.1" class="w-full" />
        </NFormItem>
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

<style scoped>
.formula-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
