<script setup lang="ts">
import IconTooltip from '@/components/common/icon-tooltip.vue';

/** A form label with a question mark that explains the field (what it is and what it changes), without taking room in the form. */
defineProps<{ label: string; help: string }>();
</script>

<template>
  <span class="inline-flex items-center gap-4px">
    {{ label }}
    <IconTooltip icon="mdi-help-circle" placement="top">
      <div class="max-w-320px leading-22px">{{ help }}</div>
    </IconTooltip>
  </span>
</template>
