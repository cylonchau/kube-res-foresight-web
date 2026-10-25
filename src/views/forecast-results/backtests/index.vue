<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NSelect, NTag } from 'naive-ui';
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
import { fetchSearchBacktests } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastResultsBacktests' });

const { t } = useI18n();
const { modules, moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  promoted: null as string | null,
  hours: (24 * 7) as number | null
});

const metricOptions = computed(() => sourceMetricOptions(modules.value, search.moduleId));
const promotedOptions = computed(() => [
  { label: t('page.forecast.evaluation.promoted'), value: 'true' },
  { label: t('page.forecast.results.notPromoted'), value: 'false' }
]);
const hoursOptions = useWindowOptions();

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const yesNo = (value: boolean) =>
  h(NTag, { size: 'small', bordered: false, type: value ? 'success' : 'default' }, () =>
    t(value ? 'common.yesOrNo.yes' : 'common.yesOrNo.no')
  );

function pretty(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

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
  Object.assign(search, { moduleId: null, metric: null, promoted: null, hours: 24 * 7 });
}

const detail = ref<Api.Forecast.BacktestRun | null>(null);

const columnMap: Record<string, any> = {
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
  defaultKeys: ['created_at', 'module', 'algorithm_id', 'wape', 'promoted', 'operate']
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
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.results.backtestsTitle')"
      :help="t('page.forecast.results.backtestsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.results.backtestsEmpty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    />
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
              { label: t('page.forecast.detail.metrics'), value: detail ? pretty(detail.metrics) : '', pre: true },
              {
                label: t('page.forecast.detail.baselineMetrics'),
                value: detail ? pretty(detail.baseline_metrics) : '',
                pre: true
              },
              { label: t('page.forecast.runs.reason'), value: detail?.reason, pre: true }
            ]
          : []
      "
      @update:show="value => !value && (detail = null)"
    />
  </div>
</template>
