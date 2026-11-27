<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NCheckbox, NSelect } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { type ApplyField, type ApplyItem, type ApplyTarget } from '@/utils/overprovision-apply';
import { formatBytes, formatCores, formatDecimal } from '@/utils/format';

defineOptions({ name: 'OverprovisionApplyTable' });

/**
 * What the resource dashboard recommends, one row for each, with the field of the module it goes in (the usual one is chosen, another can be) and what that field holds now.
 * The rows that are ticked are what the parent puts in the module; nothing is changed here.
 */
interface Props {
  items: ApplyItem[];
  /** what the module holds now in each field, in the unit the module keeps it in (absent = not set) */
  current: Partial<Record<ApplyField, number>>;
}
const props = defineProps<Props>();
const chosen = defineModel<ApplyTarget[]>({ default: () => [] });
const { t } = useI18n();

const state = ref<Record<string, { checked: boolean; field: ApplyField }>>({});

watch(
  () => props.items,
  items => {
    const next: Record<string, { checked: boolean; field: ApplyField }> = {};
    for (const item of items) next[item.key] = { checked: true, field: item.targets[0].field };
    state.value = next;
  },
  { immediate: true }
);

/** a value of a field as the page writes it: millicores as cores, bytes as GiB or MiB, a ratio as a multiple, the rest as a count */
function fieldText(field: ApplyField, value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return '-';
  if (field.endsWith('_milli')) return `${formatCores(value / 1000, 3)}`;
  if (field.endsWith('_bytes')) return formatBytes(value, 3);
  if (field.endsWith('_ratio')) return `× ${formatDecimal(value, 2)}`;
  return formatDecimal(value, 0);
}

function recommendedText(item: ApplyItem) {
  switch (item.kind) {
    case 'cpu':
      return formatCores(item.recommended, 3);
    case 'memory':
      return formatBytes(item.recommended, 3);
    case 'ratio':
      return `${item.key === 'cpuLimits' ? formatCores(item.recommended, 3) : formatBytes(item.recommended, 3)} (${fieldText(item.targets[0].field, item.targets[0].value)})`;
    default:
      return formatDecimal(item.recommended, 0);
  }
}

const rows = computed(() =>
  props.items.map(item => {
    const pick = state.value[item.key];
    const target = item.targets.find(candidate => candidate.field === pick?.field) ?? item.targets[0];
    return {
      item,
      pick,
      target,
      options: item.targets.map(candidate => ({
        label: t(`page.overprovision.applyField_${candidate.field}`),
        value: candidate.field
      }))
    };
  })
);

watch(
  [rows, () => props.items],
  () => {
    chosen.value = rows.value.filter(row => row.pick?.checked).map(row => row.target);
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <table class="apply-table">
    <thead>
      <tr>
        <th></th>
        <th>{{ t('page.overprovision.applyColumnRecommend') }}</th>
        <th>{{ t('page.overprovision.applyColumnPut') }}</th>
        <th>{{ t('page.overprovision.applyColumnNow') }}</th>
        <th>{{ t('page.overprovision.applyColumnNew') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.item.key">
        <td><NCheckbox v-if="row.pick" v-model:checked="row.pick.checked" /></td>
        <td>
          <div class="font-medium">{{ t(`page.overprovision.applyItem_${row.item.key}`) }}</div>
          <div class="opacity-75">{{ recommendedText(row.item) }}</div>
        </td>
        <td>
          <NSelect
            v-if="row.pick && row.options.length > 1"
            v-model:value="row.pick.field"
            size="small"
            :options="row.options"
            class="w-220px"
          />
          <span v-else>{{ row.options[0]?.label }}</span>
        </td>
        <td>{{ fieldText(row.target.field, current[row.target.field]) }}</td>
        <td class="font-medium">{{ fieldText(row.target.field, row.target.value) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.apply-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 20px;
}

.apply-table th,
.apply-table td {
  padding: 6px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
  vertical-align: middle;
}

.apply-table th {
  border-top: 0;
  font-weight: 600;
  opacity: 0.8;
}
</style>
