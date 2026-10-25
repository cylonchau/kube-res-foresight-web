<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NFormItemGi, NModal, NSelect, NTabPane, NTabs, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import BatchActions from '@/components/business/batch-actions.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RankList from '@/components/business/rank-list.vue';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { lastHours, rangeParams, useForecastModules } from '@/hooks/business/use-forecast-modules';
import { fetchGetMetricScores, fetchGetRanking, fetchScoreModule } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'ForecastRanking' });

const { t } = useI18n();
const message = useMessage();
const route = useRoute();
const { moduleOptions, modules, loadModules } = useForecastModules();

const percent = (value: number) => (value < 0 ? '-' : formatPercent(value, 1));
const tab = ref<'composite' | 'metrics'>('composite');
const search = reactive({ moduleId: null as number | null, range: lastHours(24 * 7) as [number, number] | null });

// ================= the score of the replay (replicas, CPU, memory, GPU): every enabled algorithm that was scored =================
const ranking = ref<Api.Forecast.Ranking | null>(null);
const loading = ref(false);
const scoring = ref(false);
const detail = ref<Api.Forecast.RankingRow | null>(null);
const checkedComposite = ref<string[]>([]);

async function loadRanking() {
  if (!search.moduleId) {
    ranking.value = null;
    return;
  }
  loading.value = true;
  const { data } = await fetchGetRanking(search.moduleId);
  loading.value = false;
  ranking.value = data || null;
  checkedComposite.value = [];
}

const rows = computed(() => ranking.value?.list || []);
const best = computed(() => rows.value.find(row => row.score !== null && row.rank === 1));
const inUse = computed(() => rows.value.find(row => row.selected));
const scoredAt = computed(() => rows.value.find(row => row.at)?.at || null);
const scoredCount = computed(() => rows.value.filter(row => row.score !== null).length);

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

const partOf = (row: Api.Forecast.RankingRow, metric: Api.Forecast.BreakdownRow['metric']) =>
  row.breakdown?.find(item => item.metric === metric);

const compositeItems = computed(() =>
  rows.value.map(row => {
    const tags: Array<{ label: string; type?: 'success' | 'warning' | 'info' }> = [];
    if (row.name === best.value?.name) tags.push({ label: t('page.forecast.ranking.best'), type: 'success' });
    if (row.selected) tags.push({ label: t('page.forecast.scores.inUse'), type: 'info' });
    else if (ranking.value?.challenger === row.name) {
      tags.push({
        label: t('page.forecast.scores.challenger', { cycles: ranking.value?.challenger_cycles }),
        type: 'warning'
      });
    }
    const parts = (['replicas', 'cpu', 'memory', 'gpu'] as const)
      .map(metric => ({ metric, found: partOf(row, metric) }))
      .filter(item => item.found)
      .map(item => ({
        label: t(`page.forecast.scores.part_${item.metric}`),
        value: item.found!.accuracy,
        text: percent(item.found!.accuracy),
        hint: `${t('page.forecast.scores.accuracy')} ${percent(item.found!.accuracy)} · ${t('page.forecast.scores.error')} ${percent(item.found!.error)}`
      }));
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
      caption: [
        row.windows ? `${row.windows} ${t('page.forecast.scores.windows')}` : '',
        row.weight && row.weight !== 1
          ? `${t('page.forecast.algorithms.columns.weight')} ${formatDecimal(row.weight)}`
          : '',
        row.detail && row.detail.oom_penalty > 0
          ? `${t('page.forecast.scores.oomPenalty')} ${percent(row.detail.oom_penalty)}`
          : ''
      ]
        .filter(Boolean)
        .join(' · ')
    };
  })
);
const detailOf = (key: string) => rows.value.find(row => row.name === key) || null;

// ================= the forecast against what Prometheus reported, per source =================
const metricScores = ref<Api.Forecast.MetricScores | null>(null);
const metricLoading = ref(false);
const checkedAlgorithms = ref<string[]>([]);
const checkedMetrics = ref<string[]>([]);

async function loadMetrics() {
  if (!search.moduleId) {
    metricScores.value = null;
    return;
  }
  metricLoading.value = true;
  const { data } = await fetchGetMetricScores(search.moduleId, rangeParams(search.range));
  metricLoading.value = false;
  metricScores.value = data || null;
  checkedAlgorithms.value = [];
  checkedMetrics.value = [];
}

/** every algorithm that has measured values, ranked on the same standard */
const algorithmItems = computed(() =>
  (metricScores.value?.algorithms || []).map(row => {
    const tags: Array<{ label: string; type?: 'success' | 'warning' | 'default' }> = [];
    if (row.best) tags.push({ label: t('page.forecast.ranking.best'), type: 'success' });
    if (row.custom) tags.push({ label: t('page.forecast.algorithms.originCustom'), type: 'warning' });
    if (row.baseline) tags.push({ label: t('page.forecast.evaluation.baseline') });
    else if (row.beats_baseline !== undefined) {
      tags.push({
        label: t(row.beats_baseline ? 'page.forecast.ranking.beats' : 'page.forecast.ranking.notBeats'),
        type: row.beats_baseline ? 'success' : 'warning'
      });
    }
    return {
      key: row.algorithm_id,
      rank: row.rank,
      name: row.algorithm_id,
      score: row.score,
      scoreText: formatDecimal(row.score, 1),
      tags,
      parts: [
        { label: t('page.forecast.scores.accuracy'), value: row.accuracy, text: percent(row.accuracy) },
        { label: t('page.forecast.scores.error'), value: 1 - row.error, text: percent(row.error) }
      ],
      caption: `${row.sources} ${t('page.forecast.ranking.sources')} · ${row.runs} ${t('page.forecast.ranking.runs')} · ${row.points} ${t('page.forecast.ranking.points')}`
    };
  })
);

/** the standard metric ranking: for every metric, the algorithms ranked by accuracy on it */
const metricItems = computed(() => {
  const groups = new Map<string, Api.Forecast.MetricScore[]>();
  for (const score of metricScores.value?.metrics || []) {
    const key = `${score.source_name}/${score.metric}`;
    groups.set(key, [...(groups.get(key) || []), score]);
  }
  return [...groups.entries()].flatMap(([group, scores]) =>
    [...scores]
      .sort((a, b) => b.accuracy - a.accuracy)
      .map((score, index) => ({
        key: `${group}/${score.algorithm_id}`,
        rank: index + 1,
        name: score.algorithm_id,
        score: score.accuracy * 100,
        scoreText: percent(score.accuracy),
        tags: [
          { label: score.source_name, type: 'info' as const },
          ...(score.in_composite
            ? [{ label: `${t('page.forecast.scores.weightShare')} ${percent(score.weight)}` }]
            : [])
        ],
        parts: [
          { label: t('page.forecast.scores.error'), value: 1 - score.error, text: percent(score.error) },
          {
            label: t('page.forecast.evaluation.peakUnder'),
            value: 1 - score.peak_under,
            text: percent(score.peak_under)
          }
        ],
        caption: `${t(`page.monitoring.datasets.category_${score.category}`)} · MAE ${formatDecimal(score.mae)} · RMSE ${formatDecimal(score.rmse)} · ${t('page.forecast.ranking.bias')} ${formatDecimal(score.bias)} · ${score.runs} ${t('page.forecast.ranking.runs')} · ${score.points} ${t('page.forecast.ranking.points')}`
      }))
  );
});

const batchActions = computed(() => [{ key: 'export', label: t('page.forecast.metrics.exportCsv') }]);

function download(name: string, lines: string[]) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportComposite() {
  const keys = new Set(checkedComposite.value);
  const lines = ['rank,algorithm,score,windows,in_use'];
  for (const r of rows.value.filter(item => keys.has(item.name))) {
    lines.push([r.rank, r.name, r.score === null ? '' : formatDecimal(r.score), r.windows, r.selected].join(','));
  }
  download('kubeforecast-ranking.csv', lines);
}
function exportAlgorithms() {
  const keys = new Set(checkedAlgorithms.value);
  const lines = ['rank,algorithm,score,accuracy,error,sources,runs,points'];
  for (const r of (metricScores.value?.algorithms || []).filter(item => keys.has(item.algorithm_id))) {
    lines.push(
      [
        r.rank,
        r.algorithm_id,
        formatDecimal(r.score),
        formatDecimal(r.accuracy),
        formatDecimal(r.error),
        r.sources,
        r.runs,
        r.points
      ].join(',')
    );
  }
  download('kubeforecast-algorithm-scores.csv', lines);
}
function exportMetrics() {
  const keys = new Set(checkedMetrics.value);
  const lines = ['source,algorithm,accuracy,error,mae,rmse,bias,peak_under,runs,points'];
  for (const r of (metricScores.value?.metrics || []).filter(item =>
    keys.has(`${item.source_name}/${item.metric}/${item.algorithm_id}`)
  )) {
    lines.push(
      [
        r.source_name,
        r.algorithm_id,
        formatDecimal(r.accuracy),
        formatDecimal(r.error),
        formatDecimal(r.mae),
        formatDecimal(r.rmse),
        formatDecimal(r.bias),
        formatDecimal(r.peak_under),
        r.runs,
        r.points
      ].join(',')
    );
  }
  download('kubeforecast-metric-scores.csv', lines);
}

async function load() {
  await Promise.all([loadRanking(), loadMetrics()]);
}

watch(() => search.moduleId, load);

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, range: lastHours(24 * 7) });
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
      <NFormItemGi class="list-search-select-field" :span="9" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi :span="11" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>

    <NTabs v-model:value="tab" type="segment" size="small" class="flex-shrink-0 w-420px max-w-full">
      <NTabPane name="composite" :tab="t('page.forecast.ranking.tabComposite')" />
      <NTabPane name="metrics" :tab="t('page.forecast.ranking.tabMetrics')" />
    </NTabs>

    <!-- the ranking of the replay score -->
    <RankList
      v-if="tab === 'composite'"
      v-model:checked="checkedComposite"
      selectable
      :title="t('page.forecast.scores.rankingTitle')"
      :help="t('page.forecast.scores.rankingHelp')"
      :items="compositeItems"
      :loading="loading"
      :empty-text="t('page.forecast.scores.empty')"
    >
      <template #tools>
        <BatchActions :count="checkedComposite.length" :actions="batchActions" @run="exportComposite" />
        <NButton size="small" :loading="loading" @click="loadRanking">{{ t('common.refresh') }}</NButton>
        <NButton size="small" type="primary" :loading="scoring" :disabled="!search.moduleId" @click="scoreNow">
          {{ t('page.forecast.scores.scoreNow') }}
        </NButton>
      </template>
      <template #summary>
        <div class="summary">
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.ranking.best') }}</div>
            <div class="summary__value">{{ best?.name || '-' }}</div>
            <div class="summary__sub">{{ best?.score != null ? formatDecimal(best.score, 1) : '' }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.scores.inUse') }}</div>
            <div class="summary__value">{{ inUse?.name || '-' }}</div>
            <div class="summary__sub">{{ inUse?.score != null ? formatDecimal(inUse.score, 1) : '' }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.ranking.challenger') }}</div>
            <div class="summary__value">{{ ranking?.challenger || '-' }}</div>
            <div class="summary__sub">
              {{
                ranking?.challenger ? t('page.forecast.scores.challenger', { cycles: ranking.challenger_cycles }) : ''
              }}
            </div>
          </div>
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.ranking.scoredAlgorithms') }}</div>
            <div class="summary__value">{{ scoredCount }} / {{ rows.length }}</div>
            <div class="summary__sub">{{ scoredAt ? formatDateTime(scoredAt) : '' }}</div>
          </div>
        </div>
      </template>
      <template #actions="{ item }">
        <NButton size="small" type="primary" ghost :disabled="item.score === null" @click="detail = detailOf(item.key)">
          {{ t('common.detail') }}
        </NButton>
      </template>
    </RankList>

    <!-- the forecast against the actuals: the composite result and the standard ranking of each metric, as two lists -->
    <template v-else>
      <RankList
        v-model:checked="checkedAlgorithms"
        selectable
        :title="t('page.forecast.ranking.compositeTitle')"
        :help="t('page.forecast.ranking.compositeHelp')"
        :items="algorithmItems"
        :loading="metricLoading"
        :empty-text="t('page.forecast.ranking.noMeasured')"
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
          <BatchActions :count="checkedAlgorithms.length" :actions="batchActions" @run="exportAlgorithms" />
          <NButton size="small" :loading="metricLoading" @click="loadMetrics">{{ t('common.refresh') }}</NButton>
        </template>
      </RankList>
      <RankList
        v-model:checked="checkedMetrics"
        selectable
        :title="t('page.forecast.ranking.metricsTitle')"
        :help="t('page.forecast.ranking.metricsHelp')"
        :items="metricItems"
        :loading="metricLoading"
        :empty-text="t('page.forecast.ranking.noMeasured')"
      >
        <template #tools>
          <BatchActions :count="checkedMetrics.length" :actions="batchActions" @run="exportMetrics" />
        </template>
      </RankList>
    </template>

    <NModal
      :show="Boolean(detail)"
      preset="card"
      :title="detail?.name"
      class="w-720px max-w-95vw"
      @update:show="value => !value && (detail = null)"
    >
      <ScoreBreakdown v-if="detail" :rows="detail.breakdown || []" :result="detail.detail" :score="detail.score" />
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
