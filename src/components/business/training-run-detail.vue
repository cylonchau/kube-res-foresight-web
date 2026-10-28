<script setup lang="ts">
import { NDescriptions, NDescriptionsItem, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TrainingDataChart from '@/components/business/training-data-chart.vue';
import { formatDateTime } from '@/utils/date';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'TrainingRunDetail' });

/** What one training run did: its state and why, the data and parameters it used, the formula and the data it saw. */
defineProps<{ run: Api.Forecast.TrainingRun }>();
const { t } = useI18n();

const stepLabel = (seconds: number) => {
  if (!seconds) return '-';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};
const statusType = (status: string) => (status === 'ok' ? 'success' : status === 'failed' ? 'error' : 'warning');
const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);
const pretty = (raw: string) => {
  if (!raw) return '-';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};
</script>

<template>
  <div class="pr-8px">
    <NDescriptions :column="2" size="small" label-placement="left" bordered>
      <NDescriptionsItem :label="t('common.status')">
        <NTag size="small" :bordered="false" :type="statusType(run.status)">
          {{ t(`page.forecast.runs.status_${run.status}`) }}
        </NTag>
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.time')">
        {{ formatDateTime(run.prediction_time) }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.modelVersion')" :span="2">
        {{ run.model_version || '-' }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.implVersion')">
        {{ run.impl_version || '-' }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.duration')">
        {{ duration(run.duration_ms) }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.samples')">{{ run.samples }}</NDescriptionsItem>
      <NDescriptionsItem :label="t('page.monitoring.datasets.step')">
        {{ stepLabel(run.step_seconds) }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.horizonSteps')">
        {{ run.horizon_steps }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.points')">{{ run.points }}</NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.window')" :span="2">
        {{
          run.window_start && run.window_end
            ? `${formatDateTime(run.window_start)} ~ ${formatDateTime(run.window_end)}`
            : '-'
        }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.covariates')" :span="2">
        {{ run.covariates || '-' }}
      </NDescriptionsItem>
      <NDescriptionsItem v-if="run.dropped_covariates" :label="t('page.forecast.runs.dropped')" :span="2">
        <pre class="m-0 whitespace-pre-wrap text-12px">{{ pretty(run.dropped_covariates) }}</pre>
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.meaning')" :span="2">
        {{ t(`page.forecast.runs.meaning_${run.status}`) }}
      </NDescriptionsItem>
      <NDescriptionsItem :label="t('page.forecast.runs.reason')" :span="2">
        {{ reasonText(run.reason) || (run.status === 'ok' ? t('page.forecast.runs.noReason') : '-') }}
      </NDescriptionsItem>
    </NDescriptions>
    <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.runs.params') }}</div>
    <pre class="run-pre">{{ pretty(run.params) }}</pre>
    <template v-if="run.formula">
      <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.formula.sectionFormula') }}</div>
      <pre class="run-pre">{{ run.formula }}</pre>
      <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.algorithms.formula.sectionSchema') }}</div>
      <pre class="run-pre">{{ pretty(run.param_schema) }}</pre>
    </template>
    <p class="mt-12px text-12px opacity-70">{{ t('page.forecast.runs.reproduceHint') }}</p>
    <div class="mb-6px mt-16px font-medium">{{ t('page.forecast.runs.tabData') }}</div>
    <TrainingDataChart :run-id="run.id" />
  </div>
</template>

<style scoped>
.run-pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgb(127 127 127 / 12%);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
