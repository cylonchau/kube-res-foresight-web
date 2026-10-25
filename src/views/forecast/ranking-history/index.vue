<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NInput, NModal, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import BatchActions from '@/components/business/batch-actions.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import RankLane from '@/components/business/rank-lane.vue';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetHistoryRankings } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastRankingHistory' });

const { t, locale } = useI18n();
const { moduleOptions, loadModules } = useForecastModules();

const search = reactive({
  moduleId: null as number | null,
  algorithm: '',
  range: lastHours(24 * 30) as [number, number] | null
});
const list = usePagedList<Api.Forecast.HistoryRanking>(async (page, pageSize) => {
  const { data } = await fetchGetHistoryRankings({
    module_id: search.moduleId ?? undefined,
    algorithm: search.algorithm.trim() || undefined,
    ...rangeParams(search.range),
    page,
    page_size: pageSize
  });
  return data;
});

const detail = ref<Api.Forecast.HistoryRanking | null>(null);
const detailRow = ref<Api.Forecast.HistoryRankingRow | null>(null);

const rowKey = (row: Api.Forecast.HistoryRanking) => `${row.module_id}/${row.at}`;
const checkedRowKeys = ref<string[]>([]);
const batchActions = computed(() => [{ key: 'export', label: t('page.forecast.metrics.exportCsv') }]);

/** The checked evaluations as a CSV: one line per algorithm of each, with its rank and score. */
function exportChecked() {
  const keys = new Set(checkedRowKeys.value);
  const lines = ['evaluated_at,module,algorithm,rank,score,windows,in_use'];
  for (const entry of list.rows.value.filter(item => keys.has(rowKey(item)))) {
    for (const r of entry.rows)
      lines.push(
        [entry.at, entry.module_name, r.algorithm, r.rank, r.score.toFixed(3), r.windows, r.selected].join(',')
      );
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = 'kube-resource-fcst-ranking-history.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  at: {
    title: t('page.forecast.scores.scoredAt'),
    key: 'at',
    width: 170,
    render: (row: Api.Forecast.HistoryRanking) => formatDateTime(row.at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module_name',
    width: 150,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  window: {
    title: t('page.forecast.scores.window'),
    key: 'window',
    width: 340,
    render: (row: Api.Forecast.HistoryRanking) =>
      `${formatDateTime(row.window_start)} ~ ${formatDateTime(row.window_end)}`
  },
  best: {
    title: t('page.forecast.ranking.best'),
    key: 'best',
    width: 170,
    render: (row: Api.Forecast.HistoryRanking) =>
      h(NTag, { size: 'small', bordered: false, type: 'success' }, () => row.best || '-')
  },
  selected: {
    title: t('page.forecast.scores.inUse'),
    key: 'selected',
    width: 170,
    render: (row: Api.Forecast.HistoryRanking) => row.selected || '-'
  },
  ranking: {
    title: t('page.forecast.ranking.order'),
    key: 'ranking',
    minWidth: 420,
    render: (row: Api.Forecast.HistoryRanking) =>
      h(
        'div',
        { class: 'flex flex-wrap gap-4px py-2px' },
        row.rows.map(item =>
          h(
            NTag,
            { size: 'small', bordered: false, type: item.rank === 1 ? 'success' : item.selected ? 'info' : 'default' },
            () => `#${item.rank} ${item.algorithm} ${item.score.toFixed(1)}`
          )
        )
      )
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.HistoryRanking) =>
      h(
        NButton,
        {
          size: 'small',
          type: 'primary',
          ghost: true,
          onClick: () => ((detail.value = row), (detailRow.value = row.rows[0] ?? null))
        },
        () => t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_ranking_history',
  columnMap,
  defaultKeys: ['__selection__', 'at', 'module', 'best', 'selected', 'ranking', 'window', 'operate']
});

// ---- the score of each algorithm over time, for one module
const trend = ref<Api.Forecast.HistoryRanking[]>([]);
const trendModule = computed(() => search.moduleId);

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', top: 0 },
      grid: { left: 48, right: 24, top: 40, bottom: 56 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', min: 0, max: 100 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16 }],
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function loadTrend() {
  if (!search.moduleId) {
    trend.value = [];
    await draw();
    return;
  }
  const { data } = await fetchGetHistoryRankings({
    page: 1,
    page_size: 200,
    module_id: search.moduleId,
    algorithm: search.algorithm.trim() || undefined,
    ...rangeParams(search.range)
  });
  trend.value = [...(data?.list || [])].reverse();
  await draw();
}

async function draw() {
  const byAlgorithm = new Map<string, Array<[string, number]>>();
  for (const entry of trend.value) {
    for (const row of entry.rows) {
      if (!byAlgorithm.has(row.algorithm)) byAlgorithm.set(row.algorithm, []);
      byAlgorithm.get(row.algorithm)!.push([entry.at, row.score]);
    }
  }
  await updateOptions(opts => ({
    ...opts,
    series: [...byAlgorithm].map(([name, data]) => ({
      name,
      type: 'line',
      showSymbol: data.length < 40,
      data
    })) as never
  }));
}

function run() {
  list.search();
  loadTrend();
}

function resetSearch() {
  Object.assign(search, { moduleId: null, algorithm: '', range: lastHours(24 * 30) });
  run();
}

watch(locale, draw);
onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  run();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="run" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="8" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="6" :label="t('page.forecast.modules.algorithm')">
        <NInput v-model:value="search.algorithm" clearable @keyup.enter="run" />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard v-show="trendModule" :bordered="false" size="small" class="card-wrapper rounded-16px shadow-sm">
      <div class="mb-4px flex items-center gap-6px font-medium">{{ t('page.forecast.ranking.trendTitle') }}</div>
      <div ref="domRef" class="h-240px w-full"></div>
    </NCard>

    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.ranking.historyTitle')"
      :help="t('page.forecast.ranking.historyHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :row-key="rowKey"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.scores.empty')"
      @refresh="run"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="exportChecked" />
      </template>
    </ListTablePanel>

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="`${detail?.module_name || ''} · ${detail ? formatDateTime(detail.at) : ''}`"
      class="w-760px max-w-95vw"
      @update:show="value => !value && ((detail = null), (detailRow = null))"
    >
      <div v-if="detail" class="flex-col gap-8px">
        <RankLane
          v-for="row in detail.rows"
          :key="row.algorithm"
          :rank="row.rank"
          :name="row.algorithm"
          :score="row.score"
          :active="row.selected"
          :tags="row.selected ? [{ label: t('page.forecast.scores.inUse'), type: 'info' }] : []"
          :caption="`${row.windows} ${t('page.forecast.scores.windows')}`"
        >
          <template #actions>
            <NButton size="small" @click="detailRow = row">{{ t('page.forecast.scores.parts') }}</NButton>
          </template>
        </RankLane>
      </div>
      <div v-if="detailRow" class="mt-12px">
        <div class="mb-6px font-medium">{{ detailRow.algorithm }}</div>
        <ScoreBreakdown :rows="detailRow.breakdown" :score="detailRow.score" />
      </div>
    </NModal>
  </div>
</template>
