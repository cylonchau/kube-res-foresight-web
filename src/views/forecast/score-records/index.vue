<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NModal, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import { useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetAlgorithmScores, fetchBatchDeleteRecords } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { copyCell } from '@/utils/copy-cell';
import { helpTitle } from '@/utils/help-title';

defineOptions({ name: 'ForecastScoreRecords' });

const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const percent = (value: number | undefined) =>
  value === undefined || value < 0 ? '-' : `${(value * 100).toFixed(1)}%`;

const search = reactive({
  moduleId: null as number | null,
  algorithm: '',
  range: lastHours(24 * 7) as [number, number] | null
});
// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.AlgorithmScore>(async (page, pageSize) => {
  const { data } = await fetchGetAlgorithmScores({
    module_id: search.moduleId ?? undefined,
    algorithm: search.algorithm.trim() || undefined,
    ...rangeParams(search.range),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

const checkedRowKeys = ref<number[]>([]);
const batchActions = computed(() => [{ key: 'delete', label: t('common.delete'), danger: true }]);

async function runBatch() {
  const { data, error } = await fetchBatchDeleteRecords({ kind: 'scores', ids: checkedRowKeys.value });
  if (error || !data) return;
  window.$message?.success(t('common.batchDone', { done: data.done }));
  checkedRowKeys.value = [];
  await list.reload();
}

const detail = ref<Api.Forecast.AlgorithmScore | null>(null);

const accuracyOf = (row: Api.Forecast.AlgorithmScore, metric: Api.Forecast.BreakdownRow['metric']) => {
  const part = row.breakdown?.find(item => item.metric === metric);
  return part ? percent(part.accuracy) : '-';
};

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  created_at: {
    title: t('page.forecast.scores.scoredAt'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.AlgorithmScore) => formatDateTime(row.created_at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.AlgorithmScore) => row.module_name || moduleName(row.module_id)
  },
  algorithm: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm',
    width: 170,
    sorter: true,
    resizable: true,
    render: (row: Api.Forecast.AlgorithmScore) => copyCell(row.algorithm)
  },
  score: {
    title: () => helpTitle(t('page.forecast.scores.score'), t('page.forecast.metricHelp.score')),
    key: 'score',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.AlgorithmScore) => row.score.toFixed(1)
  },
  rank: { title: t('page.forecast.scores.rank'), key: 'rank', width: 80, align: 'center', sorter: true },
  windows: { title: t('page.forecast.scores.windows'), key: 'windows', width: 90, align: 'center' },
  selected: {
    title: t('page.forecast.scores.wasInUse'),
    key: 'selected',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) =>
      row.selected
        ? h(NTag, { size: 'small', bordered: false, type: 'info' }, () => t('page.forecast.scores.wasInUse'))
        : '-'
  },
  cpu: {
    title: () => helpTitle(t('page.forecast.scores.cpuAccuracy'), t('page.forecast.metricHelp.accuracy')),
    key: 'cpu',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) => accuracyOf(row, 'cpu')
  },
  memory: {
    title: () => helpTitle(t('page.forecast.scores.memoryAccuracy'), t('page.forecast.metricHelp.accuracy')),
    key: 'memory',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) => accuracyOf(row, 'memory')
  },
  gpu: {
    title: () => helpTitle(t('page.forecast.scores.gpuAccuracy'), t('page.forecast.metricHelp.accuracy')),
    key: 'gpu',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) => accuracyOf(row, 'gpu')
  },
  oom: {
    title: () => helpTitle(t('page.forecast.scores.oomPenalty'), t('page.forecast.metricHelp.oomPenalty')),
    key: 'oom',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) => percent(row.result?.oom_penalty)
  },
  window: {
    title: t('page.forecast.scores.window'),
    key: 'window',
    width: 340,
    render: (row: Api.Forecast.AlgorithmScore) =>
      `${formatDateTime(row.window_start)} ~ ${formatDateTime(row.window_end)}`
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.AlgorithmScore) =>
      h(NButton, { size: 'tiny', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_score_records',
  columnMap,
  defaultKeys: [
    '__selection__',
    'created_at',
    'module',
    'algorithm',
    'score',
    'rank',
    'cpu',
    'memory',
    'oom',
    'window',
    'operate'
  ]
});

function resetSearch() {
  Object.assign(search, { moduleId: null, algorithm: '', range: lastHours(24 * 7) });
  list.search();
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="list.search" @reset="resetSearch">
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
        <NInput
          v-model:value="search.algorithm"
          clearable
          :placeholder="t('page.forecast.modules.algorithm')"
          @keyup.enter="list.search"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.scores.recordsTitle')"
      :help="t('page.forecast.scores.recordsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.scores.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="`${detail?.algorithm || ''} · ${detail?.module_name || ''}`"
      class="w-720px max-w-95vw"
      @update:show="value => !value && (detail = null)"
    >
      <ScoreBreakdown v-if="detail" :rows="detail.breakdown || []" :result="detail.result" :score="detail.score" />
    </NModal>
  </div>
</template>
