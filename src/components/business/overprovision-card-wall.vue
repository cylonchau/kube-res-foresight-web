<script setup lang="ts">
import { computed, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import HelpLabel from '@/components/common/help-label.vue';
import { cardColumns, cardSpans } from '@/utils/card-wall';

defineOptions({ name: 'OverprovisionCardWall' });

/**
 * A wall of cards of one size and one gap. The number of columns follows the width and the number of cards so that no place is left empty: the columns are
 * chosen so that the last row is as full as it can be, and the cards of a last row that is not full are made wider to fill it (a single column is one card
 * to the row, two columns are two to the row). A card has a level, and the colour says it: danger, warning, good, info or neutral.
 */
export interface WallCard {
  key: string;
  label: string;
  help?: string;
  value: string;
  sub?: string;
  level?: 'danger' | 'warn' | 'good' | 'info' | 'neutral';
}
const props = withDefaults(defineProps<{ cards: WallCard[]; minWidth?: number }>(), { minWidth: 168 });

const GAP = 8;
const root = ref<HTMLElement | null>(null);
const { width } = useElementSize(root);
const fit = computed(() => Math.max(1, Math.floor((width.value + GAP) / (props.minWidth + GAP))));
const columns = computed(() => cardColumns(props.cards.length, fit.value));
const spans = computed(() => cardSpans(props.cards.length, columns.value));
</script>

<template>
  <div ref="root" class="wall" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <div
      v-for="(card, index) in cards"
      :key="card.key"
      class="wall-card"
      :class="`lv-${card.level ?? 'neutral'}`"
      :style="{ gridColumn: `span ${spans[index] ?? 1}` }"
    >
      <div class="wall-label">
        <HelpLabel v-if="card.help" :label="card.label" :help="card.help" />
        <span v-else>{{ card.label }}</span>
      </div>
      <div class="wall-value">{{ card.value }}</div>
      <div v-if="card.sub" class="wall-sub">{{ card.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.wall {
  display: grid;
  gap: 8px;
}
.wall-card {
  --lv: 128, 128, 128;
  min-width: 0;
  padding: 8px 12px;
  border-left: 4px solid rgb(var(--lv));
  border-radius: 8px;
  background: rgba(var(--lv), 0.14);
}
.wall-card.lv-danger {
  --lv: 224, 48, 80;
}
.wall-card.lv-warn {
  --lv: 240, 160, 32;
}
.wall-card.lv-good {
  --lv: 24, 160, 88;
}
.wall-card.lv-info {
  --lv: 32, 128, 240;
}
.wall-label {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.8;
  overflow-wrap: anywhere;
}
.wall-value {
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
  white-space: nowrap;
  color: rgb(var(--lv));
}
.wall-card.lv-neutral .wall-value {
  color: inherit;
}
.wall-sub {
  font-size: 11px;
  line-height: 16px;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
</style>
