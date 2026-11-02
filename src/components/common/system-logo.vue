<script setup lang="ts">
import { computed } from 'vue';
import darkLogo from '@/assets/svg-icon/kube-res-foresight-logo-dark.svg';
import lightLogo from '@/assets/svg-icon/kube-res-foresight-logo-light.svg';
import { useThemeStore } from '@/store/modules/theme';

interface Props {
  small?: boolean;
}

const props = withDefaults(defineProps<Props>(), { small: false });
/** the logo made for the theme: light on the light theme, dark on the dark one */
const themeStore = useThemeStore();
const logoSrc = computed(() => (themeStore.darkMode ? darkLogo : lightLogo));
</script>

<template>
  <div class="app-logo flex-center" :data-small="props.small || undefined">
    <img :src="logoSrc" alt="kube-res-foresight" class="size-full object-contain" />
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
