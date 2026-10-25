<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NCheckbox, NInput, NInputNumber, NSelect } from 'naive-ui';

defineOptions({ name: 'ParamSchemaEditor' });

const { t } = useI18n();
const model = defineModel<Api.Forecast.ParamSchemaItem[]>({ required: true });

const typeOptions = computed(() =>
  (['int', 'float', 'bool'] as const).map(value => ({
    label: t(`page.forecast.algorithms.schema.type_${value}`),
    value
  }))
);

function add() {
  model.value = [
    ...model.value,
    { name: '', type: 'float', default: 1, min: undefined, max: undefined, unit: '', description: '' }
  ];
}

function remove(index: number) {
  model.value = model.value.filter((_, i) => i !== index);
}

function patch(index: number, change: Partial<Api.Forecast.ParamSchemaItem>) {
  model.value = model.value.map((item, i) => (i === index ? { ...item, ...change } : item));
}

function changeType(index: number, type: Api.Forecast.ParamSchemaItem['type']) {
  patch(index, {
    type,
    default: type === 'bool' ? false : 1,
    min: undefined,
    max: undefined
  });
}
</script>

<template>
  <div class="flex-col gap-8px">
    <div v-if="!model.length" class="text-13px opacity-70">{{ t('page.forecast.algorithms.schema.empty') }}</div>
    <div v-for="(item, index) in model" :key="index" class="schema-row">
      <NInput
        :value="item.name"
        :placeholder="t('page.forecast.algorithms.schema.name')"
        @update:value="value => patch(index, { name: value })"
      />
      <NSelect :value="item.type" :options="typeOptions" @update:value="value => changeType(index, value)" />
      <NCheckbox
        v-if="item.type === 'bool'"
        :checked="Boolean(item.default)"
        @update:checked="value => patch(index, { default: value })"
      >
        {{ t('page.forecast.algorithms.schema.default') }}
      </NCheckbox>
      <NInputNumber
        v-else
        :value="item.default as number"
        :precision="item.type === 'int' ? 0 : undefined"
        :placeholder="t('page.forecast.algorithms.schema.default')"
        @update:value="value => patch(index, { default: value ?? undefined })"
      />
      <NInputNumber
        :value="item.min"
        :disabled="item.type === 'bool'"
        :precision="item.type === 'int' ? 0 : undefined"
        :placeholder="t('page.forecast.algorithms.schema.min')"
        @update:value="value => patch(index, { min: value ?? undefined })"
      />
      <NInputNumber
        :value="item.max"
        :disabled="item.type === 'bool'"
        :precision="item.type === 'int' ? 0 : undefined"
        :placeholder="t('page.forecast.algorithms.schema.max')"
        @update:value="value => patch(index, { max: value ?? undefined })"
      />
      <NInput
        :value="item.unit"
        :placeholder="t('page.forecast.algorithms.schema.unit')"
        @update:value="value => patch(index, { unit: value })"
      />
      <NInput
        :value="item.description"
        class="schema-description"
        :placeholder="t('page.forecast.algorithms.schema.description')"
        @update:value="value => patch(index, { description: value })"
      />
      <NButton size="small" type="error" quaternary @click="remove(index)">{{ t('common.delete') }}</NButton>
    </div>
    <div>
      <NButton size="small" dashed @click="add">{{ t('page.forecast.algorithms.schema.add') }}</NButton>
    </div>
  </div>
</template>

<style scoped>
.schema-row {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr 0.8fr 0.8fr 0.7fr 2fr auto;
  gap: 6px;
  align-items: center;
}

@media (max-width: 900px) {
  .schema-row {
    grid-template-columns: 1fr 1fr;
  }

  .schema-description {
    grid-column: 1 / -1;
  }
}
</style>
