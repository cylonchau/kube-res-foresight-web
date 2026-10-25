<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import BacktestMetrics from '@/components/business/backtest-metrics.vue';
import RecordDetailModal from '@/components/business/record-detail-modal.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { sourceMetricOptions, useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchSearchBacktests, fetchBatchDeleteRecords } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatPercent } from '@/utils/format';

defineOptions({ name: 'ForecastResultsBacktests' });

const { t } = useI18n();
const { modules, moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  promoted: null as string | null,
  range: lastHours(24 * 7) as [number, number] | null
});

const metricOptions = computed(() => sourceMetricOptions(modules.value, search.moduleId));
const promotedOptions = computed(() => [
  { label: t('page.forecast.evaluation.promoted'), value: 'true' },
  { label: t('page.forecast.results.notPromoted'), value: 'false' }
]);

const percent = (value: number) => formatPercent(value, 1);
const yesNo = (value: boolean) =>
  h(NTag, { size: 'small', bordered: false, type: value ? 'success' : 'default' }, () =>
    t(value ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
  );

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
const score = (row: Api.Forecast.BacktestRun) => {
  const m = parse<Api.Forecast.BacktestMetrics>(row.metrics);
  return m && !m.skipped ? m : null;
};

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.BacktestRun>(async (page, pageSize) => {
  const { data } = await fetchSearchBacktests({
    module_id: search.moduleId ?? undefined,
    metric: search.metric ?? undefined,
    promoted: search.promoted === null ? undefined : search.promoted === 'true',
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
  const { data, error } = await fetchBatchDeleteRecords({ kind: 'backtests', ids: checkedRowKeys.value });
  if (error || !data) return;
  window.$message?.success(t('common.batchDone', { done: data.done }));
  checkedRowKeys.value = [];
  await list.reload();
}

function resetSearch() {
  Object.assign(search, { moduleId: null, metric: null, promoted: null, range: lastHours(24 * 7) });
}

const detail = ref<Api.Forecast.BacktestRun | null>(null);

const KIND_UNIT: Record<string, string> = { cpu: 'cores', memory: 'bytes' };
/** the unit of the metric a backtest ran on, from the source it was made on */
function unitOf(run: Api.Forecast.BacktestRun) {
  const source = modules.value.find(item => item.id === run.module_id)?.sources?.find(item => item.key === run.metric);
  return source ? KIND_UNIT[source.kind] || '' : '';
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.BacktestRun) => formatDateTime(row.created_at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.BacktestRun) => moduleName(row.module_id)
  },
  metric: {
    title: t('page.datasource.mappings.metric'),
    key: 'metric',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.BacktestRun) => t(`page.datasource.mappings.metric_${row.metric}`)
  },
  algorithm_id: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm_id',
    width: 160,
    resizable: true,
    sorter: true
  },
  wape: {
    title: 'WAPE',
    key: 'wape',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.BacktestRun) => (score(row) ? percent(score(row)!.wape) : '-')
  },
  baseline_wape: {
    title: t('page.forecast.evaluation.baselineWape'),
    key: 'baseline_wape',
    width: 170,
    resizable: true,
    render: (row: Api.Forecast.BacktestRun) => {
      const m = parse<Api.Forecast.BacktestMetrics>(row.baseline_metrics);
      return m && !m.skipped ? `${row.baseline_id} ${percent(m.wape)}` : '-';
    }
  },
  peak_under: {
    title: t('page.forecast.evaluation.peakUnder'),
    key: 'peak_under',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.BacktestRun) => (score(row) ? percent(score(row)!.peak_under) : '-')
  },
  points: {
    title: t('page.forecast.evaluation.points'),
    key: 'points',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.BacktestRun) => score(row)?.points ?? '-'
  },
  promoted: {
    title: t('page.forecast.evaluation.promoted'),
    key: 'promoted',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.BacktestRun) => yesNo(row.promoted)
  },
  model_version: {
    title: t('page.forecast.results.modelVersion'),
    key: 'model_version',
    width: 200,
    ellipsis: { tooltip: true }
  },
  reason: { title: t('page.forecast.evaluation.reason'), key: 'reason', minWidth: 300, ellipsis: { tooltip: true } },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.BacktestRun) =>
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_backtest',
  columnMap,
  defaultKeys: ['__selection__', 'created_at', 'module', 'algorithm_id', 'wape', 'promoted', 'operate']
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="7" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
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
          clearable
          :options="metricOptions"
          :placeholder="t('common.selectField', { field: t('page.datasource.mappings.metric') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.promoted')"
      >
        <NSelect
          v-model:value="search.promoted"
          clearable
          :options="promotedOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.evaluation.promoted') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.results.backtestsTitle')"
      :help="t('page.forecast.results.backtestsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.results.backtestsEmpty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>
    <RecordDetailModal
      :show="Boolean(detail)"
      :title="detail ? `${detail.algorithm_id} · ${moduleName(detail.module_id)} · ${detail.metric}` : ''"
      :items="
        detail
          ? [
              { label: t('common.createTime'), value: detail ? formatDateTime(detail.created_at) : '' },
              { label: t('page.forecast.runs.modelVersion'), value: detail?.model_version },
              { label: t('page.forecast.evaluation.baselineWape'), value: detail?.baseline_id },
              {
                label: t('page.forecast.detail.promoted'),
                value: detail ? t(detail.promoted ? 'common.yesOrNo.yes' : 'common.yesOrNo.no') : ''
              },
              {
                label: t('page.forecast.scores.window'),
                value: detail ? `${formatDateTime(detail.window_start)} ~ ${formatDateTime(detail.window_end)}` : ''
              },
              { label: t('page.forecast.detail.step'), value: detail ? `${detail.step_seconds}s` : '' },
              { label: t('page.forecast.runs.horizonSteps'), value: detail?.horizon_steps },
              { label: t('page.forecast.detail.cutoffs'), value: detail?.cutoffs },
              { label: t('page.forecast.runs.reason'), value: detail?.reason, pre: true }
            ]
          : []
      "
      @update:show="value => !value && (detail = null)"
    >
      <BacktestMetrics
        v-if="detail"
        :metrics="detail.metrics"
        :baseline-metrics="detail.baseline_metrics"
        :baseline-id="detail.baseline_id"
        :unit="unitOf(detail)"
      />
    </RecordDetailModal>
  </div>
</template>
