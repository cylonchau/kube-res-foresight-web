<script setup lang="ts">
import { computed, ref } from 'vue';
import { NCheckbox, NCheckboxGroup, NSpace } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { formatMetric, formatPercent } from '@/utils/format';

defineOptions({ name: 'BacktestMetrics' });

interface Props {
  /** JSON of the metrics of the algorithm and of its baseline (model.BacktestRun.metrics) */
  metrics: string;
  baselineMetrics: string;
  baselineId?: string;
  unit?: string;
}

const props = withDefaults(defineProps<Props>(), { baselineId: '', unit: '' });
const { t } = useI18n();

const KEYS = ['accuracy', 'wape', 'mae', 'rmse', 'pinball', 'peak_under', 'coverage'] as const;
type Key = (typeof KEYS)[number];
const picked = ref<Key[]>(['accuracy', 'wape', 'mae', 'peak_under', 'coverage']);

function parse(raw: string): Api.Forecast.BacktestMetrics | null {
  try {
    const value = JSON.parse(raw) as Api.Forecast.BacktestMetrics;
    return value && !value.skipped ? value : null;
  } catch {
    return null;
  }
}
const own = computed(() => parse(props.metrics));
const base = computed(() => parse(props.baselineMetrics));

function show(m: Api.Forecast.BacktestMetrics | null, key: Key) {
  if (!m) return '-';
  switch (key) {
    case 'accuracy':
      return formatPercent(Math.max(0, 1 - m.wape));
    case 'wape':
    case 'peak_under':
    case 'coverage':
      return formatPercent(m[key]);
    case 'mae':
    case 'rmse':
    case 'pinball':
      return formatMetric(m[key], props.unit);
  }
}

const cards = computed(() =>
  KEYS.filter(key => picked.value.includes(key)).map(key => ({
    key,
    label: t(`page.forecast.evalMetric.${key}`),
    value: show(own.value, key),
    baseline: show(base.value, key),
    how: t(`page.forecast.evalMetric.${key}_how`, {
      points: own.value?.points ?? 0,
      wape: own.value ? formatPercent(own.value.wape) : '-'
    })
  }))
);
</script>

<template>
  <div>
    <div class="mb-6px mt-12px font-medium">{{ t('page.forecast.evalMetric.choose') }}</div>
    <NCheckboxGroup v-model:value="picked">
      <NSpace>
        <NCheckbox v-for="key in KEYS" :key="key" :value="key" :label="t(`page.forecast.evalMetric.${key}`)" />
      </NSpace>
    </NCheckboxGroup>
    <div class="metrics">
      <div v-for="item in cards" :key="item.key" class="metric">
        <div class="metric__label">{{ item.label }}</div>
        <div class="metric__value">{{ item.value }}</div>
        <div v-if="baselineId" class="metric__base">{{ baselineId }}: {{ item.baseline }}</div>
        <div class="metric__how">{{ item.how }}</div>
      </div>
    </div>
  </div>
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
.metric__base {
  font-size: 12px;
  opacity: 0.75;
}
.metric__how {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}
</style>
