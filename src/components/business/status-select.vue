<script setup lang="ts">
import { NRadioButton, NRadioGroup } from 'naive-ui';
import { $t } from '@/locales';

/**
 * The one control for an enabled / disabled state: two named options, so the state reads as a word and not as the
 * position of a switch. It replaces every on/off switch of a form.
 */
const props = defineProps<{ value: boolean | null | undefined; disabled?: boolean }>();
const emit = defineEmits<{ 'update:value': [value: boolean] }>();

function change(next: string) {
  emit('update:value', next === 'on');
}
</script>

<template>
  <!-- solid: the chosen word is filled, so the stored state is the one thing that stands out (the outline style looked chosen on focus) -->
  <NRadioGroup
    :value="props.value ? 'on' : 'off'"
    button-style="solid"
    size="small"
    :disabled="props.disabled"
    @update:value="change"
  >
    <NRadioButton value="on">{{ $t('common.enable') }}</NRadioButton>
    <NRadioButton value="off">{{ $t('common.disable') }}</NRadioButton>
  </NRadioGroup>
</template>
