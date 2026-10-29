<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NFormItem, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui';
import IconTooltip from '@/components/common/icon-tooltip.vue';

defineOptions({ name: 'AlgorithmParamsEditor' });

interface Props {
  specs: Api.Forecast.ParamSpec[];
}

const props = defineProps<Props>();
const { t, te } = useI18n();
const model = defineModel<Record<string, unknown>>({ required: true });

/** The editor shows what the server will use: the current value, else the default. */
function valueOf(spec: Api.Forecast.ParamSpec) {
  const current = model.value[spec.name];
  return current === undefined ? spec.default : current;
}

function update(spec: Api.Forecast.ParamSpec, value: unknown) {
  // an emptied field drops the parameter so the server default applies
  const cleared = value === null || value === undefined || value === '';
  const kept = Object.entries(model.value).filter(([name]) => name !== spec.name);
  model.value = Object.fromEntries(cleared ? kept : [...kept, [spec.name, value]]);
}

const enumOptions = computed(() =>
  Object.fromEntries(
    props.specs.filter(spec => spec.enum).map(spec => [spec.name, spec.enum!.map(value => ({ label: value, value }))])
  )
);
</script>

<template>
  <div class="algorithm-params-grid">
    <NFormItem v-for="spec in specs" :key="spec.name" label-placement="top">
      <template #label>
        <span class="inline-flex items-center gap-4px">
          <span :class="spec.required ? 'font-medium' : ''">{{ spec.name }}</span>
          <span v-if="spec.unit" class="text-12px opacity-60">({{ spec.unit }})</span>
          <span v-if="spec.required" class="text-error">*</span>
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-380px leading-22px">
              <div>
                <span class="font-medium">{{ t('page.forecast.algorithms.paramMeaning') }}</span>
                {{ spec.description }}
              </div>
              <div v-if="te(`page.forecast.algorithms.paramHelp.${spec.name}.effect`)" class="mt-4px">
                <span class="font-medium">{{ t('page.forecast.algorithms.paramEffect') }}</span>
                {{ t(`page.forecast.algorithms.paramHelp.${spec.name}.effect`) }}
              </div>
              <div v-if="te(`page.forecast.algorithms.paramHelp.${spec.name}.basis`)" class="mt-4px">
                <span class="font-medium">{{ t('page.forecast.algorithms.paramBasis') }}</span>
                {{ t(`page.forecast.algorithms.paramHelp.${spec.name}.basis`) }}
              </div>
              <div v-if="spec.min !== undefined || spec.max !== undefined" class="mt-4px opacity-70">
                {{ t('page.forecast.algorithms.param.range') }}: {{ spec.min ?? '-' }} ~ {{ spec.max ?? '-' }}
              </div>
              <div v-if="spec.default !== undefined" class="opacity-70">
                {{ t('page.forecast.algorithms.param.default') }}: {{ String(spec.default) }}
              </div>
            </div>
          </IconTooltip>
        </span>
      </template>
      <NSwitch
        v-if="spec.type === 'bool'"
        :value="Boolean(valueOf(spec))"
        @update:value="value => update(spec, value)"
      />
      <NSelect
        v-else-if="spec.type === 'string' && spec.enum"
        :value="(valueOf(spec) as string | undefined) ?? null"
        :options="enumOptions[spec.name]"
        @update:value="value => update(spec, value)"
      />
      <!-- a text parameter (the members of a combination: ids separated by commas) -->
      <NInput
        v-else-if="spec.type === 'string'"
        :value="(valueOf(spec) as string | undefined) ?? ''"
        :placeholder="String(spec.default ?? '')"
        @update:value="value => update(spec, value)"
      />
      <NInputNumber
        v-else
        class="w-full"
        :value="(valueOf(spec) as number | undefined) ?? null"
        :min="spec.min"
        :max="spec.max"
        :precision="spec.type === 'int' ? 0 : undefined"
        :step="spec.type === 'int' ? 1 : Math.min(0.05, (spec.max ?? 1) / 20)"
        :placeholder="spec.required ? '*' : String(spec.default ?? '')"
        clearable
        @update:value="value => update(spec, value)"
      />
    </NFormItem>
  </div>
</template>

<style scoped>
.algorithm-params-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}

@media (max-width: 720px) {
  .algorithm-params-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
