<script setup lang="ts">
import { computed, h } from 'vue';
import { NDataTable, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { formatDecimal, formatScore } from '@/utils/format';
import { percentName } from '@/utils/percentile';

defineOptions({ name: 'AheadExplain' });

/**
 * The forward-looking part of a replica decision, in plain terms: how far ahead of the load the replicas are asked for and why that
 * long, what every algorithm asks for in each window, how their answers were brought to one number, what the load measured now says,
 * and how the earlier scale-ups of the module went.
 */
const props = defineProps<{ ahead: Api.Forecast.Ahead }>();
const { t } = useI18n();

const seconds = (n: number) => t('page.forecast.explain.aheadSeconds', { n: Math.round(n) });

const leadParts = computed(() => {
  const l = props.ahead.lead;
  const source =
    l.ready_source === 'measured'
      ? t('page.forecast.explain.aheadLeadMeasured', { n: l.ready_samples, p: percentName(l.percentile) })
      : t('page.forecast.explain.aheadLeadConfigured');
  return (
    t('page.forecast.explain.aheadLeadParts', {
      ready: Math.round(l.ready_seconds),
      source,
      node: Math.round(l.node_seconds),
      wait: Math.round(l.decision_seconds),
      margin: Math.round(l.margin_seconds)
    }) + (l.capped ? t('page.forecast.explain.aheadLeadCapped') : '')
  );
});

const action = computed(() => {
  const s = props.ahead.settlement;
  if (s.emergency) return { type: 'error' as const, text: t('page.forecast.explain.aheadEmergency') };
  const type = ({ up: 'warning', down: 'info', hold: 'default' } as const)[s.action];
  return { type, text: t(`page.forecast.explain.aheadAction_${s.action}`) };
});

const algorithms = computed(() => {
  const set = new Set<string>();
  props.ahead.windows.forEach(w => w.needs.forEach(n => set.add(n.algorithm)));
  return [...set];
});

type WindowRow = Api.Forecast.AheadWindow & Record<string, number | string | boolean | undefined | object>;

const windowRows = computed<WindowRow[]>(() => props.ahead.windows as WindowRow[]);

const windowColumns = computed<DataTableColumns<WindowRow>>(() => [
  {
    title: t('page.forecast.explain.aheadWindow'),
    key: 'window',
    width: 190,
    render: row => {
      const base = t('page.forecast.explain.aheadWindowMinutes', { n: formatDecimal(row.seconds / 60, 1) });
      const tags = [];
      if (row.lead) {
        tags.push(
          h(NTag, { size: 'small', bordered: false, type: 'warning' }, () => t('page.forecast.explain.aheadWindowLead'))
        );
      }
      if (row.horizon) {
        tags.push(h(NTag, { size: 'small', bordered: false }, () => t('page.forecast.explain.aheadWindowHorizon')));
      }
      return h('div', { class: 'flex flex-wrap items-center gap-6px' }, [base, ...tags]);
    }
  },
  ...algorithms.value.map(name => ({
    title: name,
    key: `algo:${name}`,
    minWidth: 110,
    render: (row: WindowRow) => row.needs.find(n => n.algorithm === name)?.replicas ?? '-'
  })),
  { title: t('page.forecast.explain.aheadConsensus'), key: 'consensus', width: 90 }
]);

const voteColumns = computed<DataTableColumns<Api.Forecast.AheadVote>>(() => [
  { title: t('page.forecast.explain.aheadVotesAlgorithm'), key: 'algorithm', minWidth: 140 },
  { title: t('page.forecast.explain.aheadVotesReplicas'), key: 'replicas', width: 120 },
  {
    title: t('page.forecast.explain.aheadVotesCredibility'),
    key: 'credibility',
    width: 110,
    render: row => formatScore(row.credibility)
  }
]);

const consensusLine = computed(() => {
  const c = props.ahead.up;
  if (!c.votes?.length) return '';
  const n = c.votes.filter(v => v.credibility > 0).length;
  if (c.min === c.max) return t('page.forecast.explain.aheadConsensusSame', { n, replicas: c.replicas });
  return t('page.forecast.explain.aheadConsensusLine', {
    n,
    min: c.min,
    max: c.max,
    quantile: Math.round(c.quantile * 100),
    replicas: c.replicas,
    leader: c.leader
  });
});

const downLine = computed(() =>
  t('page.forecast.explain.aheadDownLine', {
    quantile: Math.round(props.ahead.down.quantile * 100),
    replicas: props.ahead.down.replicas
  })
);

const liveLine = computed(() => {
  const l = props.ahead.live;
  if (!l.ok) return l.note || t('page.forecast.explain.aheadLiveNone');
  return t('page.forecast.explain.aheadLiveLine', {
    resource: t(`page.forecast.modules.resource_${l.resource === 'rps' ? 'replicas' : l.resource}`, l.resource || ''),
    value: formatDecimal(l.value ?? 0, 3),
    need: l.need
  });
});

const outcomesLine = computed(() => t('page.forecast.explain.aheadOutcomesLine', props.ahead.outcomes));
</script>

<template>
  <div class="flex flex-col gap-8px text-13px">
    <div class="font-medium">{{ t('page.forecast.explain.aheadTitle') }}</div>

    <div class="flex flex-wrap items-center gap-8px">
      <NTag size="small" :bordered="false" :type="action.type">{{ action.text }}</NTag>
      <span>{{ ahead.current }} → {{ ahead.settlement.replicas }}</span>
      <span class="opacity-70">{{ ahead.settlement.reason }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-8px">
      <span class="font-medium">{{ t('page.forecast.explain.aheadLead') }}</span>
      <NTag size="small" :bordered="false" type="info">{{ seconds(ahead.lead.seconds) }}</NTag>
      <span class="opacity-70">{{ leadParts }}</span>
    </div>

    <div v-if="ahead.reach" class="flex flex-wrap items-center gap-8px">
      <span class="font-medium">{{ t('page.forecast.explain.aheadReach') }}</span>
      <NTag size="small" :bordered="false" :type="ahead.reach.extended ? 'warning' : 'default'">
        {{ t('page.forecast.explain.aheadReachMinutes', { n: ahead.reach.effective_minutes }) }}
      </NTag>
      <span class="opacity-70">
        {{
          ahead.reach.extended
            ? t('page.forecast.explain.aheadReachExtended', {
                configured: ahead.reach.configured_minutes,
                n: ahead.reach.effective_minutes
              })
            : t('page.forecast.explain.aheadReachFine')
        }}
      </span>
    </div>

    <div>
      <div class="mb-4px">{{ t('page.forecast.explain.aheadWindows') }}</div>
      <NDataTable
        size="small"
        :columns="windowColumns"
        :data="windowRows"
        :row-key="(row: any) => row.steps"
        :scroll-x="190 + algorithms.length * 110 + 90"
      />
    </div>

    <div v-if="ahead.up.votes?.length">
      <div class="mb-4px">{{ t('page.forecast.explain.aheadVotes') }}</div>
      <NDataTable
        size="small"
        :columns="voteColumns"
        :data="ahead.up.votes"
        :row-key="(row: any) => row.algorithm"
        :scroll-x="370"
      />
      <div class="mt-4px opacity-70">{{ consensusLine }}</div>
      <div class="opacity-70">{{ downLine }}</div>
    </div>

    <div class="flex flex-wrap items-center gap-8px">
      <span class="font-medium">{{ t('page.forecast.explain.aheadLive') }}</span>
      <span class="opacity-80">{{ liveLine }}</span>
    </div>

    <div v-if="ahead.outcomes.judged || ahead.outcomes.open" class="flex flex-wrap items-center gap-8px">
      <span class="font-medium">{{ t('page.forecast.explain.aheadOutcomes') }}</span>
      <span class="opacity-80">{{ outcomesLine }}</span>
    </div>
    <div v-for="note in ahead.notes || []" :key="note" class="opacity-70">{{ note }}</div>
  </div>
</template>
