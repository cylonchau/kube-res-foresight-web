<script setup lang="ts">
import { computed } from 'vue';
import { NDatePicker } from 'naive-ui';

defineOptions({ name: 'TimeRangeField' });

/**
 * The start and end time of a filter: one date-time range picker everywhere, so every list and chart is filtered the same way.
 * The value is [start, end] in milliseconds, or null for no limit; `startOf` / `endOf` turn it into the from / to parameters.
 */
const model = defineModel<[number, number] | null>({ default: null });

withDefaults(defineProps<{ clearable?: boolean }>(), { clearable: true });

const HOUR = 3600 * 1000;
const shortcuts = computed(() => {
  const last = (hours: number) => (): [number, number] => {
    const end = Date.now();
    return [end - hours * HOUR, end];
  };
  return {
    '1 h': last(1),
    '6 h': last(6),
    '24 h': last(24),
    '7 d': last(24 * 7),
    '30 d': last(24 * 30)
  };
});
</script>

<template>
  <NDatePicker
    v-model:value="model"
    type="datetimerange"
    :clearable="clearable"
    :shortcuts="shortcuts"
    class="w-full"
  />
</template>
