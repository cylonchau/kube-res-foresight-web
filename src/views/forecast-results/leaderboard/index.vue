<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NFormItemGi, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { FORECAST_METRICS, useForecastModules, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetLeaderboard } from '@/service/api';

defineOptions({ name: 'ForecastResultsLeaderboard' });

const { t } = useI18n();
const { modules, moduleOptions, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  metric: 'cpu' as string | null,
  sinceHours: 24 * 7
});
const rows = ref<Api.Forecast.LeaderboardEntry[]>([]);
const loading = ref(false);

// the leaderboard of a module groups the bound instances' forecasts by the kind of metric they forecast
const metricOptions = computed(() =>
  FORECAST_METRICS.map(value => ({ label: t(`page.datasource.mappings.metric_${value}`), value }))
);
const sinceOptions = useWindowOptions();

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const number = (value: number) => (Number.isFinite(value) ? value.toPrecision(4) : '-');
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
  const { data } = await fetchGetLeaderboard(search.moduleId, {
    kind: search.metric,
    since_hours: search.sinceHours
  });
  loading.value = false;
  rows.value = data || [];
}

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, metric: 'cpu', sinceHours: 24 * 7 });
}

const centered = { width: 100, align: 'center' };
const columnMap: Record<string, any> = {
  rank: { title: '#', key: 'rank', width: 60, align: 'center' },
  algorithm_id: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm_id',
    width: 170,
    resizable: true
  },
  catalog: { title: t('page.forecast.modules.algorithm'), key: 'catalog', width: 150, resizable: true },
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
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="9" @search="load" @reset="resetSearch">
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
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.sinceHours" :options="sinceOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.evaluation.leaderboard')"
      :help="t('page.forecast.evaluation.leaderboardHint')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :row-key="(row: any) => row.algorithm_id"
      :empty-hint="t('page.forecast.results.leaderboardEmpty')"
      @refresh="load"
    />
  </div>
</template>
