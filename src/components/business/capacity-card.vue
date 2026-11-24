<script setup lang="ts">
import { NPopover, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import FormulaView from '@/components/common/formula-view.vue';
import SvgIcon from '@/components/custom/svg-icon.vue';
import type { FormulaLine } from '@/utils/formula';

defineOptions({ name: 'CapacityCard' });

/**
 * One capacity figure of module management: its name, the figure (or the state that says why there is none: not set, no history, not enough data, calculation failed),
 * where it comes from in one line and a "?" with what it means, where the data comes from, the formula and the period the figures are of. A figure without a source is not shown as a
 * number: the card says what is missing instead.
 */
export type CapacityCardState = 'ready' | 'not_set' | 'no_history' | 'insufficient' | 'error' | 'unsaved';
export interface CapacityCardData {
  key: string;
  label: string;
  state: CapacityCardState;
  value: string;
  /** one line under the figure: what it is made of, or what is missing */
  sub: string;
  meaning: string;
  source: string;
  formula: FormulaLine[];
  period: string;
}

defineProps<{ card: CapacityCardData }>();
const { t } = useI18n();
const TAG: Record<CapacityCardState, 'success' | 'default' | 'warning' | 'error' | 'info'> = {
  ready: 'success',
  not_set: 'default',
  no_history: 'warning',
  insufficient: 'warning',
  error: 'error',
  unsaved: 'info'
};
</script>

<template>
  <div class="cap-card" :class="`cap-${card.state}`">
    <div class="cap-card-label">
      <span>{{ card.label }}</span>
      <NPopover trigger="hover" placement="bottom-start" :show-arrow="false">
        <template #trigger>
          <span class="inline-flex cursor-pointer items-center align-middle"><SvgIcon icon="mdi-help-circle" /></span>
        </template>
        <div class="cap-help">
          <div>
            <div class="cap-help-title">{{ t('page.forecast.capacityCard.meaning') }}</div>
            {{ card.meaning }}
          </div>
          <div>
            <div class="cap-help-title">{{ t('page.forecast.capacityCard.source') }}</div>
            {{ card.source }}
          </div>
          <div>
            <div class="cap-help-title">{{ t('page.forecast.capacityCard.formula') }}</div>
            <FormulaView :lines="card.formula" />
          </div>
          <div>
            <div class="cap-help-title">{{ t('page.forecast.capacityCard.period') }}</div>
            {{ card.period }}
          </div>
        </div>
      </NPopover>
    </div>
    <div v-if="card.state === 'ready'" class="cap-card-value">{{ card.value }}</div>
    <NTag v-else size="small" :bordered="false" :type="TAG[card.state]">
      {{ t(`page.forecast.capacityCard.state_${card.state}`) }}
    </NTag>
    <div class="cap-card-sub">{{ card.sub }}</div>
  </div>
</template>

<style scoped>
.cap-card {
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.05);
}

.cap-card-label {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  opacity: 0.8;
}

.cap-card-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}

.cap-card-sub {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.7;
  overflow-wrap: anywhere;
}

.cap-help {
  display: grid;
  gap: 8px;
  width: 500px;
  max-width: 88vw;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.cap-help-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
}
</style>
