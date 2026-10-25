<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  NButton,
  NCard,
  NEmpty,
  NFormItemGi,
  NModal,
  NSelect,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RankLane from '@/components/business/rank-lane.vue';
import ScoreBreakdown from '@/components/business/score-breakdown.vue';
import { useForecastModules, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { fetchGetMetricScores, fetchGetRanking, fetchScoreModule } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastRanking' });

const { t } = useI18n();
const message = useMessage();
const route = useRoute();
const { moduleOptions, modules, loadModules } = useForecastModules();
const hoursOptions = useWindowOptions();

const percent = (value: number) => (value < 0 ? '-' : `${(value * 100).toFixed(1)}%`);
const tab = ref<'composite' | 'metrics'>('composite');
const search = reactive({ moduleId: null as number | null, hours: (24 * 7) as number | null });

// ================= the score of the replay (replicas, CPU, memory, GPU) =================
const ranking = ref<Api.Forecast.Ranking | null>(null);
const loading = ref(false);
const scoring = ref(false);
const detail = ref<Api.Forecast.RankingRow | null>(null);

async function loadRanking() {
  if (!search.moduleId) {
    ranking.value = null;
    return;
  }
  loading.value = true;
  const { data } = await fetchGetRanking(search.moduleId);
  loading.value = false;
  ranking.value = data || null;
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

function lane(row: Api.Forecast.RankingRow) {
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
  const weighted = row.score === null ? null : row.score * (row.weight || 1);
  return {
    tags,
    parts,
    movement: row.previous_rank != null && row.rank ? row.previous_rank - row.rank : null,
    caption: [
      row.windows ? `${row.windows} ${t('page.forecast.scores.windows')}` : '',
      weighted !== null && row.weight && row.weight !== 1
        ? `${t('page.forecast.scores.weighted')} ${weighted.toFixed(1)}`
        : '',
      row.detail && row.detail.oom_penalty > 0
        ? `${t('page.forecast.scores.oomPenalty')} ${percent(row.detail.oom_penalty)}`
        : ''
    ]
      .filter(Boolean)
      .join(' · ')
  };
}

// ================= the forecast against what Prometheus reported, per source =================
const metricScores = ref<Api.Forecast.MetricScores | null>(null);
const metricLoading = ref(false);

async function loadMetrics() {
  if (!search.moduleId) {
    metricScores.value = null;
    return;
  }
  metricLoading.value = true;
  const { data } = await fetchGetMetricScores(search.moduleId, { since_hours: search.hours ?? undefined });
  metricLoading.value = false;
  metricScores.value = data || null;
}

/** the metrics are grouped by source: one card per source, the algorithms ranked inside it */
const metricGroups = computed(() => {
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      unit: string;
      category: string;
      weight: number;
      inComposite: boolean;
      scores: Api.Forecast.MetricScore[];
    }
  >();
  for (const score of metricScores.value?.metrics || []) {
    const key = `${score.source_name}/${score.metric}`;
    const group = groups.get(key) || {
      key,
      title: `${score.source_name} (${score.metric})`,
      unit: score.unit,
      category: score.category,
      weight: score.weight,
      inComposite: score.in_composite,
      scores: []
    };
    group.scores.push(score);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    ...group,
    scores: [...group.scores].sort((a, b) => b.accuracy - a.accuracy)
  }));
});

function compositeLane(row: Api.Forecast.AlgorithmCompositeScore) {
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
    tags,
    parts: [
      { label: t('page.forecast.scores.accuracy'), value: row.accuracy },
      { label: t('page.forecast.scores.error'), value: 1 - row.error, text: percent(row.error) }
    ],
    caption: `${row.sources} ${t('page.forecast.ranking.sources')} · ${row.runs} ${t('page.forecast.ranking.runs')} · ${row.points} ${t('page.forecast.ranking.points')}`
  };
}

function metricLane(score: Api.Forecast.MetricScore) {
  return {
    parts: [
      { label: t('page.forecast.scores.error'), value: 1 - score.error, text: percent(score.error) },
      { label: t('page.forecast.evaluation.peakUnder'), value: 1 - score.peak_under, text: percent(score.peak_under) }
    ],
    caption: `MAE ${score.mae.toFixed(4)} · RMSE ${score.rmse.toFixed(4)} · ${t('page.forecast.ranking.bias')} ${score.bias.toFixed(4)} · ${score.runs} ${t('page.forecast.ranking.runs')} · ${score.points} ${t('page.forecast.ranking.points')}`
  };
}

async function load() {
  await Promise.all([loadRanking(), loadMetrics()]);
}

watch(() => search.moduleId, load);

function resetSearch() {
  Object.assign(search, { moduleId: modules.value[0]?.id ?? null, hours: 24 * 7 });
}

onMounted(async () => {
  await loadModules();
  const fromRoute = Number(route.query.module_id);
  search.moduleId = modules.value.find(item => item.id === fromRoute)?.id ?? modules.value[0]?.id ?? null;
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="load" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="10" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>

    <NTabs v-model:value="tab" type="segment" size="small" class="flex-shrink-0 w-420px max-w-full">
      <NTabPane name="composite" :tab="t('page.forecast.ranking.tabComposite')" />
      <NTabPane name="metrics" :tab="t('page.forecast.ranking.tabMetrics')" />
    </NTabs>

    <!-- the ranking of the replay score -->
    <NCard
      v-if="tab === 'composite'"
      :bordered="false"
      size="small"
      class="flex-1 overflow-hidden card-wrapper rounded-16px shadow-sm"
    >
      <div class="h-full flex-col gap-12px">
        <div class="flex flex-wrap items-center justify-between gap-8px">
          <div class="flex items-center gap-6px text-14px font-medium">
            {{ t('page.forecast.scores.rankingTitle') }}
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-360px leading-22px">{{ t('page.forecast.scores.rankingHelp') }}</div>
            </IconTooltip>
          </div>
          <div class="flex items-center gap-8px">
            <NButton size="small" :loading="loading" @click="loadRanking">{{ t('common.refresh') }}</NButton>
            <NButton size="small" type="primary" :loading="scoring" :disabled="!search.moduleId" @click="scoreNow">
              {{ t('page.forecast.scores.scoreNow') }}
            </NButton>
          </div>
        </div>

        <div class="summary">
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.ranking.best') }}</div>
            <div class="summary__value">{{ best?.name || '-' }}</div>
            <div class="summary__sub">{{ best?.score != null ? best.score.toFixed(1) : '' }}</div>
          </div>
          <div class="summary__item">
            <div class="summary__label">{{ t('page.forecast.scores.inUse') }}</div>
            <div class="summary__value">{{ inUse?.name || '-' }}</div>
            <div class="summary__sub">{{ inUse?.score != null ? inUse.score.toFixed(1) : '' }}</div>
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

        <NSpin :show="loading" class="flex-1 overflow-hidden">
          <div class="lanes">
            <RankLane
              v-for="row in rows"
              :key="row.name"
              :rank="row.rank || null"
              :name="row.name"
              :score="row.score"
              :active="row.selected"
              v-bind="lane(row)"
            >
              <template #actions>
                <NButton size="small" :disabled="row.score === null" @click="detail = row">
                  {{ t('common.detail') }}
                </NButton>
              </template>
            </RankLane>
            <NEmpty v-if="!rows.length && !loading" class="py-48px" :description="t('page.forecast.scores.empty')" />
          </div>
        </NSpin>
      </div>
    </NCard>

    <!-- the forecast against the actuals -->
    <NCard v-else :bordered="false" size="small" class="flex-1 overflow-hidden card-wrapper rounded-16px shadow-sm">
      <div class="h-full flex-col gap-12px">
        <div class="flex flex-wrap items-center gap-8px">
          <span class="text-14px font-medium">{{ t('page.forecast.ranking.compositeTitle') }}</span>
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.ranking.compositeHelp') }}</div>
          </IconTooltip>
          <NTag v-if="metricScores?.best" size="small" type="success" :bordered="false">
            {{ t('page.forecast.ranking.best') }}: {{ metricScores.best }}
          </NTag>
          <NTag
            v-if="metricScores && !metricScores.comparable && metricScores.algorithms.length > 1"
            size="small"
            type="warning"
            :bordered="false"
          >
            {{ t('page.forecast.ranking.notComparable') }}
          </NTag>
          <NButton size="small" class="ml-auto" :loading="metricLoading" @click="loadMetrics">
            {{ t('common.refresh') }}
          </NButton>
        </div>

        <NSpin :show="metricLoading" class="flex-1 overflow-hidden">
          <div class="lanes">
            <RankLane
              v-for="row in metricScores?.algorithms || []"
              :key="row.algorithm_id"
              :rank="row.rank"
              :name="row.algorithm_id"
              :score="row.score"
              v-bind="compositeLane(row)"
            />

            <template v-if="metricGroups.length">
              <div class="section-title">{{ t('page.forecast.ranking.metricsTitle') }}</div>
              <div v-for="group in metricGroups" :key="group.key" class="metric-group">
                <div class="metric-group__head">
                  <span class="font-medium">{{ group.title }}</span>
                  <NTag size="small" :bordered="false">
                    {{ t(`page.monitoring.datasets.category_${group.category}`) }}
                  </NTag>
                  <NTag size="small" :bordered="false">{{ group.unit }}</NTag>
                  <NTag v-if="group.inComposite" size="small" type="info" :bordered="false">
                    {{ t('page.forecast.scores.weightShare') }} {{ percent(group.weight) }}
                  </NTag>
                </div>
                <div class="metric-group__rows">
                  <RankLane
                    v-for="(score, index) in group.scores"
                    :key="score.algorithm_id"
                    :rank="index + 1"
                    :name="score.algorithm_id"
                    :score="score.accuracy * 100"
                    :score-text="percent(score.accuracy)"
                    v-bind="metricLane(score)"
                  />
                </div>
              </div>
            </template>
            <NEmpty
              v-if="metricScores && !metricScores.algorithms.length && !metricLoading"
              class="py-48px"
              :description="t('page.forecast.ranking.noMeasured')"
            />
          </div>
        </NSpin>
      </div>
    </NCard>

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
.lanes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}
.section-title {
  margin-top: 8px;
  font-weight: 600;
}
.metric-group {
  padding: 12px;
  border: 1px solid rgb(var(--base-text-color) / 0.1);
  border-radius: 12px;
}
.metric-group__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.metric-group__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
