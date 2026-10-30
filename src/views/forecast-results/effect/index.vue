<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NEmpty, NFormItemGi, NSelect, NSpin, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ChangePreviewModal from '@/components/business/change-preview-modal.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { lastHours, resolveRange, useForecastModules } from '@/hooks/business/use-forecast-modules';
import type { RangeValue } from '@/hooks/business/use-forecast-modules';
import { fetchGetModuleEffectReport } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'ForecastEffect' });

/**
 * What the forecasts of a module were worth over a window: accuracy, whether scale-ups were in time, capacity wasted, how steady the
 * replicas were and who decided. One view of stacked sections, no list. A part with too few samples says so instead of showing a number.
 */
const { t, locale } = useI18n();
const { moduleOptions, modules, loadModules } = useForecastModules();

const search = reactive({ moduleId: null as number | null, range: lastHours(24) as RangeValue | null });
const report = ref<Api.Forecast.EffectReport | null>(null);
const loading = ref(false);
const previewing = ref(false);

/** the window in whole hours, from now back: the report is asked for hours, the range picker gives a start and an end */
const hours = computed(() => {
  const range = resolveRange(search.range);
  if (!range) return 24;
  return Math.min(720, Math.max(1, Math.ceil((range[1] - range[0]) / 3600000)));
});

async function load() {
  if (!search.moduleId) {
    report.value = null;
    return;
  }
  loading.value = true;
  try {
    const { data } = await fetchGetModuleEffectReport(search.moduleId, hours.value);
    report.value = data ?? null;
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  search.moduleId = modules.value[0]?.id ?? null;
  search.range = lastHours(24);
}

onMounted(async () => {
  await loadModules();
  search.moduleId = modules.value[0]?.id ?? null;
  // the search is submitted by the list-search plugin when the filters above change
});

interface Cell {
  key: string;
  label: string;
  help?: string;
  value: string;
  /** the value is a sentence (not enough samples, cannot be measured), not a figure */
  muted?: boolean;
  sub?: string;
  tag?: { text: string; type: 'success' | 'error' | 'default' | 'warning' };
}
interface Group {
  key: string;
  title?: string;
  note?: string;
  cells: Cell[];
}
interface Section {
  key: string;
  title: string;
  help: string;
  tag?: Cell['tag'];
  groups: Group[];
}

const notEnough = (n: number) => t('page.forecast.effect.notEnough', { n });
const num = (value: number, digits = 2) => formatDecimal(value, digits);
/** a figure whose unit the report does not know (bytes, threads, requests): 235M, not 235305697.5 */
const compact = (value: number) =>
  new Intl.NumberFormat(locale.value === 'en-US' ? 'en' : 'zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value);
const verdictType = { pass: 'success', fail: 'error', insufficient: 'default' } as const;

const sections = computed<Section[]>(() => {
  const r = report.value;
  if (!r) return [];
  const e = (key: string) => `page.forecast.effect.${key}`;
  const out: Section[] = [];

  // accuracy: one group per metric of the algorithm in use
  out.push({
    key: 'accuracy',
    title: t(e('accuracy')),
    help: t(e('accuracyHelp')),
    groups: r.accuracy.length
      ? r.accuracy.map(row => ({
          key: row.metric,
          title: row.metric,
          note: t(e('accuracyRuns'), { runs: row.runs, points: row.points }),
          cells: row.enough
            ? [
                { key: 'wape', label: t(e('wape')), help: t(e('wapeHelp')), value: formatPercent(row.wape, 1) },
                {
                  key: 'peak',
                  label: t(e('peakUnder')),
                  help: t(e('peakUnderHelp')),
                  value: formatPercent(row.peak_under, 1)
                },
                { key: 'bias', label: t(e('bias')), help: t(e('biasHelp')), value: compact(row.bias) },
                {
                  key: 'coverage',
                  label: t(e('coverage')),
                  help: t(e('coverageHelp')),
                  value: formatPercent(row.coverage, 1)
                }
              ]
            : [{ key: 'none', label: t(e('wape')), value: notEnough(row.runs), muted: true }]
        }))
      : [{ key: 'none', cells: [{ key: 'none', label: t(e('wape')), value: notEnough(0), muted: true }] }]
  });

  // in time: the six indicators of the delay acceptance
  out.push({
    key: 'delay',
    title: t(e('delay')),
    help: t(e('delayHelp')),
    tag: { text: t(`page.forecast.delay.verdict_${r.delay.verdict}`), type: verdictType[r.delay.verdict] },
    groups: [
      {
        key: 'delay',
        note: t('page.forecast.delay.window', { hours: r.delay.hours, judged: r.delay.judged, scaled: r.delay.scaled }),
        cells: r.delay.indicators.map(item => ({
          key: item.key,
          label: t(`page.forecast.delay.indicator_${item.key}`),
          help: item.note,
          value:
            item.verdict === 'insufficient'
              ? t('page.forecast.delay.insufficient', { n: item.samples })
              : indicatorFigure(item, item.value),
          muted: item.verdict === 'insufficient',
          sub:
            item.verdict === 'insufficient'
              ? undefined
              : `${t('page.forecast.delay.target')} ${item.op} ${indicatorFigure(item, item.target)}`,
          tag: { text: t(`page.forecast.delay.verdict_${item.verdict}`), type: verdictType[item.verdict] }
        }))
      }
    ]
  });

  // waste
  const w = r.waste;
  out.push({
    key: 'waste',
    title: t(e('waste')),
    help: t(e('wasteHelp')),
    groups: [
      {
        key: 'waste',
        note: w.judged ? `${t(e('wasteJudged'))}: ${w.judged}` : undefined,
        cells: w.enough
          ? [
              {
                key: 'overShare',
                label: t(e('overShare')),
                help: t(e('overShareHelp')),
                value: formatPercent(w.over_share, 1)
              },
              {
                key: 'overReplicas',
                label: t(e('overReplicas')),
                help: t(e('overReplicasHelp')),
                value: num(w.over_replicas)
              },
              {
                key: 'underShare',
                label: t(e('underShare')),
                help: t(e('underShareHelp')),
                value: formatPercent(w.under_share, 1)
              },
              {
                key: 'underReplicas',
                label: t(e('underReplicas')),
                help: t(e('underReplicasHelp')),
                value: num(w.under_replicas)
              },
              {
                key: 'surplus',
                label: t(e('surplusHours')),
                help: t(e('surplusHoursHelp')),
                value: num(w.surplus_replica_hours, 1)
              }
            ]
          : [
              {
                key: 'none',
                label: t(e('overShare')),
                value: w.judged ? notEnough(w.judged) : t(e('wasteNone')),
                muted: true
              }
            ]
      }
    ]
  });

  // Pod-hours and the capacity SLO: what ran against what the measured load needed
  const p = r.capacity;
  out.push({
    key: 'capacity',
    title: t(e('capacity')),
    help: t(e('capacityHelp')),
    tag: { text: t(`page.forecast.delay.verdict_${p.verdict}`), type: verdictType[p.verdict] },
    groups: [
      {
        key: 'capacity',
        note: p.enough
          ? t(e('capacityCovered'), { hours: num(p.covered_hours, 1), share: formatPercent(p.coverage, 0) })
          : undefined,
        cells: p.enough
          ? [
              {
                key: 'slo',
                label: t(e('slo')),
                help: t(e('sloHelp')),
                value: formatPercent(p.attainment, 2),
                sub: `${t('page.forecast.delay.target')} >= ${formatPercent(p.target, 0)}`
              },
              {
                key: 'actual',
                label: t(e('actualPodHours')),
                help: t(e('actualPodHoursHelp')),
                value: num(p.actual_pod_hours, 1)
              },
              {
                key: 'needed',
                label: t(e('neededPodHours')),
                help: t(e('neededPodHoursHelp')),
                value: num(p.needed_pod_hours, 1)
              },
              {
                key: 'surplus',
                label: t(e('surplusPodHours')),
                help: t(e('surplusPodHoursHelp')),
                value: num(p.surplus_pod_hours, 1)
              },
              {
                key: 'shortfall',
                label: t(e('shortfallPodHours')),
                help: t(e('shortfallPodHoursHelp')),
                value: num(p.shortfall_pod_hours, 1)
              },
              {
                key: 'short',
                label: t(e('shortMinutes')),
                help: t(e('shortMinutesHelp')),
                value: t(e('minutes'), { n: Math.round(p.short_minutes) })
              }
            ]
          : [{ key: 'none', label: '', value: p.points ? notEnough(p.points) : t(e('capacityNone')), muted: true }]
      }
    ]
  });

  // stability
  const s = r.stability;
  const reasons = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]);
  out.push({
    key: 'stability',
    title: t(e('stability')),
    help: t(e('stabilityHelp')),
    groups: [
      {
        key: 'moves',
        cells: [
          { key: 'ups', label: t(e('ups')), value: String(s.ups) },
          { key: 'downs', label: t(e('downs')), value: String(s.downs) },
          { key: 'reversals', label: t(e('reversals')), help: t(e('reversalsHelp')), value: String(s.reversals) }
        ]
      },
      {
        key: 'degraded',
        cells: s.enough
          ? [
              {
                key: 'degraded',
                label: t(e('degraded')),
                help: t(e('degradedHelp')),
                value: t(e('degradedOf'), { n: s.degraded, total: s.recommendations })
              },
              ...(reasons.length
                ? reasons.map(([code, n]) => ({ key: code, label: code, value: String(n) }))
                : [{ key: 'noReasons', label: t(e('reasons')), value: t(e('noReasons')) }])
            ]
          : [
              {
                key: 'none',
                label: t(e('degraded')),
                help: t(e('degradedHelp')),
                value: notEnough(s.recommendations),
                muted: true
              }
            ]
      }
    ]
  });

  // who did the work
  const a = r.adoption;
  out.push({
    key: 'adoption',
    title: t(e('adoption')),
    help: t(e('adoptionHelp')),
    groups: [
      {
        key: 'adoption',
        cells: a.enough
          ? a.rows.map(row => ({
              key: row.algorithm,
              label: row.algorithm,
              value: formatPercent(row.share, 1),
              sub: t(e('adoptionCount'), { n: row.count })
            }))
          : [{ key: 'none', label: '', value: notEnough(a.total), muted: true }]
      }
    ]
  });

  // the fine-tuned copy of a model service, when the module used one
  if (r.tuning) {
    const u = r.tuning;
    out.push({
      key: 'tuning',
      title: t(e('tuning')),
      help: t(e('tuningHelp')),
      groups: [
        {
          key: 'tuning',
          cells: [
            { key: 'tuned', label: t(e('tuned')), value: String(u.tuned) },
            { key: 'failed', label: t(e('failed')), value: String(u.failed) },
            ...(u.last_tuned_at
              ? [
                  {
                    key: 'age',
                    label: t(e('tunedAge')),
                    value: t(e('hoursAgo'), { n: num(u.age_hours ?? 0, 1) }),
                    sub: formatDateTime(u.last_tuned_at)
                  }
                ]
              : []),
            ...(u.last_failed_at
              ? [
                  {
                    key: 'failure',
                    label: t(e('lastFailure')),
                    value: formatDateTime(u.last_failed_at),
                    sub: u.last_failure
                  }
                ]
              : [])
          ]
        }
      ]
    });
  }
  return out;
});

function indicatorFigure(item: Api.Forecast.DelayIndicator, value: number) {
  if (item.key === 'reach_over_lead') return `${value.toFixed(1)}×`;
  return item.unit === 'ratio' ? `${(value * 100).toFixed(1)}%` : `${Math.round(value)} s`;
}
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
        <TimeRangeField v-model="search.range" :clearable="false" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="effect-card min-h-0 flex-1 rounded-16px shadow-sm">
      <div class="mb-10px flex flex-wrap items-center justify-between gap-8px">
        <HelpLabel
          :label="t('page.forecast.effect.title')"
          :help="t('page.forecast.effect.testNote')"
          class="text-16px font-medium"
        />
        <div class="flex flex-wrap items-center gap-8px">
          <span v-if="report" class="text-12px opacity-65">
            {{ t('page.forecast.effect.algorithmInUse') }}:
            {{ report.algorithm || t('page.forecast.effect.noAlgorithm') }}
          </span>
          <NButton size="tiny" secondary :loading="loading" :disabled="!search.moduleId" @click="load">
            {{ t('page.forecast.effect.refresh') }}
          </NButton>
          <NButton size="tiny" type="primary" :disabled="!search.moduleId" @click="previewing = true">
            {{ t('page.forecast.effect.preview') }}
          </NButton>
        </div>
      </div>

      <NSpin :show="loading">
        <NEmpty v-if="!search.moduleId" :description="t('page.forecast.effect.pickModule')" class="py-48px" />
        <div v-else-if="report" class="flex-col gap-16px">
          <section v-for="section in sections" :key="section.key" class="effect-section">
            <div class="mb-6px flex items-center gap-8px">
              <HelpLabel :label="section.title" :help="section.help" class="text-14px font-medium" />
              <NTag v-if="section.tag" size="small" :bordered="false" :type="section.tag.type">
                {{ section.tag.text }}
              </NTag>
            </div>
            <div v-for="group in section.groups" :key="group.key" class="mb-6px">
              <div v-if="group.title || group.note" class="mb-4px text-12px opacity-70">
                <span v-if="group.title" class="mr-8px font-medium">{{ group.title }}</span>
                <span v-if="group.note">{{ group.note }}</span>
              </div>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-16px gap-y-8px">
                <div v-for="cell in group.cells" :key="cell.key" class="effect-cell">
                  <div v-if="cell.label || cell.tag" class="flex items-center gap-4px text-12px opacity-70">
                    <HelpLabel v-if="cell.help" :label="cell.label" :help="cell.help" />
                    <span v-else>{{ cell.label }}</span>
                    <NTag v-if="cell.tag" size="tiny" :bordered="false" :type="cell.tag.type">{{ cell.tag.text }}</NTag>
                  </div>
                  <div :class="cell.muted ? 'text-13px leading-22px opacity-70' : 'text-18px leading-26px'">
                    {{ cell.value }}
                  </div>
                  <div v-if="cell.sub" class="text-12px opacity-60">{{ cell.sub }}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <NEmpty v-else :description="t('page.forecast.effect.empty')" class="py-48px" />
      </NSpin>
    </NCard>

    <ChangePreviewModal v-model:show="previewing" :module-id="search.moduleId" :algorithm="report?.algorithm" />
  </div>
</template>

<style scoped>
.effect-card :deep(.n-card__content) {
  overflow: auto;
}
.effect-section + .effect-section {
  border-top: 1px solid var(--n-border-color, rgba(128, 128, 128, 0.2));
  padding-top: 12px;
}
</style>
