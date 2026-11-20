<script setup lang="ts">
import { NButton } from 'naive-ui';

defineOptions({ name: 'GrafanaLink' });

/** An "open in Grafana" link; nothing is drawn while the platform has no Grafana address (the url is null), so a page never shows a link that goes nowhere. */
defineProps<{ url: string | null; label: string }>();
</script>

<template>
  <NButton
    v-if="url"
    tag="a"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    size="tiny"
    quaternary
    type="primary"
  >
    {{ label }} ↗
  </NButton>
</template>
