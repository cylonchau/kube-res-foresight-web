<script setup lang="ts">
import { $t } from '@/locales';

defineOptions({
  name: 'GlobalLogo'
});

interface Props {
  /** Whether to show the title */
  showTitle?: boolean;
}

withDefaults(defineProps<Props>(), {
  showTitle: true
});
</script>

<template>
  <RouterLink
    to="/"
    class="w-full h-full flex items-center justify-start pl-12px pr-8px nowrap-hidden select-none transition-all duration-200"
    :class="{ '!justify-center !px-0': !showTitle }"
  >
    <!-- the artwork is centred in its own box (see the viewBox of the svg), so the logo needs no offset to sit on the middle of the header -->
    <SystemLogo class="size-28px shrink-0" />
    <h2
      v-show="showTitle"
      class="m-0 pl-10px text-16px text-primary font-bold leading-none tracking-tight transition duration-300 ease-in-out"
    >
      {{ $t('system.title') }}
    </h2>
  </RouterLink>
</template>

<style scoped></style>
