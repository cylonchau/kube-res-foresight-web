<script setup lang="ts">
import type { FormulaLine } from '@/utils/formula';

defineOptions({ name: 'FormulaView' });

/**
 * A calculation shown as a calculation: a line for each step, the name of the step beside it, and in the line the names, the figures, the operators and the
 * coefficients each in a look of its own (the coefficient that is divided by is marked), never one run of plain text.
 */
defineProps<{ lines: FormulaLine[] }>();
</script>

<template>
  <div class="formula">
    <div v-for="(line, index) in lines" :key="index" class="formula-line">
      <span class="formula-label">{{ line.label }}</span>
      <span class="formula-expr">
        <span v-for="(token, i) in line.tokens" :key="i" class="tok" :class="`tok-${token.kind}`" :title="token.title">
          {{ token.text }}
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.formula {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.07);
}

.formula-line {
  display: grid;
  grid-template-columns: minmax(64px, 18%) minmax(0, 1fr);
  column-gap: 10px;
  align-items: baseline;
}

.formula-label {
  font-size: 11px;
  line-height: 20px;
  opacity: 0.65;
}

.formula-expr {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 5px;
  align-items: baseline;
  min-width: 0;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
}

.tok {
  white-space: nowrap;
}

.tok-name {
  font-weight: 500;
}

.tok-op {
  opacity: 0.6;
}

.tok-num {
  font-weight: 500;
}

.tok-coef {
  padding: 0 5px;
  font-weight: 600;
  color: #c77d0a;
  background: rgba(240, 160, 32, 0.16);
  border-radius: 4px;
  cursor: help;
}

.tok-res {
  padding: 0 5px;
  font-weight: 700;
  color: #18a058;
  background: rgba(24, 160, 88, 0.14);
  border-radius: 4px;
}
</style>
