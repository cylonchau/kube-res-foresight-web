<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NDataTable, NDescriptions, NDescriptionsItem, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import { fetchGetAlgorithmScores } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatMemoryBytes } from '@/utils/format';

defineOptions({ name: 'ScoreBasis' });

/**
 * What a grade was computed from, in parts laid one under the other: the result, the basis (the sources, the formula with the figures
 * put in, and the window by window forecast, actual need and error of the resource), and the earlier grades of the algorithm.
 */
const props = defineProps<{ row: Api.Forecast.ScoreRow }>();
const { t } = useI18n();

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const isResource = computed(() => props.row.metric !== 'overall');
const metric = computed(() => props.row.metric as 'cpu' | 'memory' | 'gpu');
const result = computed(() => props.row.result);

const unitText = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  if (metric.value === 'memory') return formatMemoryBytes(value);
  if (metric.value === 'cpu') return `${formatDecimal(value, 3)} ${t('page.forecast.scores.cores')}`;
  return `${formatDecimal(value, 0)} ${t('page.forecast.scores.cards')}`;
};

const windows = computed(() => (result.value?.details || []).filter(item => item.actual[metric.value] != null));
const sums = computed(() => {
  let error = 0;
  let actual = 0;
  for (const item of windows.value) {
    error += item.error[metric.value] ?? 0;
    actual += Math.abs(item.actual[metric.value] ?? 0);
  }
  return { error, actual };
});
const sources = computed(() => (result.value?.sources?.[props.row.metric] || []).join(', ') || '-');
const oomFactor = computed(() => (metric.value === 'memory' ? 1 - (result.value?.oom_penalty ?? 0) : 1));
const holes = computed(() => 0.7 + 0.3 * (result.value?.completeness ?? 1));

const columns = computed<DataTableColumns<Api.Forecast.ScoreWindowDetail>>(() => [
  {
    title: t('page.forecast.scores.window'),
    key: 'start',
    width: 250,
    render: item => `${formatDateTime(item.start)} ~ ${formatDateTime(item.end)}`
  },
  {
    title: t('page.forecast.scores.actualNeed'),
    key: 'actual',
    width: 120,
    align: 'right',
    render: item => unitText(item.actual[metric.value])
  },
  {
    title: t('page.forecast.scores.predictedNeed'),
    key: 'predicted',
    width: 120,
    align: 'right',
    render: item => unitText(item.predicted[metric.value])
  },
  {
    title: t('page.forecast.scores.windowError'),
    key: 'error',
    width: 130,
    align: 'right',
    render: item => {
      const diff = (item.predicted[metric.value] ?? 0) - (item.actual[metric.value] ?? 0);
      const text = unitText(item.error[metric.value]);
      return diff < 0
        ? h('span', [
            text,
            ' ',
            h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, () => t('page.forecast.scores.short'))
          ])
        : text;
    }
  }
]);

// the earlier grades of this algorithm in this module
const history = ref<Array<{ at: string; score: number; selected: boolean; rank: number }>>([]);
const historyLoading = ref(false);
async function loadHistory() {
  historyLoading.value = true;
  const { data } = await fetchGetAlgorithmScores({
    module_id: props.row.module_id,
    algorithm: props.row.algorithm,
    page: 1,
    page_size: 30,
    sort_by: 'created_at',
    sort_order: 'descend'
  } as never);
  historyLoading.value = false;
  history.value = (data?.list || []).map(item => ({
    at: item.created_at,
    score: isResource.value
      ? (item.breakdown?.find(part => part.metric === props.row.metric)?.score ?? NaN)
      : item.score,
    selected: item.selected,
    rank: item.rank
  }));
}
watch(() => [props.row.module_id, props.row.algorithm, props.row.metric], loadHistory, { immediate: true });

const historyColumns = computed<DataTableColumns<(typeof history.value)[number]>>(() => [
  { title: t('page.forecast.scores.scoredAt'), key: 'at', width: 180, render: item => formatDateTime(item.at) },
  {
    title: t('page.forecast.scores.score'),
    key: 'score',
    width: 100,
    align: 'center',
    render: item => (Number.isNaN(item.score) ? '-' : item.score.toFixed(1))
  },
  {
    title: t('page.forecast.scores.rank'),
    key: 'rank',
    width: 90,
    align: 'center',
    render: item => (isResource.value ? '-' : item.rank)
  },
  {
    title: t('page.forecast.scores.wasInUse'),
    key: 'selected',
    width: 110,
    align: 'center',
    render: item =>
      item.selected
        ? h(NTag, { size: 'small', bordered: false, type: 'info' }, () => t('page.forecast.scores.wasInUse'))
        : '-'
  }
]);
</script>

<template>
  <div class="max-h-70vh flex flex-col gap-14px overflow-y-auto pr-8px">
    <section>
      <div class="mb-6px font-medium">{{ t('page.forecast.scores.partResult') }}</div>
      <NDescriptions :column="3" size="small" label-placement="left" bordered>
        <NDescriptionsItem :label="t('page.forecast.scores.score')">{{ row.score.toFixed(1) }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.scores.accuracy')">{{ percent(row.accuracy) }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.scores.rank')">{{ row.rank }} / {{ row.ranked }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.scores.windows')">{{ row.windows }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.scores.scoredAt')">{{ formatDateTime(row.at) }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('page.forecast.scores.inUse')">
          {{ row.selected ? t('common.yesOrNo.yes') : t('common.yesOrNo.no') }}
        </NDescriptionsItem>
      </NDescriptions>
    </section>

    <section>
      <div class="mb-6px font-medium">{{ t('page.forecast.scores.partBasis') }}</div>
      <template v-if="isResource">
        <NDescriptions :column="1" size="small" label-placement="left" bordered>
          <NDescriptionsItem :label="t('page.forecast.scores.basisSources')">{{ sources }}</NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.scores.basisHow')">
            {{ t('page.forecast.scores.basisFormula') }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('page.forecast.scores.basisFigures')">
            {{
              t('page.forecast.scores.basisFigureText', {
                error: unitText(sums.error),
                actual: unitText(sums.actual),
                accuracy: percent(row.accuracy),
                under: result?.under_weight ?? 2,
                holes: holes.toFixed(2),
                oom: oomFactor.toFixed(2),
                score: row.score.toFixed(1)
              })
            }}
          </NDescriptionsItem>
        </NDescriptions>
        <NDataTable class="mt-8px" size="small" :columns="columns" :data="windows" :scroll-x="620" :max-height="260" />
      </template>
      <template v-else>
        <div class="mb-6px text-13px leading-22px">{{ t('page.forecast.scores.basisOverall') }}</div>
        <ScoreBreakdown :rows="row.breakdown || []" :result="result as never" :score="row.score" />
      </template>
    </section>

    <section>
      <div class="mb-6px font-medium">{{ t('page.forecast.scores.partHistory') }}</div>
      <NDataTable size="small" :loading="historyLoading" :columns="historyColumns" :data="history" :max-height="240" />
    </section>
  </div>
</template>
