<script setup lang="ts">
import { computed } from 'vue';
import { NCheckbox, NTag } from 'naive-ui';

defineOptions({ name: 'RankLane' });

interface Tag {
  label: string;
  type?: 'default' | 'success' | 'warning' | 'info' | 'error';
}

interface Part {
  label: string;
  /** 0..1; null = not measured */
  value: number | null;
  /** the text next to the bar; defaults to the value as a percentage */
  text?: string;
  /** shown when the part is hovered */
  hint?: string;
}

interface Props {
  /** position in the ranking; null = not ranked yet */
  rank: number | null;
  name: string;
  tags?: Tag[];
  /** the score on a 0..100 scale; null = not scored */
  score: number | null;
  scoreText?: string;
  /** how many places the algorithm moved since its previous evaluation: positive = up, 0 = same, null = no history */
  movement?: number | null;
  parts?: Part[];
  /** the algorithm the platform uses now */
  active?: boolean;
  /** one line under the name (window, time, ...) */
  caption?: string;
  /** show a checkbox so the lane can be part of a batch */
  selectable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tags: () => [],
  scoreText: undefined,
  movement: null,
  parts: () => [],
  active: false,
  caption: '',
  selectable: false
});
const checked = defineModel<boolean>('checked', { default: false });

const level = computed(() => {
  if (props.score === null) return 'none';
  if (props.score >= 85) return 'good';
  if (props.score >= 60) return 'fair';
  return 'poor';
});
const width = computed(() => `${Math.max(0, Math.min(100, props.score ?? 0))}%`);
const percent = (value: number | null) => (value === null ? '-' : `${(value * 100).toFixed(2)}%`);
const partLevel = (value: number | null) => {
  if (value === null) return 'none';
  if (value >= 0.85) return 'good';
  if (value >= 0.6) return 'fair';
  return 'poor';
};
</script>

<template>
  <div
    class="rank-lane"
    :class="{
      'rank-lane--selectable': selectable,
      'rank-lane--active': active,
      [`rank-lane--top${rank}`]: rank !== null && rank <= 3
    }"
  >
    <NCheckbox v-if="selectable" v-model:checked="checked" />
    <div class="rank-lane__badge">
      <span class="rank-lane__rank">{{ rank ?? '-' }}</span>
      <span
        v-if="movement !== null"
        class="rank-lane__move"
        :class="movement > 0 ? 'is-up' : movement < 0 ? 'is-down' : ''"
      >
        <template v-if="movement > 0">▲{{ movement }}</template>
        <template v-else-if="movement < 0">▼{{ -movement }}</template>
        <template v-else>–</template>
      </span>
    </div>

    <div class="rank-lane__main">
      <div class="rank-lane__title">
        <span class="rank-lane__name">{{ name }}</span>
        <NTag v-for="tag in tags" :key="tag.label" size="small" :bordered="false" :type="tag.type || 'default'">
          {{ tag.label }}
        </NTag>
        <span v-if="caption" class="rank-lane__caption">{{ caption }}</span>
      </div>
      <div class="rank-lane__bar" :class="`is-${level}`">
        <div class="rank-lane__fill" :style="{ width }" />
        <span class="rank-lane__score">{{ scoreText ?? (score === null ? '-' : score.toFixed(2)) }}</span>
      </div>
    </div>

    <div v-if="parts.length" class="rank-lane__parts">
      <div
        v-for="part in parts"
        :key="part.label"
        class="rank-lane__part"
        :class="`is-${partLevel(part.value)}`"
        :title="part.hint"
      >
        <div class="rank-lane__part-head">
          <span>{{ part.label }}</span>
          <span class="rank-lane__part-text">{{ part.text ?? percent(part.value) }}</span>
        </div>
        <div class="rank-lane__part-track">
          <div class="rank-lane__part-fill" :style="{ width: `${Math.max(0, Math.min(1, part.value ?? 0)) * 100}%` }" />
        </div>
      </div>
    </div>

    <div v-if="$slots.actions" class="rank-lane__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.rank-lane {
  --lane-good: var(--success-color);
  --lane-fair: var(--warning-color);
  --lane-poor: var(--error-color);
  --lane-none: var(--base-text-color);
  display: grid;
  grid-template-columns: 56px minmax(220px, 1.4fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid rgb(var(--base-text-color) / 0.1);
  border-radius: 10px;
  background: rgb(var(--base-text-color) / 0.02);
}

.rank-lane--active {
  border-color: rgb(var(--primary-color) / 0.55);
  background: rgb(var(--primary-color) / 0.05);
}

.rank-lane__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.rank-lane__rank {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 600;
  background: rgb(var(--base-text-color) / 0.08);
}

.rank-lane--top1 .rank-lane__rank {
  color: #fff;
  background: #d4a017;
}
.rank-lane--top2 .rank-lane__rank {
  color: #fff;
  background: #8a95a5;
}
.rank-lane--top3 .rank-lane__rank {
  color: #fff;
  background: #b87333;
}

.rank-lane__move {
  font-size: 11px;
  line-height: 1;
  opacity: 0.55;
}
.rank-lane__move.is-up {
  color: rgb(var(--success-color));
  opacity: 1;
}
.rank-lane__move.is-down {
  color: rgb(var(--error-color));
  opacity: 1;
}

.rank-lane__main {
  min-width: 0;
}

.rank-lane__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.rank-lane__name {
  font-weight: 600;
  font-size: 15px;
  word-break: break-all;
}

.rank-lane__caption {
  font-size: 12px;
  opacity: 0.6;
}

.rank-lane__bar {
  position: relative;
  height: 22px;
  border-radius: 11px;
  overflow: hidden;
  background: rgb(var(--base-text-color) / 0.08);
}

.rank-lane__fill {
  height: 100%;
  border-radius: 11px;
  transition: width 0.3s ease;
}
.rank-lane__bar.is-good .rank-lane__fill {
  background: rgb(var(--lane-good) / 0.55);
}
.rank-lane__bar.is-fair .rank-lane__fill {
  background: rgb(var(--lane-fair) / 0.6);
}
.rank-lane__bar.is-poor .rank-lane__fill {
  background: rgb(var(--lane-poor) / 0.55);
}

.rank-lane__score {
  position: absolute;
  inset: 0 10px 0 auto;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}

.rank-lane__parts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px 16px;
  min-width: 0;
}

.rank-lane__part-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  opacity: 0.8;
}

.rank-lane__part-text {
  font-variant-numeric: tabular-nums;
}

.rank-lane__part-track {
  height: 6px;
  margin-top: 4px;
  border-radius: 3px;
  overflow: hidden;
  background: rgb(var(--base-text-color) / 0.08);
}

.rank-lane__part-fill {
  height: 100%;
  border-radius: 3px;
}
.rank-lane__part.is-good .rank-lane__part-fill {
  background: rgb(var(--lane-good) / 0.75);
}
.rank-lane__part.is-fair .rank-lane__part-fill {
  background: rgb(var(--lane-fair) / 0.8);
}
.rank-lane__part.is-poor .rank-lane__part-fill {
  background: rgb(var(--lane-poor) / 0.75);
}

.rank-lane__actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.rank-lane--selectable {
  grid-template-columns: 24px 56px minmax(220px, 1.4fr) minmax(0, 2fr) auto;
}

@media (max-width: 1100px) {
  .rank-lane {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .rank-lane__parts,
  .rank-lane__actions {
    grid-column: 1 / -1;
  }
}
</style>
