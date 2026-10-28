<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NDescriptions, NDescriptionsItem } from 'naive-ui';

defineOptions({ name: 'ScoreBreakdown' });

interface Props {
  rows: Api.Forecast.BreakdownRow[];
  result?: Api.Forecast.ScoreDetail | null;
  score?: number | null;
}

const props = withDefaults(defineProps<Props>(), { result: null, score: null });
const { t } = useI18n();
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const total = computed(() => props.rows.reduce((sum, row) => sum + row.contribution, 0));
const level = (value: number) => (value >= 0.85 ? 'good' : value >= 0.6 ? 'fair' : 'poor');
</script>

<template>
  <div class="flex-col gap-12px">
    <div class="breakdown-head">
      <span>{{ t('page.forecast.scores.composite') }}</span>
      <span class="breakdown-total">{{ (score ?? total).toFixed(2) }}</span>
    </div>

    <div class="breakdown-parts">
      <div v-for="row in rows" :key="row.metric" class="breakdown-part">
        <div class="breakdown-part__head">
          <span class="font-medium">{{ t(`page.forecast.scores.part_${row.metric}`) }}</span>
          <span class="breakdown-part__share">
            {{ t('page.forecast.scores.weightShare') }} {{ percent(row.weight) }} ·
            {{ t('page.forecast.scores.contribution') }}
            {{ row.contribution.toFixed(2) }}
          </span>
        </div>
        <div class="breakdown-part__bar" :class="`is-${level(row.accuracy)}`">
          <div class="breakdown-part__fill" :style="{ width: `${Math.max(0, Math.min(1, row.accuracy)) * 100}%` }" />
          <span class="breakdown-part__text">
            {{ t('page.forecast.scores.accuracy') }} {{ percent(row.accuracy) }} · {{ t('page.forecast.scores.error') }}
            {{ percent(row.error) }}
          </span>
        </div>
      </div>
    </div>

    <NDescriptions v-if="result" :column="3" size="small" label-placement="left" bordered>
      <NDescriptionsItem :label="t('page.forecast.scores.windows')">{{ result.windows }}</NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.scores.completeness')">
        {{ percent(result.completeness) }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.scores.oomPenalty')">
        {{ percent(result.oom_penalty) }} ({{ result.oom_events }})
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.scores.replicaExact')">{{ result.replica_exact }}</NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.scores.underProvisioned')">
        {{ result.under_provisioned }}
      </NDescriptionsItem>
    </NDescriptions>
  </div>
</template>

<style scoped>
.breakdown-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
}
.breakdown-total {
  font-size: 26px;
  font-weight: 600;
}
.breakdown-parts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.breakdown-part__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 4px;
  font-size: 13px;
}
.breakdown-part__share {
  font-size: 12px;
  opacity: 0.65;
}
.breakdown-part__bar {
  position: relative;
  height: 22px;
  border-radius: 11px;
  overflow: hidden;
  background: rgb(var(--base-text-color) / 0.08);
}
.breakdown-part__fill {
  height: 100%;
  border-radius: 11px;
}
.breakdown-part__bar.is-good .breakdown-part__fill {
  background: rgb(var(--success-color) / 0.55);
}
.breakdown-part__bar.is-fair .breakdown-part__fill {
  background: rgb(var(--warning-color) / 0.6);
}
.breakdown-part__bar.is-poor .breakdown-part__fill {
  background: rgb(var(--error-color) / 0.55);
}
.breakdown-part__text {
  position: absolute;
  inset: 0 10px;
  display: flex;
  align-items: center;
  font-size: 12px;
}
</style>
