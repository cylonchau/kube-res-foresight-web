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
import { formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'ForecastResultsLeaderboard' });

const { t } = useI18n();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: null as string | null,
  range: lastHours(24 * 7) as [number, number] | null
});
const checkedRowKeys = ref<string[]>([]);
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

const percent = (value: number) => formatPercent(value, 1);
const number = (value: number) => formatDecimal(value);
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
  const lines = ['rank,algorithm,wape,mae,bias,peak_under,coverage,runs,points'];
  rows.value.forEach((r, i) => {
    if (keys.has(r.algorithm_id))
      lines.push(
        [
          i + 1,
          r.algorithm_id,
          r.wape.toFixed(3),
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
  link.download = 'kube-resource-fcst-leaderboard.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

const centered = { width: 100, align: 'center' };
const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  rank: {
    title: '#',
    key: 'rank',
    width: 60,
    align: 'center',
    render: (_row: Api.Forecast.LeaderboardEntry, index: number) => index + 1
  },
  algorithm_id: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm_id',
    width: 170,
    resizable: true
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
  wape: { title: 'WAPE', key: 'wape', ...centered, render: (row: Api.Forecast.LeaderboardEntry) => percent(row.wape) },
  mae: { title: 'MAE', key: 'mae', ...centered, render: (row: Api.Forecast.LeaderboardEntry) => number(row.mae) },
  bias: {
    title: t('page.forecast.evaluation.bias'),
    key: 'bias',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => number(row.bias)
  },
  peak_under: {
    title: t('page.forecast.evaluation.peakUnder'),
    key: 'peak_under',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => percent(row.peak_under)
  },
  coverage: {
    title: t('page.forecast.evaluation.coverage'),
    key: 'coverage',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => percent(row.coverage)
  },
  runs: { title: t('page.forecast.evaluation.runs'), key: 'runs', width: 90, align: 'center' },
  points: { title: t('page.forecast.evaluation.points'), key: 'points', ...centered },
  beats_baseline: {
    title: t('page.forecast.evaluation.beatsBaseline'),
    key: 'beats_baseline',
    width: 120,
    align: 'center',
    render: (row: Api.Forecast.LeaderboardEntry) => yesNo(row.beats_baseline)
  },
  promoted: {
    title: t('page.forecast.evaluation.promoted'),
    key: 'promoted',
    ...centered,
    render: (row: Api.Forecast.LeaderboardEntry) => yesNo(row.promoted)
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_leaderboard',
  columnMap,
  defaultKeys: Object.keys(columnMap)
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  search.moduleId = modules.value[0]?.id ?? null;
  search.metric = metricOptions.value[0]?.value ?? null;
  await load();
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
      :row-key="(row: any) => row.algorithm_id"
      :empty-hint="t('page.forecast.results.leaderboardEmpty')"
      @refresh="load"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="exportChecked" />
      </template>
    </ListTablePanel>
  </div>
</template>
