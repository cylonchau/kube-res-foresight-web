<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NDataTable, NModal, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { fetchGetModuleDelayReport, fetchGetScaleOutcomes } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { percentName } from '@/utils/percentile';

defineOptions({ name: 'ScaleOutcomeModal' });

/**
 * The scale-ups the platform decided ahead of the load and whether each came in time: the replicas predicted against what the load
 * needed, how long the replicas took to become Ready, and how far before (or after) the load that was.
 */
const props = defineProps<{ show: boolean; moduleId: number | null; moduleName: (id: number) => string }>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();
const { t } = useI18n();

const list = usePagedList<Api.Forecast.ScaleOutcome>(async (page, pageSize) => {
  const { data } = await fetchGetScaleOutcomes({ module_id: props.moduleId ?? undefined, page, page_size: pageSize });
  return data;
});
list.pagination.pageSize = 8;
list.pagination.showSizePicker = false;

// ---- the acceptance of the prediction delay of the module, over the last day
const report = ref<Api.Forecast.DelayReport | null>(null);
async function loadReport() {
  report.value = null;
  if (props.moduleId === null) return;
  const { data } = await fetchGetModuleDelayReport(props.moduleId);
  report.value = data ?? null;
}
const verdictTag = { pass: 'success', fail: 'error', insufficient: 'default' } as const;
function figure(item: Api.Forecast.DelayIndicator, value: number) {
  // the forecast reach as a multiple of the lead (6.0×), the other ratios as shares
  if (item.key === 'reach_over_lead') return `${value.toFixed(1)}×`;
  return item.unit === 'ratio' ? `${(value * 100).toFixed(1)}%` : `${Math.round(value)} s`;
}
function indicatorLine(item: Api.Forecast.DelayIndicator) {
  if (item.verdict === 'insufficient') return t('page.forecast.delay.insufficient', { n: item.samples });
  return `${figure(item, item.value)} ${t('page.forecast.delay.target')} ${item.op} ${figure(item, item.target)}`;
}

watch(
  () => props.show,
  value => {
    if (value) {
      list.reload();
      loadReport();
    }
  }
);

const rowKey = (row: Api.Forecast.ScaleOutcome) => row.id;
const seconds = (n: number) => t('page.forecast.explain.aheadSeconds', { n: Math.round(n) });
const verdictType = { pending: 'default', timely: 'success', late: 'error', unneeded: 'warning' } as const;

const columns = computed<DataTableColumns<Api.Forecast.ScaleOutcome>>(() => [
  {
    title: t('page.forecast.explain.aheadDecidedAt'),
    key: 'decided_at',
    width: 170,
    render: row => formatDateTime(row.decided_at)
  },
  {
    title: t('page.forecast.modules.name'),
    key: 'module_id',
    minWidth: 140,
    ellipsis: { tooltip: true },
    render: row => props.moduleName(row.module_id)
  },
  {
    title: t('page.forecast.explain.aheadFromTo'),
    key: 'replicas',
    width: 140,
    render: row =>
      h('div', { class: 'flex items-center gap-6px' }, [
        `${row.from_replicas} → ${row.to_replicas}`,
        h(NTag, { size: 'small', bordered: false, type: row.emergency ? 'error' : 'default' }, () =>
          t(row.emergency ? 'page.forecast.explain.aheadViaLive' : 'page.forecast.explain.aheadViaForecast')
        )
      ])
  },
  {
    title: t('page.forecast.explain.aheadLeadCol'),
    key: 'lead_seconds',
    width: 90,
    render: row => seconds(row.lead_seconds)
  },
  {
    title: t('page.forecast.explain.aheadActualNeed'),
    key: 'actual_need',
    width: 140,
    render: row => (row.verdict === 'pending' && !row.actual_need ? '-' : row.actual_need)
  },
  {
    title: t('page.forecast.explain.aheadReadyAfter'),
    key: 'ready_seconds',
    width: 100,
    render: row => (row.ready_seconds > 0 ? seconds(row.ready_seconds) : '-')
  },
  {
    title: t('page.forecast.explain.aheadVerdict'),
    key: 'verdict',
    width: 200,
    render: row => {
      const detail =
        row.verdict === 'timely'
          ? t('page.forecast.explain.aheadSlack', { n: Math.round(row.slack_seconds) })
          : row.verdict === 'late'
            ? t('page.forecast.explain.aheadLate', { n: Math.round(row.late_seconds) })
            : '';
      return h('div', { class: 'flex items-center gap-6px' }, [
        h(NTag, { size: 'small', bordered: false, type: verdictType[row.verdict] }, () =>
          t(`page.forecast.explain.aheadVerdict_${row.verdict}`)
        ),
        detail
      ]);
    }
  }
]);
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('page.forecast.explain.aheadHistory')"
    class="w-960px max-w-95vw"
    @update:show="value => emit('update:show', value)"
  >
    <div v-if="report" class="delay-report mb-12px">
      <div class="mb-6px flex flex-wrap items-center gap-8px">
        <span class="font-medium">{{ t('page.forecast.delay.title') }}</span>
        <NTag size="small" :bordered="false" :type="verdictTag[report.verdict]">
          {{ t(`page.forecast.delay.verdict_${report.verdict}`) }}
        </NTag>
        <span class="text-12px opacity-65">
          {{ t('page.forecast.delay.window', { hours: report.hours, judged: report.judged, scaled: report.scaled }) }}
        </span>
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-16px gap-y-6px">
        <div v-for="item in report.indicators" :key="item.key" class="text-13px leading-20px" :title="item.note">
          <NTag size="tiny" :bordered="false" :type="verdictTag[item.verdict]">
            {{ t(`page.forecast.delay.verdict_${item.verdict}`) }}
          </NTag>
          <span class="ml-6px">
            {{ t(`page.forecast.delay.indicator_${item.key}`, { p: percentName(item.percentile) }) }}
          </span>
          <div class="pl-2px text-12px opacity-65">{{ indicatorLine(item) }}</div>
        </div>
      </div>
    </div>
    <div v-else-if="moduleId === null" class="mb-12px text-12px leading-20px opacity-70">
      {{ t('page.forecast.delay.pickModule') }}
    </div>
    <div class="mb-8px text-12px leading-20px opacity-70">{{ t('page.forecast.explain.aheadHistoryHelp') }}</div>
    <NDataTable
      remote
      size="small"
      :loading="list.loading.value"
      :columns="columns"
      :data="list.rows.value"
      :pagination="list.pagination"
      :row-key="rowKey"
      :scroll-x="880"
    />
  </NModal>
</template>
