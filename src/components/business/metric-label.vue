<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';

defineOptions({ name: 'MetricLabel' });

/**
 * The name of a measure with a question mark that says what it is, how it is computed and what it is for. `metric` is the key of
 * the explanation in page.forecast.metricHelp (wape, riskWape, mae, bias, peakUnder, coverage, accuracy ...); a measure with no
 * explanation is shown as its name only.
 */
const props = defineProps<{ label: string; metric?: string }>();
const { t, te } = useI18n();

/** the keys of the evaluation metrics as the pages name them, to the keys of the explanations */
const ALIAS: Record<string, string> = { risk_wape: 'riskWape', peak_under: 'peakUnder' };
const help = computed(() => {
  const key = props.metric ? (ALIAS[props.metric] ?? props.metric) : '';
  const path = `page.forecast.metricHelp.${key}`;
  return key && te(path) ? t(path) : '';
});
</script>

<template>
  <span class="inline-flex items-center gap-4px">
    {{ label }}
    <IconTooltip v-if="help" icon="mdi-help-circle" placement="top">
      <div class="max-w-360px whitespace-pre-line leading-22px">{{ help }}</div>
    </IconTooltip>
  </span>
</template>
