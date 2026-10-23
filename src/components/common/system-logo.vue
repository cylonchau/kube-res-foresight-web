<script setup lang="ts">
import logoSrc from '@/assets/svg-icon/kubeforecast-logo.svg';

interface Props {
  small?: boolean;
}

const props = withDefaults(defineProps<Props>(), { small: false });
</script>

<template>
  <div class="app-logo flex-center" :data-small="props.small || undefined">
    <img :src="logoSrc" alt="KubeForecast" class="size-full object-contain" />
  </div>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.app-logo img {
  display: block;
}
</style>
