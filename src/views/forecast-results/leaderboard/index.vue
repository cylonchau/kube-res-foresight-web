<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NFormItemGi, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import BatchActions from '@/components/business/batch-actions.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetLeaderboard } from '@/service/api';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { formatDecimal, formatPercent } from '@/utils/format';
import { copyCell } from '@/utils/copy-cell';
import { reasonText } from '@/utils/reason';
import { helpTitle } from '@/utils/help-title';

defineOptions({ name: 'ForecastResultsLeaderboard' });

const { t } = useI18n();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  range: lastHours(24 * 7) as [number, number] | null
});
const checkedRowKeys = ref<string[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  onChange: (page: number) => (pagination.page = page),
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});
const rows = ref<Api.Forecast.LeaderboardEntry[]>([]);
const loading = ref(false);

// the kinds of metric the module forecasts: one leaderboard per kind, with every enabled algorithm that has measured values
const selected = computed(() => modules.value.find(item => item.id === search.moduleId));
const metricOptions = computed(() => {
  const kinds = [
    ...new Set((selected.value?.sources || []).filter(source => source.enabled).map(source => source.kind))
  ];
  return kinds.map(value => ({ label: t(`page.datasource.mappings.metric_${value}`), value }));
});

const ranked = (row: Api.Forecast.LeaderboardEntry) => row.status === 'ready';
const percent = (value: number) => formatPercent(value);
const number = (value: number) => formatDecimal(value);
/** an enabled algorithm without a measured result has no figures; its status and reason are shown instead */
const figure = (row: Api.Forecast.LeaderboardEntry, text: (value: number) => string, value: number) =>
  ranked(row) ? text(value) : '-';
const yesNo = (value: boolean | undefined) =>
  value === undefined
    ? '-'
    : h(NTag, { size: 'small', bordered: false, type: value ? 'success' : 'default' }, () =>
        t(value ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
      );

async function load() {
  if (!search.moduleId || !search.metric) {
    rows.value = [];
    return;
  }
  loading.value = true;
  const { data } = await fetchGetLeaderboard(search.moduleId, { kind: search.metric, ...rangeParams(search.range) });
  loading.value = false;
  rows.value = data || [];
  checkedRowKeys.value = [];
  pagination.page = 1;
}

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, metric: null, range: lastHours(24 * 7) });
  load();
}

watch(
  () => search.moduleId,
  () => {
    if (!metricOptions.value.some(item => item.value === search.metric))
      search.metric = metricOptions.value[0]?.value ?? null;
  }
);

const batchActions = computed(() => [{ key: 'export', label: t('page.forecast.metrics.exportCsv') }]);

/** The checked rows as a CSV, with the values as shown (three decimals at most). */
function exportChecked() {
  const keys = new Set(checkedRowKeys.value);
  const lines = ['rank,algorithm,wape,risk_wape,mae,bias,peak_under,coverage,runs,points'];
  rows.value.forEach(r => {
    if (keys.has(`${r.algorithm_id}/${r.metric}`) && ranked(r))
      lines.push(
        [
          r.rank,
          r.algorithm_id,
          r.wape.toFixed(3),
          r.risk_wape.toFixed(3),
          r.mae.toFixed(3),
          r.bias.toFixed(3),
          r.peak_under.toFixed(3),
          r.coverage.toFixed(3),
          r.runs,
          r.points
        ].join(',')
      );
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = 'kube-res-foresight-leaderboard.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

const centered = { width: 76, align: 'center' };
const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  rank: {
    title: () => helpTitle(t('page.forecast.evaluation.rank'), t('page.forecast.metricHelp.rank')),
    key: 'rank',
    width: 76,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => (ranked(row) ? row.rank : '-')
  },
  algorithm_id: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm_id',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.LeaderboardEntry) => copyCell(row.algorithm_id)
  },
  status: {
    title: () => helpTitle(t('page.forecast.evaluation.status'), t('page.forecast.metricHelp.status')),
    key: 'status',
    width: 84,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) =>
      h(
        NTag,
        {
          size: 'small',
          bordered: false,
          type: row.status === 'failed' ? 'error' : ranked(row) ? 'success' : 'warning'
        },
        () => t(`page.forecast.ranking.state_${row.status}`)
      )
  },
  reason: {
    title: t('page.forecast.evaluation.reason'),
    key: 'reason',
    minWidth: 200,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.LeaderboardEntry) => reasonText(row.reason) || '-'
  },
  baseline: {
    title: t('page.forecast.evaluation.role'),
    key: 'baseline',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) =>
      h(NTag, { size: 'small', bordered: false, type: row.baseline ? 'default' : 'info' }, () =>
        t(row.baseline ? 'page.forecast.evaluation.baseline' : 'page.forecast.evaluation.candidate')
      )
  },
  wape: {
    title: () => helpTitle('WAPE', t('page.forecast.metricHelp.wape')),
    key: 'wape',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, percent, row.wape)
  },
  risk_wape: {
    title: () => helpTitle(t('page.forecast.evaluation.riskWape'), t('page.forecast.metricHelp.riskWape')),
    key: 'risk_wape',
    width: 96,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, percent, row.risk_wape)
  },
  mae: {
    title: () => helpTitle('MAE', t('page.forecast.metricHelp.mae')),
    key: 'mae',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, number, row.mae)
  },
  bias: {
    title: () => helpTitle(t('page.forecast.evaluation.bias'), t('page.forecast.metricHelp.bias')),
    key: 'bias',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, number, row.bias)
  },
  peak_under: {
    title: () => helpTitle(t('page.forecast.evaluation.peakUnder'), t('page.forecast.metricHelp.peakUnder')),
    key: 'peak_under',
    width: 88,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, percent, row.peak_under)
  },
  coverage: {
    title: () => helpTitle(t('page.forecast.evaluation.coverage'), t('page.forecast.metricHelp.coverage')),
    key: 'coverage',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => figure(row, percent, row.coverage)
  },
  runs: {
    title: () => helpTitle(t('page.forecast.evaluation.runs'), t('page.forecast.metricHelp.runs')),
    key: 'runs',
    width: 64,
    align: 'center'
  },
  points: {
    title: () => helpTitle(t('page.forecast.evaluation.points'), t('page.forecast.metricHelp.points')),
    key: 'points',
    ...centered
  },
  beats_baseline: {
    title: () => helpTitle(t('page.forecast.evaluation.beatsBaseline'), t('page.forecast.metricHelp.beatsBaseline')),
    key: 'beats_baseline',
    width: 96,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => yesNo(row.beats_baseline)
  },
  promoted: {
    title: () => helpTitle(t('page.forecast.evaluation.promoted'), t('page.forecast.metricHelp.promoted')),
    key: 'promoted',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => yesNo(row.promoted)
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_leaderboard',
  columnMap,
  defaultKeys: [
    '__selection__',
    'rank',
    'algorithm_id',
    'status',
    'risk_wape',
    'wape',
    'baseline',
    'mae',
    'bias',
    'peak_under',
    'coverage',
    'runs',
    'points',
    'beats_baseline',
    'promoted',
    'reason'
  ]
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  search.moduleId = modules.value[0]?.id ?? null;
  search.metric = metricOptions.value[0]?.value ?? null;
  // the search is submitted by the list-search plugin when the filters above change
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="4" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="8" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          :options="metricOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.metric') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.evaluation.leaderboard')"
      :help="t('page.forecast.evaluation.leaderboardHint')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :remote="false"
      :pagination="pagination"
      :row-key="(row: any) => `${row.algorithm_id}/${row.metric}`"
      :empty-hint="t('page.forecast.results.leaderboardEmpty')"
      @refresh="load"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="exportChecked" />
      </template>
    </ListTablePanel>
  </div>
</template>
