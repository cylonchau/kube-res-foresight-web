<script setup lang="ts">
import { computed } from 'vue';
import { NModal, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ParamWords, type SystemParams, moduleParamGroups } from '@/utils/module-params';

defineOptions({ name: 'ModuleParamsModal' });

/**
 * The parameters of a module as they are in force, in the groups of module management, read only: the figure, its unit and where it comes from (the module's own, the system setting
 * it follows, or not set), with what each one means. It saves a trip into the edit form to look at a figure.
 */
interface Props {
  show: boolean;
  module: Api.Forecast.Module | null;
  system: SystemParams;
}
const props = defineProps<Props>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t, te } = useI18n();
const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.paramsView.${key}`, named ?? {});

const words = computed<ParamWords>(() => ({
  unit: kind => m(`unit_${kind}`),
  on: m('on'),
  off: m('off'),
  notSet: m('notSet'),
  enumName: (field, value) =>
    te(`page.forecast.modules.paramsView.e_${field}_${value}`) ? m(`e_${field}_${value}`) : value || m('notSet')
}));

const groups = computed(() => (props.module ? moduleParamGroups(props.module, props.system, words.value) : []));
const fieldKey = (key: string) => key.replace('.', '_');
const sourceType = { module: 'info', system: 'default', off: 'warning' } as const;
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="m('title', { name: module?.name ?? '' })"
    :style="{ width: 'min(960px, 96vw)' }"
    :segmented="{ content: true }"
    :content-style="{ maxHeight: '72vh', overflowY: 'auto' }"
    @update:show="value => emit('update:show', value)"
  >
    <div class="params-hint">{{ m('hint') }}</div>
    <section v-for="group in groups" :key="group.key" class="params-group">
      <div class="params-title">{{ m(`group_${group.key}`) }}</div>
      <div class="params-desc">{{ m(`groupDesc_${group.key}`) }}</div>
      <NTable size="small" :bordered="true" :single-line="false" class="text-12px">
        <thead>
          <tr>
            <th class="col-name">{{ m('colParam') }}</th>
            <th class="col-value">{{ m('colValue') }}</th>
            <th class="col-source">{{ m('colSource') }}</th>
            <th>{{ m('colMeaning') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in group.rows" :key="row.key">
            <td>{{ m(`f_${fieldKey(row.key)}`) }}</td>
            <td class="font-medium">{{ row.value }}</td>
            <td>
              <NTag size="tiny" :bordered="false" :type="sourceType[row.source]">{{ m(`source_${row.source}`) }}</NTag>
            </td>
            <td class="opacity-75">{{ m(`d_${fieldKey(row.key)}`) }}</td>
          </tr>
        </tbody>
      </NTable>
    </section>
  </NModal>
</template>

<style scoped>
.params-hint {
  margin-bottom: 8px;
  font-size: 12px;
  opacity: 0.75;
}

.params-group {
  margin-bottom: 14px;
}

.params-title {
  font-weight: 600;
}

.params-desc {
  margin-bottom: 4px;
  font-size: 12px;
  opacity: 0.7;
}

.col-name {
  width: 26%;
}

.col-value {
  width: 16%;
}

.col-source {
  width: 92px;
}
</style>
