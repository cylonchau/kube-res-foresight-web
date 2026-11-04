<script setup lang="ts">
import { NButton, NButtonGroup } from 'naive-ui';
import { $t } from '@/locales';

/**
 * The one control for an enabled / disabled state: two named options, so the state reads as a word and not as the
 * position of a switch. It replaces every on/off switch of a form.
 */
const props = defineProps<{ value: boolean | null | undefined; disabled?: boolean }>();
const emit = defineEmits<{ 'update:value': [value: boolean] }>();

function pick(next: boolean) {
  if (!props.disabled) emit('update:value', next);
}
</script>

<template>
  <!--
 two buttons, the stored state filled with the primary colour and the other one plain: NRadioGroup has no filled style,
       and its outline looked chosen on focus 
-->
  <NButtonGroup size="small">
    <NButton :type="props.value ? 'primary' : 'default'" :disabled="props.disabled" @click="pick(true)">
      {{ $t('common.enable') }}
    </NButton>
    <NButton :type="props.value ? 'default' : 'primary'" :disabled="props.disabled" @click="pick(false)">
      {{ $t('common.disable') }}
    </NButton>
  </NButtonGroup>
</template>
