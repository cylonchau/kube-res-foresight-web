<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NSelect } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RecordDetailModal from '@/components/business/record-detail-modal.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import {
  sourceMetricOptions,
  useForecastModules,
  windowStart,
  useWindowOptions
} from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetEvaluations } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastResultsEvaluations' });

const { t } = useI18n();
const { modules, moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  hours: (24 * 7) as number | null
});

const metricOptions = computed(() => sourceMetricOptions(modules.value, search.moduleId));
const hoursOptions = useWindowOptions();

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const number = (value: number) => (Number.isFinite(value) ? value.toPrecision(4) : '-');

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Evaluation>(async (page, pageSize) => {
  const { data } = await fetchGetEvaluations({
    module_id: search.moduleId ?? undefined,
    metric: search.metric ?? undefined,
    from: windowStart(search.hours),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

function resetSearch() {
  Object.assign(search, { moduleId: null, metric: null, hours: 24 * 7 });
}

const detail = ref<Api.Forecast.Evaluation | null>(null);

const columnMap: Record<string, any> = {
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
    sorter: true
  },
  points: { title: t('page.forecast.evaluation.points'), key: 'points', width: 100, align: 'center' },
  wape: {
    title: 'WAPE',
    key: 'wape',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => percent(row.wape)
  },
  mae: {
    title: 'MAE',
    key: 'mae',
    width: 100,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => number(row.mae)
  },
  bias: {
    title: t('page.forecast.evaluation.bias'),
    key: 'bias',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Evaluation) => number(row.bias)
  },
  peak_under: {
    title: t('page.forecast.evaluation.peakUnder'),
    key: 'peak_under',
    width: 110,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Evaluation) => percent(row.peak_under)
  },
  coverage: {
    title: t('page.forecast.evaluation.coverage'),
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
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_evaluation_runs',
  columnMap,
  defaultKeys: ['prediction_time', 'module', 'algorithm_id', 'wape', 'peak_under', 'operate']
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
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.results.evaluationsTitle')"
      :help="t('page.forecast.results.evaluationsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.results.evaluationsEmpty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    />
    <RecordDetailModal
      :show="Boolean(detail)"
      :title="detail ? `${detail.algorithm_id} · ${moduleName(detail.module_id)} · ${detail.metric}` : ''"
      :items="
        detail
          ? [
              { label: t('page.forecast.runs.time'), value: detail ? formatDateTime(detail.prediction_time) : '' },
              { label: t('page.forecast.evaluation.points'), value: detail?.points },
              { label: 'MAE', value: detail?.mae },
              { label: 'WAPE', value: detail ? `${(detail.wape * 100).toFixed(2)}%` : '' },
              { label: t('page.forecast.ranking.bias'), value: detail?.bias },
              {
                label: t('page.forecast.evaluation.peakUnder'),
                value: detail ? `${(detail.peak_under * 100).toFixed(2)}%` : ''
              },
              {
                label: t('page.forecast.detail.coverage'),
                value: detail ? `${(detail.coverage * 100).toFixed(1)}%` : ''
              },
              { label: t('common.createTime'), value: detail ? formatDateTime(detail.created_at) : '' }
            ]
          : []
      "
      @update:show="value => !value && (detail = null)"
    />
  </div>
</template>
