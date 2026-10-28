<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NModal, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import ScoreBasis from '@/components/business/score-basis.vue';
import { useForecastModules } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetLatestScores } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { copyCell } from '@/utils/copy-cell';
import { helpTitle } from '@/utils/help-title';

defineOptions({ name: 'ForecastScoreRecords' });

/**
 * The newest grade of every algorithm of every module, one row per module, algorithm and resource ("naive CPU", "naive memory"),
 * never a row per evaluation. The detail of a row shows what the grade was computed from and the earlier grades of that algorithm.
 */
const { t } = useI18n();
const { moduleOptions, loadModules } = useForecastModules();
const percent = (value: number | undefined) =>
  value === undefined || value < 0 ? '-' : `${(value * 100).toFixed(2)}%`;

const search = reactive({
  moduleId: null as number | null,
  algorithm: '',
  /** the resource graded: null = every resource, one row each */
  metric: null as string | null
});
const metricOptions = computed(() =>
  (['cpu', 'memory', 'gpu', 'overall'] as const).map(value => ({
    label: t(`page.forecast.scores.metric_${value}`),
    value
  }))
);
const metricLabel = (metric: string) => t(`page.forecast.scores.metric_${metric}`);

const list = usePagedList<Api.Forecast.ScoreRow>(async (page, pageSize) => {
  const { data } = await fetchGetLatestScores({
    module_id: search.moduleId ?? undefined,
    algorithm: search.algorithm.trim() || undefined,
    metric: search.metric ?? undefined,
    page,
    page_size: pageSize
  });
  return data;
});

const detail = ref<Api.Forecast.ScoreRow | null>(null);

const columnMap: Record<string, any> = {
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 130,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.ScoreRow) => row.module_name
  },
  algorithm: {
    title: t('page.forecast.modules.algorithm'),
    key: 'algorithm',
    width: 170,
    resizable: true,
    // the name of the algorithm and nothing else: the dimension it is graded on is its own column and a filter
    render: (row: Api.Forecast.ScoreRow) => copyCell(row.algorithm)
  },
  metric: {
    title: t('page.datasource.mappings.metric'),
    key: 'metric',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) =>
      h(NTag, { size: 'small', bordered: false, type: row.metric === 'overall' ? 'default' : 'info' }, () =>
        metricLabel(row.metric)
      )
  },
  score: {
    title: () => helpTitle(t('page.forecast.scores.score'), t('page.forecast.metricHelp.score')),
    key: 'score',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) => row.score.toFixed(2)
  },
  accuracy: {
    title: () => helpTitle(t('page.forecast.scores.accuracy'), t('page.forecast.metricHelp.accuracy')),
    key: 'accuracy',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) => percent(row.accuracy)
  },
  rank: {
    title: t('page.forecast.scores.rank'),
    key: 'rank',
    width: 80,
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) => `${row.rank} / ${row.ranked}`
  },
  selected: {
    title: t('page.forecast.scores.inUse'),
    key: 'selected',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) =>
      row.selected
        ? h(NTag, { size: 'small', bordered: false, type: 'success' }, () => t('page.forecast.scores.inUse'))
        : '-'
  },
  windows: { title: t('page.forecast.scores.windows'), key: 'windows', width: 80, align: 'center' },
  created_at: {
    title: t('page.forecast.scores.scoredAt'),
    key: 'created_at',
    width: 170,
    render: (row: Api.Forecast.ScoreRow) => formatDateTime(row.at)
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.ScoreRow) =>
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_score_records',
  columnMap,
  defaultKeys: [
    'module',
    'algorithm',
    'metric',
    'score',
    'accuracy',
    'rank',
    'selected',
    'windows',
    'created_at',
    'operate'
  ]
});

function resetSearch() {
  Object.assign(search, { moduleId: null, algorithm: '', metric: null });
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
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.datasource.mappings.metric')"
      >
        <NSelect
          v-model:value="search.metric"
          clearable
          :options="metricOptions"
          :placeholder="t('page.forecast.ranking.allResources')"
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
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.scores.recordsTitle')"
      :help="t('page.forecast.scores.recordsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.scores.empty')"
      @refresh="list.reload"
    ></ListTablePanel>

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail ? `${detail.algorithm} · ${detail.module_name}` : ''"
      class="w-900px max-w-95vw"
      @update:show="value => !value && (detail = null)"
    >
      <ScoreBasis v-if="detail" :row="detail" />
    </NModal>
  </div>
</template>
