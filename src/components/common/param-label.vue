<script setup lang="ts">
import ParamHelp from '@/components/common/param-help.vue';
import type { ParamDoc } from '@/utils/param-docs';

defineOptions({ name: 'ParamLabel' });

/** The label of a parameter with its "?" (see ParamHelp). */
defineProps<{ label: string; doc: ParamDoc }>();
</script>

<template>
  <span class="inline-flex items-center gap-4px">
    {{ label }}
    <ParamHelp :doc="doc" />
  </span>
</template>
