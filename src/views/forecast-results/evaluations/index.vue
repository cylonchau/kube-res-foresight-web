<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NSelect } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import EvaluationDetail from '@/components/business/evaluation-detail.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { sourceMetricOptions, useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetEvaluations, fetchBatchDeleteRecords } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal } from '@/utils/format';
import { copyCell } from '@/utils/copy-cell';
import { helpTitle } from '@/utils/help-title';

defineOptions({ name: 'ForecastResultsEvaluations' });

const { t } = useI18n();
const { modules, moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  range: lastHours(24 * 7) as [number, number] | null
});

const metricOptions = computed(() => sourceMetricOptions(modules.value, search.moduleId));

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const number = (value: number) => formatDecimal(value);

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Evaluation>(async (page, pageSize) => {
  const { data } = await fetchGetEvaluations({
    module_id: search.moduleId ?? undefined,
    metric: search.metric ?? undefined,
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
  const { data, error } = await fetchBatchDeleteRecords({ kind: 'evaluations', ids: checkedRowKeys.value });
  if (error || !data) return;
  window.$message?.success(t('common.batchDone', { done: data.done }));
  checkedRowKeys.value = [];
  await list.reload();
}

function resetSearch() {
  Object.assign(search, { moduleId: null, metric: null, range: lastHours(24 * 7) });
}

const detail = ref<Api.Forecast.Evaluation | null>(null);

/** the unit of the metric an evaluation is of, from the source it was made on */
const KIND_UNIT: Record<string, string> = { cpu: 'cores', memory: 'bytes' };
function unitOf(e: Api.Forecast.Evaluation) {
  const source = modules.value.find(item => item.id === e.module_id)?.sources?.find(item => item.key === e.metric);
  return source ? KIND_UNIT[source.kind] || '' : '';
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  prediction_time: {
    title: t('page.forecast.evaluation.predictionTime'),
    key: 'prediction_time',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => formatDateTime(row.prediction_time)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.Evaluation) => moduleName(row.module_id)
  },
  metric: {
    title: t('page.datasource.mappings.metric'),
    key: 'metric',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.Evaluation) => t(`page.datasource.mappings.metric_${row.metric}`)
  },
  algorithm_id: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm_id',
    width: 160,
    resizable: true,
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => copyCell(row.algorithm_id)
  },
  points: { title: t('page.forecast.evaluation.points'), key: 'points', width: 100, align: 'center' },
  wape: {
    title: () => helpTitle('WAPE', t('page.forecast.metricHelp.wape')),
    key: 'wape',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => percent(row.wape)
  },
  mae: {
    title: () => helpTitle('MAE', t('page.forecast.metricHelp.mae')),
    key: 'mae',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => number(row.mae)
  },
  bias: {
    title: () => helpTitle(t('page.forecast.evaluation.bias'), t('page.forecast.metricHelp.bias')),
    key: 'bias',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Evaluation) => number(row.bias)
  },
  peak_under: {
    title: () => helpTitle(t('page.forecast.evaluation.peakUnder'), t('page.forecast.metricHelp.peakUnder')),
    key: 'peak_under',
    width: 110,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => percent(row.peak_under)
  },
  coverage: {
    title: () => helpTitle(t('page.forecast.evaluation.coverage'), t('page.forecast.metricHelp.coverage')),
    key: 'coverage',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => percent(row.coverage)
  },
  model_version: {
    title: t('page.forecast.results.modelVersion'),
    key: 'model_version',
    width: 200,
    ellipsis: { tooltip: true }
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Evaluation) =>
      h(NButton, { size: 'tiny', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_evaluation_runs',
  columnMap,
  defaultKeys: ['__selection__', 'prediction_time', 'module', 'algorithm_id', 'wape', 'peak_under', 'operate']
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="10" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="8" :label="t('page.forecast.modules.name')">
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
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.results.evaluationsTitle')"
      :help="t('page.forecast.results.evaluationsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.results.evaluationsEmpty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>
    <EvaluationDetail
      :show="Boolean(detail)"
      :evaluation="detail"
      :module-name="detail ? moduleName(detail.module_id) : ''"
      :unit="detail ? unitOf(detail) : ''"
      @update:show="value => !value && (detail = null)"
    />
  </div>
</template>
