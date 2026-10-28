<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NModal, NSelect, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import BatchActions from '@/components/business/batch-actions.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RankList from '@/components/business/rank-list.vue';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { fetchGetHistoryRankings, fetchGetMetricScores, fetchGetRanking, fetchScoreModule } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatPercent } from '@/utils/format';
import { reasonText } from '@/utils/reason';

defineOptions({ name: 'ForecastRanking' });

/**
 * The ranking of the algorithms of a module: one list, the newest evaluation. Every enabled algorithm is listed: one without
 * a result says why instead of disappearing. The detail of an algorithm has its ranking per metric and how its rank and score
 * moved over the evaluations of the time range, next to the other algorithms.
 */
const { t } = useI18n();
const message = useMessage();
const route = useRoute();
const { moduleOptions, modules, loadModules } = useForecastModules();

const percent = (value: number) => (value < 0 ? '-' : formatPercent(value, 1));
const search = reactive({
  moduleId: null as number | null,
  range: lastHours(24 * 7) as [number, number] | null,
  /** what the algorithms are ranked on: all resources together (null) or one resource by itself */
  metric: null as 'cpu' | 'memory' | 'gpu' | null
});
const metricOptions = computed(() =>
  (['cpu', 'memory', 'gpu'] as const).map(value => ({ label: t(`page.forecast.scores.part_${value}`), value }))
);

const ranking = ref<Api.Forecast.Ranking | null>(null);
const metricScores = ref<Api.Forecast.MetricScores | null>(null);
/** the evaluations of the range, newest 30: the history an algorithm is compared with in its detail */
const history = ref<Api.Forecast.HistoryRanking[]>([]);
const loading = ref(false);
const scoring = ref(false);
const detailKey = ref<string | null>(null);
const checkedMain = ref<string[]>([]);

async function load() {
  if (!search.moduleId) {
    ranking.value = null;
    metricScores.value = null;
    history.value = [];
    return;
  }
  loading.value = true;
  try {
    const [current, measured, past] = await Promise.all([
      fetchGetRanking(search.moduleId),
      fetchGetMetricScores(search.moduleId, rangeParams(search.range)),
      fetchGetHistoryRankings({ module_id: search.moduleId, ...rangeParams(search.range), page: 1, page_size: 30 })
    ]);
    ranking.value = current.data || null;
    metricScores.value = measured.data || null;
    history.value = past.data?.list || [];
    checkedMain.value = [];
  } finally {
    loading.value = false;
  }
}

async function scoreNow() {
  if (!search.moduleId) return;
  scoring.value = true;
  try {
    const { error } = await fetchScoreModule(search.moduleId);
    if (!error) {
      message.success(t('page.forecast.scores.scored'));
      await load();
    }
  } finally {
    scoring.value = false;
  }
}

const rows = computed(() => ranking.value?.list || []);
const best = computed(() => rows.value.find(row => row.score !== null && row.rank === 1));
const inUse = computed(() => rows.value.find(row => row.selected));
/** the algorithm in use with its accuracy on each resource, as one line */
const inUseAccuracy = computed(() =>
  (inUse.value?.breakdown || [])
    .filter(part => part.metric !== 'replicas')
    .map(part => `${t(`page.forecast.scores.part_${part.metric}`)} ${percent(part.accuracy)}`)
    .join(' · ')
);
const scoredAt = computed(() => rows.value.find(row => row.at)?.at || null);
const scoredCount = computed(() => rows.value.filter(row => row.score !== null).length);
const measuredBy = computed(() => new Map((metricScores.value?.algorithms || []).map(row => [row.algorithm_id, row])));

const partOf = (breakdown: Api.Forecast.BreakdownRow[] | undefined, metric: Api.Forecast.BreakdownRow['metric']) =>
  breakdown?.find(item => item.metric === metric);

function replayParts(breakdown: Api.Forecast.BreakdownRow[] | undefined) {
  // the accuracy is that of the resources: the replica count follows from them and is no figure of its own
  const only = search.metric ? [search.metric] : (['cpu', 'memory', 'gpu', 'replicas'] as const);
  return only
    .map(metric => ({ metric, found: partOf(breakdown, metric) }))
    .filter(item => item.found)
    .map(item => ({
      label: t(`page.forecast.scores.part_${item.metric}`),
      value: item.found!.accuracy,
      text: percent(item.found!.accuracy),
      hint: `${t('page.forecast.scores.accuracy')} ${percent(item.found!.accuracy)} · ${t('page.forecast.scores.error')} ${percent(item.found!.error)}`
    }));
}

const stateType = (state: Api.Forecast.AlgorithmState): 'error' | 'success' | 'warning' =>
  state === 'failed' ? 'error' : state === 'ready' ? 'success' : 'warning';

/** one entry per algorithm: the replay score, the measured accuracy next to it, and the reason when there is no score */
const mainItems = computed(() => {
  const items = rows.value.map(row => {
    const tags: Array<{ label: string; type?: 'success' | 'warning' | 'info' | 'error' }> = [];
    if (row.name === best.value?.name) tags.push({ label: t('page.forecast.ranking.best'), type: 'success' });
    if (row.selected) tags.push({ label: t('page.forecast.scores.inUse'), type: 'info' });
    else if (ranking.value?.challenger === row.name) {
      tags.push({
        label: t('page.forecast.scores.challenger', { cycles: ranking.value?.challenger_cycles }),
        type: 'warning'
      });
    }
    const measured = measuredBy.value.get(row.name);
    // without a replay score, a recorded run that was skipped or failed explains it; one that has measured values says the replay is what is missing
    const state = row.score === null && measured ? 'no_result' : row.status;
    if (row.score === null) tags.push({ label: t(`page.forecast.ranking.state_${state}`), type: stateType(state) });
    const parts = replayParts(row.breakdown);
    if (measured) {
      parts.push({
        label: t('page.forecast.ranking.measured'),
        value: measured.accuracy,
        text: percent(measured.accuracy),
        hint: `${t('page.forecast.scores.accuracy')} ${percent(measured.accuracy)} · ${measured.runs} ${t('page.forecast.ranking.runs')} · ${measured.points} ${t('page.forecast.ranking.points')}`
      });
    }
    const caption = [
      row.score === null ? (measured ? t('page.forecast.ranking.noReplayWindow') : reasonText(row.reason)) : '',
      row.windows ? `${row.windows} ${t('page.forecast.scores.windows')}` : '',
      row.weight && row.weight !== 1
        ? `${t('page.forecast.algorithms.columns.weight')} ${formatDecimal(row.weight)}`
        : '',
      row.detail && row.detail.oom_penalty > 0
        ? `${t('page.forecast.scores.oomPenalty')} ${percent(row.detail.oom_penalty)}`
        : ''
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      key: row.name,
      rank: row.rank || null,
      name: row.name,
      score: row.score,
      scoreText: row.score === null ? undefined : formatDecimal(row.score, 1),
      active: row.selected,
      tags,
      parts,
      movement: row.previous_rank != null && row.rank ? row.previous_rank - row.rank : null,
      caption
    };
  });
  const metric = search.metric;
  if (!metric) return items;
  // one resource by itself: each algorithm is scored and ranked on that resource ("naive CPU", "naive memory")
  const label = t(`page.forecast.scores.part_${metric}`);
  const scoreOf = (key: string) => partOf(rows.value.find(row => row.name === key)?.breakdown, metric)?.score;
  return items
    .filter(item => scoreOf(item.key) !== undefined)
    .sort((a, b) => (scoreOf(b.key) as number) - (scoreOf(a.key) as number))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      name: `${item.name} ${label}`,
      score: scoreOf(item.key) as number,
      scoreText: formatDecimal(scoreOf(item.key) as number, 1),
      movement: null,
      tags: item.tags
        .filter(tag => tag.label !== t('page.forecast.ranking.best'))
        .concat(index === 0 ? [{ label: t('page.forecast.ranking.best'), type: 'success' as const }] : [])
    }));
});

const detail = computed(() => rows.value.find(row => row.name === detailKey.value) || null);
/** how the algorithm stood in each past evaluation of the range: its rank among the algorithms and its score, newest first */
const detailHistory = computed(() =>
  history.value
    .map(item => ({
      at: item.at,
      row: item.rows.find(row => row.algorithm === detailKey.value),
      total: item.rows.length
    }))
    .filter(item => item.row)
);
const detailMetrics = computed(() =>
  (metricScores.value?.metrics || []).filter(item => item.algorithm_id === detailKey.value)
);

// ---- exports of the checked rows
const batchActions = computed(() => [{ key: 'export', label: t('page.forecast.metrics.exportCsv') }]);

function download(name: string, lines: string[]) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportMain() {
  const keys = new Set(checkedMain.value);
  const lines = ['rank,algorithm,score,windows,in_use,status,reason'];
  for (const r of rows.value.filter(item => keys.has(item.name))) {
    lines.push(
      [
        r.rank,
        r.name,
        r.score === null ? '' : formatDecimal(r.score),
        r.windows,
        r.selected,
        r.status,
        JSON.stringify(r.reason || '')
      ].join(',')
    );
  }
  download('kube-resource-fcst-ranking.csv', lines);
}

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, range: lastHours(24 * 7), metric: null });
  load();
}

onMounted(async () => {
  await loadModules();
  const fromRoute = Number(route.query.module_id);
  search.moduleId = modules.value.find(item => item.id === fromRoute)?.id ?? modules.value[0]?.id ?? null;
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="4" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="7" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
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
          :placeholder="t('page.forecast.ranking.allMetrics')"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>

    <RankList
      v-model:checked="checkedMain"
      selectable
      :title="t('page.forecast.scores.rankingTitle')"
      :help="t('page.forecast.ranking.mergedHelp')"
      :items="mainItems"
      :loading="loading"
      :empty-text="t('page.forecast.scores.empty')"
    >
      <template #tools>
        <NTag
          v-if="metricScores && !metricScores.comparable && metricScores.algorithms.length > 1"
          size="small"
          type="warning"
          :bordered="false"
        >
          {{ t('page.forecast.ranking.notComparable') }}
        </NTag>
        <BatchActions :count="checkedMain.length" :actions="batchActions" @run="exportMain" />
        <NButton size="small" :loading="loading" @click="load">{{ t('common.refresh') }}</NButton>
        <NButton size="small" type="primary" :loading="scoring" :disabled="!search.moduleId" @click="scoreNow">
          {{ t('page.forecast.scores.scoreNow') }}
        </NButton>
      </template>
      <template #summary>
        <div class="flex flex-wrap items-center gap-x-16px gap-y-4px text-13px">
          <span>
            <span class="opacity-65">{{ t('page.forecast.ranking.best') }}</span>
            <b class="ml-4px">{{ best?.name || '-' }}</b>
            <span v-if="best?.score != null" class="ml-4px opacity-65">{{ formatDecimal(best.score, 1) }}</span>
          </span>
          <span>
            <span class="opacity-65">{{ t('page.forecast.scores.inUse') }}</span>
            <b class="ml-4px">{{ inUse?.name || '-' }}</b>
            <span v-if="inUseAccuracy" class="ml-4px opacity-65">{{ inUseAccuracy }}</span>
          </span>
          <span v-if="ranking?.challenger">
            <span class="opacity-65">{{ t('page.forecast.ranking.challenger') }}</span>
            <b class="ml-4px">{{ ranking.challenger }}</b>
          </span>
          <span>
            <span class="opacity-65">{{ t('page.forecast.ranking.scoredAlgorithms') }}</span>
            <b class="ml-4px">{{ scoredCount }} / {{ rows.length }}</b>
            <span v-if="scoredAt" class="ml-4px opacity-65">{{ formatDateTime(scoredAt) }}</span>
          </span>
        </div>
      </template>
      <template #actions="{ item }">
        <NButton
          size="small"
          type="primary"
          ghost
          :disabled="!rows.find(row => row.name === item.key)"
          @click="detailKey = item.key"
        >
          {{ t('common.detail') }}
        </NButton>
      </template>
    </RankList>

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail?.name"
      class="w-760px max-w-95vw"
      @update:show="value => !value && (detailKey = null)"
    >
      <template v-if="detail">
        <ScoreBreakdown
          v-if="detail.score !== null"
          :rows="detail.breakdown || []"
          :result="detail.detail"
          :score="detail.score"
        />
        <div v-else class="leading-22px">{{ reasonText(detail.reason) }}</div>
        <div v-if="detailHistory.length" class="mt-12px">
          <div class="mb-6px font-medium">{{ t('page.forecast.ranking.historyCompare') }}</div>
          <div class="grid grid-cols-[170px_90px_80px_1fr] gap-x-8px gap-y-2px text-13px">
            <span class="opacity-65">{{ t('page.forecast.scores.scoredAt') }}</span>
            <span class="opacity-65">{{ t('page.forecast.scores.rank') }}</span>
            <span class="opacity-65">{{ t('page.forecast.scores.score') }}</span>
            <span class="opacity-65">{{ t('page.forecast.scores.wasInUse') }}</span>
            <template v-for="item in detailHistory" :key="item.at">
              <span>{{ formatDateTime(item.at) }}</span>
              <span>{{ item.row!.rank }} / {{ item.total }}</span>
              <span>{{ formatDecimal(item.row!.score, 1) }}</span>
              <span>
                <NTag v-if="item.row!.selected" size="small" :bordered="false" type="info">
                  {{ t('page.forecast.scores.wasInUse') }}
                </NTag>
              </span>
            </template>
          </div>
        </div>
        <div v-if="detailMetrics.length" class="mt-12px">
          <div class="mb-6px font-medium">{{ t('page.forecast.ranking.metricsTitle') }}</div>
          <div v-for="item in detailMetrics" :key="item.metric" class="flex flex-wrap items-center gap-8px py-2px">
            <NTag size="small" :bordered="false" type="info">{{ item.source_name }}</NTag>
            <span>
              {{ t('page.forecast.scores.accuracy') }} {{ percent(item.accuracy) }} · MAE
              {{ formatDecimal(item.mae) }} · RMSE {{ formatDecimal(item.rmse) }} · {{ item.runs }}
              {{ t('page.forecast.ranking.runs') }}
            </span>
          </div>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.summary__item {
  padding: 10px 14px;
  border: 1px solid rgb(var(--base-text-color) / 0.1);
  border-radius: 10px;
}
.summary__label {
  font-size: 12px;
  opacity: 0.65;
}
.summary__value {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 600;
  word-break: break-all;
}
.summary__sub {
  min-height: 18px;
  font-size: 12px;
  opacity: 0.65;
}
</style>
