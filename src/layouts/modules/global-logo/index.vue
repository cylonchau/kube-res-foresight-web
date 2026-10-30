<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { $t } from '@/locales';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({
  name: 'GlobalLogo'
});

interface Props {
  /** Whether to show the title */
  showTitle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showTitle: true
});

const appStore = useAppStore();
const themeStore = useThemeStore();
const iconRef = ref<{ $el: HTMLElement } | null>(null);
const titleRef = ref<HTMLElement | null>(null);

/**
 * The logo is centred by what can be seen, not by its boxes. A box is as wide as the advance of its glyphs, so the last letter of the
 * title leaves a gap of its own on the right (a "t" has more than an "k" has on the left) and the artwork has a margin of its own inside
 * its square; whatever the font, the two sides of the box are then not the two sides of the ink. The shift below is half the difference
 * of the two gaps, measured from the font in use and from the artwork on screen, and moves the whole logo so that they are equal.
 */
const shift = ref(0);
const ICON_PX = 28;

/** the transparent margin of the artwork on the left and on the right, in CSS pixels at the size it is shown */
function iconMargins(img: HTMLImageElement): { left: number; right: number } | null {
  if (!img.complete || !img.naturalWidth) return null;
  const size = ICON_PX * 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  let first = -1;
  let last = -1;
  for (let x = 0; x < size && first < 0; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (data[(y * size + x) * 4 + 3] > 48) {
        first = x;
        break;
      }
    }
  }
  for (let x = size - 1; x >= 0 && last < 0; x -= 1) {
    for (let y = 0; y < size; y += 1) {
      if (data[(y * size + x) * 4 + 3] > 48) {
        last = x;
        break;
      }
    }
  }
  if (first < 0) return null;
  return { left: first / 4, right: (size - 1 - last) / 4 };
}

/** the gap between the advance of the title and the ink of its last letter, in CSS pixels */
function titleRightGap(el: HTMLElement): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  const style = getComputedStyle(el);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = el.textContent?.trim() ?? '';
  const m = ctx.measureText(text);
  return Math.max(0, m.width - m.actualBoundingBoxRight);
}

async function measure() {
  await nextTick();
  try {
    await document.fonts?.ready;
  } catch {
    // no font API: the system font is already there
  }
  const img = iconRef.value?.$el?.querySelector('img') as HTMLImageElement | null;
  if (!img) return;
  if (!img.complete) {
    await new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  const icon = iconMargins(img);
  if (!icon) {
    shift.value = 0;
    return;
  }
  // with the title the visible left edge is the artwork and the visible right edge the last letter; without it, the artwork alone
  const right = props.showTitle && titleRef.value ? titleRightGap(titleRef.value) : icon.right;
  shift.value = Math.round(((right - icon.left) / 2) * 10) / 10;
}

onMounted(measure);
watch(() => [themeStore.darkMode, appStore.locale, props.showTitle], measure, { flush: 'post' });
</script>

<template>
  <RouterLink
    to="/"
    class="w-full h-full flex items-center justify-center px-12px nowrap-hidden select-none transition-all duration-200"
    :class="{ '!justify-center !px-0': !showTitle }"
  >
    <span class="logo-ink flex items-center" :style="{ transform: `translateX(${shift}px)` }">
      <SystemLogo ref="iconRef" class="size-28px shrink-0" />
      <h2
        v-show="showTitle"
        ref="titleRef"
        class="m-0 pl-10px text-15px text-primary font-bold leading-none transition duration-300 ease-in-out"
      >
        {{ $t('system.title') }}
      </h2>
    </span>
  </RouterLink>
</template>

<style scoped>
.logo-ink {
  letter-spacing: 0;
}
</style>
