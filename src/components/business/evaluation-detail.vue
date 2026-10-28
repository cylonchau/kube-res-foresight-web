<script setup lang="ts">
import MetricLabel from '@/components/business/metric-label.vue';
import { computed, ref, watch } from 'vue';
import { NCheckbox, NCheckboxGroup, NDescriptions, NDescriptionsItem, NModal, NSpace } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { formatDecimal, formatMetric, formatPercent } from '@/utils/format';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'EvaluationDetail' });

interface Props {
  evaluation: Api.Forecast.Evaluation | null;
  moduleName: string;
  /** the unit of the metric the evaluation is of (cores, bytes, ...); the error values are in it */
  unit?: string;
}

const props = withDefaults(defineProps<Props>(), { unit: '' });
const show = defineModel<boolean>('show', { required: true });
const { t } = useI18n();

const KEYS = ['accuracy', 'wape', 'mae', 'bias', 'peak_under', 'coverage'] as const;
type Key = (typeof KEYS)[number];
const picked = ref<Key[]>(['accuracy', 'wape', 'bias', 'coverage']);
watch(show, visible => visible && (picked.value = ['accuracy', 'wape', 'bias', 'coverage']));

/** the value of every metric, and the sentence that says how it was computed from the forecast and the actual values */
const results = computed(() => {
  const e = props.evaluation;
  if (!e) return [];
  const value: Record<Key, string> = {
    accuracy: formatPercent(Math.max(0, 1 - e.wape)),
    wape: formatPercent(e.wape),
    mae: formatMetric(e.mae, props.unit),
    bias: formatMetric(e.bias, props.unit),
    peak_under: formatPercent(e.peak_under),
    coverage: formatPercent(e.coverage)
  };
  return KEYS.filter(key => picked.value.includes(key)).map(key => ({
    key,
    label: t(`page.forecast.evalMetric.${key}`),
    value: value[key],
    how: t(`page.forecast.evalMetric.${key}_how`, { points: e.points, wape: formatDecimal(e.wape * 100, 1) })
  }));
});
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    class="w-760px max-w-95vw"
    :title="evaluation ? `${evaluation.algorithm_id} · ${moduleName} · ${evaluation.metric}` : ''"
  >
    <div v-if="evaluation" class="max-h-70vh overflow-y-auto pr-8px">
      <NDescriptions :column="3" size="small" label-placement="left" bordered>
        <NDescriptionsItem :label="t('page.forecast.runs.time')">
          {{ formatDateTime(evaluation.prediction_time) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.evaluation.points')">{{ evaluation.points }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.evalMetric.unit')">{{ unit || '-' }}</NDescriptionsItem>
      </NDescriptions>
      <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.evalMetric.choose') }}</div>
      <NCheckboxGroup v-model:value="picked">
        <NSpace>
          <NCheckbox v-for="key in KEYS" :key="key" :value="key" :label="t(`page.forecast.evalMetric.${key}`)" />
        </NSpace>
      </NCheckboxGroup>
      <div class="metrics">
        <div v-for="item in results" :key="item.key" class="metric">
          <div class="metric__label"><MetricLabel :label="item.label" :metric="item.key" /></div>
          <div class="metric__value">{{ item.value }}</div>
          <div class="metric__how">{{ item.how }}</div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.metric {
  padding: 12px 14px;
  border: 1px solid rgb(var(--base-text-color) / 0.1);
  border-radius: 10px;
}
.metric__label {
  font-size: 12px;
  opacity: 0.65;
}
.metric__value {
  font-size: 22px;
  font-weight: 600;
}
.metric__how {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}
</style>
