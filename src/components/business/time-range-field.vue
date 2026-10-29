<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NDatePicker, NInputNumber, NPopover, NSelect } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { formatDateTime, fromPickerValue, toPickerValue } from '@/utils/date';
import { type RangeValue, relativeRange } from '@/hooks/business/use-forecast-modules';

defineOptions({ name: 'TimeRangeField' });

/**
 * The time filter of every page, one control in the style of Kibana's: a button that shows the window, and a popover with
 * the quick windows, a relative window ("last N minutes / hours / days") and a fixed range. A relative window moves with
 * the clock: it is recomputed from the current time when the page searches (see `resolveRange`). The value is [start, end]
 * in milliseconds, or null for no limit.
 */
const model = defineModel<RangeValue | null>({ default: null });
const props = withDefaults(defineProps<{ clearable?: boolean }>(), { clearable: true });

const { t } = useI18n();
const MINUTE = 60 * 1000;
const UNIT = { minute: MINUTE, hour: 60 * MINUTE, day: 24 * 60 * MINUTE } as const;
type Unit = keyof typeof UNIT;

const show = ref(false);
const amount = ref(24);
const unit = ref<Unit>('hour');
const fixed = ref<[number, number] | null>(null);

const quick: Array<{ amount: number; unit: Unit }> = [
  { amount: 15, unit: 'minute' },
  { amount: 1, unit: 'hour' },
  { amount: 3, unit: 'hour' },
  { amount: 6, unit: 'hour' },
  { amount: 12, unit: 'hour' },
  { amount: 24, unit: 'hour' },
  { amount: 3, unit: 'day' },
  { amount: 7, unit: 'day' },
  { amount: 30, unit: 'day' }
];
const unitOptions = computed(() =>
  (Object.keys(UNIT) as Unit[]).map(value => ({ label: t(`common.timeUnit_${value}`), value }))
);

const windowText = (n: number, u: Unit) => t('common.timeLast', { n, unit: t(`common.timeUnit_${u}`) });

/** the text of the button: the relative window as written, or the two ends of a fixed range */
const label = computed(() => {
  const value = model.value;
  if (!value) return t('common.timeAll');
  if (value.relativeMs) {
    const unitName = (Object.keys(UNIT) as Unit[]).reverse().find(u => value.relativeMs! % UNIT[u] === 0) || 'minute';
    return windowText(value.relativeMs / UNIT[unitName], unitName);
  }
  return `${formatDateTime(value[0])} → ${formatDateTime(value[1])}`;
});

watch(show, visible => {
  if (!visible) return;
  // the picker shows the wall clock of UTC+8, whatever zone the browser is in
  fixed.value = model.value ? [toPickerValue(model.value[0]), toPickerValue(model.value[1])] : null;
});

function pickRelative(n: number, u: Unit) {
  model.value = relativeRange(n * UNIT[u]);
  show.value = false;
}
function applyRelative() {
  if (amount.value > 0) pickRelative(amount.value, unit.value);
}
function applyFixed() {
  if (fixed.value) {
    model.value = [fromPickerValue(fixed.value[0]), fromPickerValue(fixed.value[1])] as RangeValue;
    show.value = false;
  }
}
function clear() {
  model.value = null;
  show.value = false;
}
</script>

<template>
  <NPopover v-model:show="show" trigger="click" placement="bottom-start" :show-arrow="false" class="time-range-pop">
    <template #trigger>
      <!-- the plain button: its background and border follow the theme exactly like the inputs beside it (light and dark) -->
      <NButton class="time-range-field w-full" justify-content="space-between">
        <span class="truncate">{{ label }}</span>
      </NButton>
    </template>
    <div class="time-range-panel">
      <div class="time-range-panel__col">
        <div class="time-range-panel__title">{{ t('common.timeQuick') }}</div>
        <NButton
          v-for="item in quick"
          :key="`${item.amount}${item.unit}`"
          size="small"
          quaternary
          class="time-range-panel__item"
          @click="pickRelative(item.amount, item.unit)"
        >
          {{ windowText(item.amount, item.unit) }}
        </NButton>
        <NButton v-if="props.clearable" size="small" quaternary class="time-range-panel__item" @click="clear">
          {{ t('common.timeAll') }}
        </NButton>
      </div>
      <div class="time-range-panel__col time-range-panel__col--wide">
        <div class="time-range-panel__title">{{ t('common.timeRelative') }}</div>
        <div class="flex items-center gap-6px">
          <span>{{ t('common.timeLastShort') }}</span>
          <NInputNumber v-model:value="amount" :min="1" :max="9999" :precision="0" size="small" class="w-90px" />
          <NSelect v-model:value="unit" :options="unitOptions" size="small" class="w-90px" />
          <NButton size="small" type="primary" @click="applyRelative">{{ t('common.timeApply') }}</NButton>
        </div>
        <div class="time-range-panel__title mt-12px">{{ t('common.timeAbsolute') }}</div>
        <NDatePicker v-model:value="fixed" type="datetimerange" panel />
        <div class="mt-6px text-right">
          <NButton size="small" type="primary" :disabled="!fixed" @click="applyFixed">
            {{ t('common.timeApply') }}
          </NButton>
        </div>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.time-range-panel {
  display: flex;
  gap: 16px;
  padding: 4px;
}
.time-range-panel__col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}
.time-range-panel__col--wide {
  gap: 6px;
  min-width: 360px;
}
.time-range-panel__title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.65;
}
.time-range-panel__item {
  justify-content: flex-start;
}
</style>
