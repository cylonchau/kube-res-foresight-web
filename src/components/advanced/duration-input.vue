<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NInputNumber, NSelect } from 'naive-ui';

defineOptions({ name: 'DurationInput' });

type BaseUnit = 'seconds' | 'minutes' | 'hours';

interface Props {
  /** the unit of the value the model holds */
  unit?: BaseUnit;
  /** quick choices in seconds; they read 5m, 15m, 1h, 1d, 30d */
  presets?: number[];
  /** the smallest value (in the model unit) other than 0 */
  min?: number;
  max?: number;
  /** 0 means "not set": the label shown for it, when 0 is allowed */
  zeroLabel?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  unit: 'seconds',
  presets: () => [300, 900, 3600, 86400, 2592000],
  min: 1,
  max: undefined,
  zeroLabel: '',
  disabled: false
});

const model = defineModel<number | null>({ required: true });

const toSeconds: Record<BaseUnit, number> = { seconds: 1, minutes: 60, hours: 3600 };
// a model that holds whole minutes cannot take seconds: only units of at least one model unit are offered
const displayUnits = computed(() =>
  [
    { label: 's', value: 1 },
    { label: 'm', value: 60 },
    { label: 'h', value: 3600 },
    { label: 'd', value: 86400 }
  ].filter(unit => unit.value >= toSeconds[props.unit])
);
const label = (seconds: number) => {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};

const seconds = computed(() => (model.value ?? 0) * toSeconds[props.unit]);
const factor = ref(60);
const amount = ref<number | null>(null);

/** the display shows the largest unit that divides the value exactly */
function show(value: number) {
  const base = toSeconds[props.unit];
  const unit = [86400, 3600, 60, 1].find(u => u >= base && value > 0 && value % u === 0) ?? base;
  factor.value = unit;
  amount.value = value / unit;
}

watch(
  seconds,
  value => {
    if (amount.value === null || amount.value * factor.value !== value) show(value);
  },
  { immediate: true }
);

function emit(valueSeconds: number | null) {
  // the model holds whole units (the API fields are integers): a fraction is rounded, never sent
  model.value = valueSeconds === null ? null : Math.round(valueSeconds / toSeconds[props.unit]);
}

function onAmount(value: number | null) {
  amount.value = value;
  emit(value === null ? null : value * factor.value);
}

function onUnit(value: number) {
  factor.value = value;
  if (amount.value !== null) emit(amount.value * value);
}

const minValue = computed(() => (props.min * toSeconds[props.unit]) / factor.value);
const maxValue = computed(() =>
  props.max === undefined ? undefined : (props.max * toSeconds[props.unit]) / factor.value
);
const visiblePresets = computed(() =>
  props.presets.filter(
    value =>
      value >= props.min * toSeconds[props.unit] &&
      (props.max === undefined || value <= props.max * toSeconds[props.unit])
  )
);
</script>

<template>
  <div class="w-full flex-col gap-6px">
    <div class="flex flex-wrap items-center gap-6px">
      <NButton
        v-for="preset in visiblePresets"
        :key="preset"
        size="tiny"
        :disabled="disabled"
        :type="seconds === preset ? 'primary' : 'default'"
        :secondary="seconds === preset"
        @click="emit(preset)"
      >
        {{ label(preset) }}
      </NButton>
      <NButton
        v-if="zeroLabel"
        size="tiny"
        :disabled="disabled"
        :type="seconds === 0 ? 'primary' : 'default'"
        :secondary="seconds === 0"
        @click="emit(0)"
      >
        {{ zeroLabel }}
      </NButton>
    </div>
    <div class="flex items-center gap-6px">
      <NInputNumber
        :value="amount"
        :disabled="disabled"
        :min="zeroLabel ? 0 : minValue"
        :max="maxValue"
        :precision="0"
        class="flex-1"
        @update:value="onAmount"
      />
      <NSelect
        :value="factor"
        :disabled="disabled"
        :options="displayUnits"
        :consistent-menu-width="false"
        class="w-72px"
        @update:value="onUnit"
      />
    </div>
  </div>
</template>
