<script setup lang="ts">
import { computed } from 'vue';
import { NModal, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import FormulaView from '@/components/common/formula-view.vue';
import { amountText, podsOf } from '@/utils/amount';
import { type Caliber, configBasisLines } from '@/utils/config-basis';
import { formatPercent } from '@/utils/format';
import { type Level, directionLevel, replicaView } from '@/utils/overprovision-replicas';
import { adjustmentOf, adjustmentText } from '@/utils/overprovision-verdict';
import { name, num, op, res } from '@/utils/formula';
import { replicaBasisLines } from '@/utils/replica-basis';

defineOptions({ name: 'ReplicaBasisModal' });

/**
 * The basis of a recommendation, in one window, for ONE of the two ways: the replicas change and the Pod stays (scheme "replicas"), or the Pod changes and the replicas stay
 * (scheme "config"). The two are worked out apart and never share a result. The window lists the input (the use at P90, P95 and P99, the Requests and the Limits, of one Pod and of
 * all the replicas, and the replicas), the coefficients with their unit and where they are set, the calculation one step to a line with its unit, and what held the result.
 * The caliber (the three percentiles together, or one of them) decides which percentiles the calculation is made of.
 */
interface Props {
  detail: Api.Overprovision.Detail | null;
  scheme: 'replicas' | 'config';
  caliber: Caliber;
}
const props = defineProps<Props>();
const show = defineModel<boolean>('show', { required: true });
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const view = computed(() => replicaView(props.detail));
const rec = computed(() => props.detail?.recommend ?? props.detail?.windows[0] ?? null);
const params = computed(() => props.detail?.params);
const TAG: Record<Level, 'success' | 'warning' | 'error' | 'info'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  info: 'info'
};
const resName = (resource: string) => (resource === 'cpu' ? p('sectionCpu') : p('sectionMemory'));
const caliberName = computed(() => (props.caliber === 'all' ? p('caliberAllName') : props.caliber));

/** the plan of the caliber chosen: the three together, or one percentile alone */
const plan = computed(() => {
  const all = rec.value?.replica_plan ?? null;
  if (!all) return null;
  return props.caliber === 'all' ? all : (all.by_caliber?.[props.caliber] ?? null);
});

const words = computed(() => ({
  totalUse: p('basisTotalUse'),
  requests: 'Requests',
  limits: 'Limits',
  guard: p('basisGuard'),
  result: p('basisResult'),
  replicas: p('basisReplicas'),
  coefSource: p('basisCoefSource'),
  guardSource: p('basisGuardSource'),
  limitGuard: p('basisLimitGuard'),
  podRequests: p('basisPodRequests'),
  podLimits: p('basisPodLimits'),
  replicasUnit: p('basisReplicasUnit')
}));
const configWords = computed(() => ({
  podUse: p('basisPodUse'),
  largest: p('basisLargest'),
  rounded: p('basisRounded'),
  requests: 'Requests',
  limits: 'Limits',
  limitsLine: p('basisLimitsLine'),
  floorOom: p('formulaFloorOom'),
  floorThrottle: p('formulaFloorThrottle'),
  coefSource: p('basisCoefSource'),
  requestHeadroom: p('formulaRequestHeadroom'),
  limitHeadroom: p('formulaHeadroom'),
  current: p('basisRequestsNow')
}));

// ---- the input: what was measured and what is configured, of one Pod and of all the replicas, with the unit written once in the head of each figure
const replicas = computed(() => Math.max(props.detail?.replicas ?? 0, 0));
interface InputRow {
  key: string;
  name: string;
  scope: string;
  p90: string;
  p95: string;
  p99: string;
  /** the same percentiles of the raw points when the use is held for the sustain window (empty when it is not) */
  raw: string[];
  request: string;
  limit: string;
}
const inputRows = computed(() => {
  const rows: InputRow[] = [];
  for (const resource of ['cpu', 'memory'] as const) {
    const r = rec.value?.[resource];
    if (!r) continue;
    const unit = (v: number | undefined | null) => amountText(resource, v);
    const held = r.sustained ?? r.usage;
    rows.push({
      key: `${resource}-pod`,
      name: resName(resource),
      scope: p('basisScopePod'),
      p90: unit(held.p90),
      p95: unit(held.p95),
      p99: unit(held.p99),
      raw: r.sustained ? [unit(r.usage.p90), unit(r.usage.p95), unit(r.usage.p99)] : [],
      request: unit(r.request),
      limit: unit(r.limit)
    });
    if (r.total) {
      const pods = Math.max(podsOf(r.request, r.request_total, replicas.value), 1);
      const heldAll = r.total_sustained ?? r.total;
      rows.push({
        key: `${resource}-all`,
        name: resName(resource),
        scope: p('basisScopeAll'),
        p90: unit(heldAll.p90),
        p95: unit(heldAll.p95),
        p99: unit(heldAll.p99),
        raw: r.total_sustained ? [unit(r.total.p90), unit(r.total.p95), unit(r.total.p99)] : [],
        request: unit(r.request_total > 0 ? r.request_total : r.request * pods),
        limit: unit(r.limit_total > 0 ? r.limit_total : r.limit * pods)
      });
    }
  }
  return rows;
});

const coefficients = computed(() => {
  const pr = params.value;
  if (!pr) return [];
  const pct = (v: number) => formatPercent(v, 0);
  const rows = [
    {
      name: p('basisTarget', { p: 'P90' }),
      value: pct(pr.p90.target),
      unit: p('unitShareOfRequests'),
      source: p('srcCoefficients')
    },
    {
      name: p('basisTarget', { p: 'P95' }),
      value: pct(pr.p95.target),
      unit: p('unitShareOfRequests'),
      source: p('srcCoefficients')
    },
    {
      name: p('basisTarget', { p: 'P99' }),
      value: pct(pr.p99.target),
      unit: p('unitShareOfRequests'),
      source: p('srcCoefficients')
    }
  ];
  if (props.scheme === 'replicas')
    rows.push({
      name: p('basisGuardName'),
      value: pct(pr.peak_near_limit),
      unit: p('unitShareOfLimits'),
      source: p('srcCoefficients')
    });
  else
    rows.push(
      {
        name: p('coefRequestMargin', { r: p('sectionCpu') }),
        value: pct(pr.cpu_request_headroom || 0),
        unit: p('unitMargin'),
        source: p('srcModule')
      },
      {
        name: p('coefRequestMargin', { r: p('sectionMemory') }),
        value: pct(pr.memory_request_headroom || 0),
        unit: p('unitMargin'),
        source: p('srcModule')
      },
      {
        name: p('coefLimitMargin', { r: p('sectionCpu') }),
        value: pct(pr.cpu_limit_headroom || pr.limit_headroom),
        unit: p('unitMarginOfP99'),
        source: p('srcCoefficients')
      },
      {
        name: p('coefLimitMargin', { r: p('sectionMemory') }),
        value: pct(pr.memory_limit_headroom || pr.limit_headroom),
        unit: p('unitMarginOfP99'),
        source: p('srcCoefficients')
      }
    );
  return rows;
});

// ---- the way where the replicas change
const resources = computed(() =>
  (plan.value?.resources ?? []).map(need => {
    const resource = need.resource === 'memory' ? 'memory' : 'cpu';
    return {
      key: need.resource,
      name: resName(need.resource),
      request: amountText(resource, need.request),
      limit: need.limit > 0 ? amountText(resource, need.limit) : '-',
      lines: params.value ? replicaBasisLines(need, params.value, words.value) : [],
      needed: need.needed,
      binding: plan.value?.binding === need.resource
    };
  })
);
const bounds = computed(() => {
  const limits = plan.value?.limits;
  const reasons = plan.value?.reasons ?? [];
  const row = (key: string, value: number, reason: string) => ({
    key,
    name: p(`bound_${key}`),
    value: value > 0 ? p('basisReplicasCount', { n: value }) : p('boundNotSet'),
    effect: value > 0 ? (reasons.includes(reason) ? 'on' : 'off') : 'unset'
  });
  return [
    row('min', limits?.min ?? 0, 'replicas_floor'),
    row('max', limits?.max ?? 0, 'replicas_ceiling'),
    row('up', limits?.scale_up_step ?? 0, 'replicas_step'),
    row('down', limits?.scale_down_step ?? 0, 'replicas_step')
  ];
});
const protections = computed(() => {
  const reasons = plan.value?.reasons ?? [];
  return [
    { key: 'limited', on: reasons.includes('replicas_limited') },
    { key: 'limit', on: reasons.includes('replicas_limit') }
  ];
});
const effectType = { on: 'warning', off: 'default', unset: 'default' } as const;
const summary = computed(() => {
  const current = view.value?.current ?? 0;
  const needed = plan.value?.needed ?? 0;
  const delta = needed - current;
  const share = current > 0 ? Math.abs(delta) / current : 0;
  const text =
    current <= 0 || needed <= 0
      ? p('repUnknown')
      : delta === 0
        ? p('repSame')
        : delta > 0
          ? p('repOut', { n: delta, share: formatPercent(share, 1) })
          : p('repIn', { n: -delta, share: formatPercent(share, 1) });
  const direction = current <= 0 || needed <= 0 ? 'unknown' : delta === 0 ? 'same' : delta > 0 ? 'out' : 'in';
  return { current, needed, text, level: directionLevel(direction) };
});

// ---- the way where the Pod changes
const configBlocks = computed(() =>
  (['cpu', 'memory'] as const)
    .map(resource => {
      const r = rec.value?.[resource];
      if (!r || !params.value) return null;
      const candidate = props.caliber === 'all' ? null : r.candidates?.find(c => c.name === props.caliber);
      const requests = candidate ? candidate.suggested : r.suggested;
      const limits = candidate ? candidate.suggested_limit : r.suggested_limit;
      const gap = adjustmentOf(r.request, requests);
      const limitGap = adjustmentOf(r.limit, limits);
      const note = (g: ReturnType<typeof adjustmentOf>, label: string) =>
        g && g.direction !== 'same'
          ? p(g.direction === 'over' ? 'basisLower' : 'basisRaise', {
              what: label,
              amount: adjustmentText(resource, g)
            })
          : p('basisKeep', { what: label });
      return {
        key: resource,
        name: resName(resource),
        lines: configBasisLines(r, params.value, props.caliber, configWords.value),
        decides: r.candidates?.find(c => c.decides)?.name ?? '',
        status: r.status,
        why: [
          note(gap, 'Requests'),
          r.limit > 0 ? note(limitGap, 'Limits') : '',
          ...r.reasons.map(code => p(`reason_${code}`))
        ].filter(Boolean),
        keptByVerdict: props.caliber === 'all' && r.needed > 0 && Math.abs(r.needed - r.suggested) > 1e-9
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
);
/** the sustain window the percentiles are taken over (0 = the raw points) */
const sustainMinutes = computed(() => rec.value?.cpu?.sustain_minutes || rec.value?.memory?.sustain_minutes || 0);

/** what each symbol of the formulas is, with its unit and where it comes from: no figure of a formula is left without a source */
const sources = computed(() => {
  const d = props.detail;
  if (!d) return [];
  const queryName = (kind: string) => d.queries.find(q => q.kind === kind)?.name || p('basisSourceNone');
  const specFrom =
    d.pod_spec_from === 'kubernetes'
      ? p('basisSpecKubernetes')
      : d.pod_spec_from === 'estimated'
        ? p('basisSpecEstimated')
        : p('basisSourceNone');
  const rows = [
    {
      name: p('basisTotalUse'),
      unit: p('unitCoresBytes'),
      source: p('basisSourceUse', {
        cpu: queryName('cpu'),
        memory: queryName('memory'),
        window: rec.value?.label ?? '',
        how: sustainMinutes.value > 0 ? p('basisSustainedHow', { n: sustainMinutes.value }) : p('basisRawHow')
      })
    },
    { name: p('basisPodRequests'), unit: p('unitCoresBytes'), source: specFrom },
    { name: p('basisPodLimits'), unit: p('unitCoresBytes'), source: specFrom },
    {
      name: p('basisReplicasRow'),
      unit: p('basisReplicasUnit'),
      source: p(`replicasFromName_${view.value?.from || 'none'}`)
    }
  ];
  if (props.scheme === 'replicas')
    rows.push({ name: p('basisRounding'), unit: p('basisReplicasUnit'), source: p('basisRoundingRule') });
  return rows;
});

/** the larger of what the CPU and the memory ask for: the rule that makes the recommendation, written with the figures */
const maxLines = computed(() => {
  const needs = plan.value?.resources ?? [];
  if (!needs.length) return [];
  const parts = needs.flatMap((need, i) => [
    ...(i ? [op(',')] : []),
    name(resName(need.resource)),
    num(`${need.needed} ${p('basisReplicasUnit')}`)
  ]);
  return [
    {
      label: p('basisMaxLabel'),
      tokens: [
        name(p('basisRecommended')),
        op('='),
        name('max'),
        op('('),
        ...parts,
        op(')'),
        op('='),
        res(`${plan.value?.raw ?? 0} ${p('basisReplicasUnit')}`)
      ]
    }
  ];
});

/** how long the use was above the recommended Requests and above the one it has now: what the recommendation still has to answer for */
const exceedLines = computed(() =>
  (['cpu', 'memory'] as const)
    .map(resource => {
      const r = rec.value?.[resource];
      if (!r?.exceed_suggested) return '';
      const e = r.exceed_suggested;
      return p('basisExceed', {
        r: resName(resource),
        level: amountText(resource, e.level),
        share: formatPercent(e.share, 1),
        events: e.events,
        longest: e.longest_minutes,
        now: r.exceed_now ? formatPercent(r.exceed_now.share, 1) : '-'
      });
    })
    .filter(Boolean)
);
const oom = computed(() => props.detail?.oom?.protection ?? null);
/** Limits against Requests: the multiple now and the multiple recommended, so the two figures are never read apart */
const limitRatio = computed(() =>
  (['cpu', 'memory'] as const)
    .map(resource => {
      const r = rec.value?.[resource];
      if (!r || !(r.request > 0) || !(r.limit > 0)) return '';
      const pick = (field: 'suggested' | 'suggested_limit') =>
        props.caliber === 'all' ? r[field] : (r.candidates?.find(c => c.name === props.caliber)?.[field] ?? 0);
      if (!(pick('suggested') > 0)) return '';
      return p('basisLimitRatio', {
        r: resName(resource),
        now: (r.limit / r.request).toFixed(2),
        rec: (pick('suggested_limit') / pick('suggested')).toFixed(2)
      });
    })
    .filter(Boolean)
);
const title = computed(() => (props.scheme === 'replicas' ? p('basisModalTitleReplicas') : p('basisModalTitleConfig')));
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="title" class="replica-basis" :style="{ width: 'min(920px, 95vw)' }">
    <div v-if="rec" class="basis-body">
      <div class="basis-summary">
        <NTag size="small" :bordered="false" type="info">{{ p('basisCaliber', { c: caliberName }) }}</NTag>
        <span class="basis-sub">
          {{ props.caliber === 'all' ? p('basisCaliberAllHelp') : p('basisCaliberOneHelp', { c: props.caliber }) }}
        </span>
      </div>

      <!-- the input: every figure with its unit in the head, the use at the three percentiles, the Requests and the Limits -->
      <div class="basis-block">
        <div class="basis-title">{{ p('basisInput') }}</div>
        <NTable size="small" :bordered="true" :single-line="false" class="basis-table text-12px">
          <thead>
            <tr>
              <th>{{ p('basisInputItem') }}</th>
              <th>{{ p('basisInputScope') }}</th>
              <th>P90 {{ p('basisUse') }}</th>
              <th>P95 {{ p('basisUse') }}</th>
              <th>P99 {{ p('basisUse') }}</th>
              <th>Requests</th>
              <th>Limits</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in inputRows" :key="row.key">
              <td class="font-medium">{{ row.name }}</td>
              <td>{{ row.scope }}</td>
              <td>
                {{ row.p90 }}
                <div v-if="row.raw.length" class="basis-raw">{{ p('basisRaw1', { v: row.raw[0] }) }}</div>
              </td>
              <td>
                {{ row.p95 }}
                <div v-if="row.raw.length" class="basis-raw">{{ p('basisRaw1', { v: row.raw[1] }) }}</div>
              </td>
              <td>
                {{ row.p99 }}
                <div v-if="row.raw.length" class="basis-raw">{{ p('basisRaw1', { v: row.raw[2] }) }}</div>
              </td>
              <td>{{ row.request }}</td>
              <td>{{ row.limit }}</td>
            </tr>
            <tr v-if="view">
              <td class="font-medium">{{ p('basisReplicasRow') }}</td>
              <td colspan="6">
                {{
                  p('basisReplicasFacts', {
                    now: view.current || '-',
                    ready: view.ready || '-',
                    abnormal: detail?.replicas_abnormal ?? 0
                  })
                }}
                · {{ p(`replicasFromName_${view.from || 'none'}`) }}
              </td>
            </tr>
          </tbody>
        </NTable>
        <div class="basis-sub">{{ p('basisUnits') }}</div>
        <div class="basis-sub">
          {{ sustainMinutes > 0 ? p('basisSustained', { n: sustainMinutes }) : p('basisNotSustained') }}
        </div>
      </div>

      <div class="basis-block">
        <div class="basis-title">{{ p('basisSources') }}</div>
        <NTable size="small" :bordered="true" :single-line="false" class="basis-table text-12px">
          <thead>
            <tr>
              <th>{{ p('basisCoefName') }}</th>
              <th>{{ p('basisCoefUnit') }}</th>
              <th>{{ p('basisCoefSourceCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sources" :key="row.name">
              <td class="font-medium">{{ row.name }}</td>
              <td>{{ row.unit }}</td>
              <td>{{ row.source }}</td>
            </tr>
          </tbody>
        </NTable>
      </div>

      <div class="basis-block">
        <div class="basis-title">{{ p('basisCoefficients') }}</div>
        <NTable size="small" :bordered="true" :single-line="false" class="basis-table text-12px">
          <thead>
            <tr>
              <th>{{ p('basisCoefName') }}</th>
              <th>{{ p('basisCoefValue') }}</th>
              <th>{{ p('basisCoefUnit') }}</th>
              <th>{{ p('basisCoefSourceCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in coefficients" :key="c.name">
              <td>{{ c.name }}</td>
              <td class="font-medium">{{ c.value }}</td>
              <td>{{ c.unit }}</td>
              <td>{{ c.source }}</td>
            </tr>
          </tbody>
        </NTable>
      </div>

      <!-- the way where the replicas change: the Pod keeps its Requests and Limits -->
      <template v-if="scheme === 'replicas'">
        <div class="basis-summary">
          <div>
            <div class="basis-label">{{ p('basisCurrent') }}</div>
            <div class="basis-figure">{{ summary.current || '-' }}</div>
            <div class="basis-sub">{{ p('basisReplicasUnit') }}</div>
          </div>
          <div class="basis-arrow">→</div>
          <div>
            <div class="basis-label">{{ p('basisRecommended') }}</div>
            <div class="basis-figure">{{ summary.needed || '-' }}</div>
            <NTag size="small" :bordered="false" :type="TAG[summary.level]">{{ summary.text }}</NTag>
          </div>
        </div>
        <div v-for="item in resources" :key="item.key" class="basis-block">
          <div class="basis-title">
            {{ p('basisNeedByResource', { r: item.name }) }}
            <NTag v-if="item.binding" size="tiny" :bordered="false" type="info">{{ p('basisDecides') }}</NTag>
          </div>
          <div class="basis-sub">{{ p('basisPodSpec', { request: item.request, limit: item.limit }) }}</div>
          <FormulaView :lines="item.lines" />
        </div>
        <div v-if="maxLines.length" class="basis-block">
          <div class="basis-title">{{ p('basisMaxTitle') }}</div>
          <FormulaView :lines="maxLines" />
        </div>
        <div v-if="plan?.binding" class="basis-note">
          {{ p('basisDecidedBy', { r: resName(plan.binding), n: plan.raw }) }}
        </div>
        <div v-if="plan && (plan.this_round ?? plan.needed) !== plan.needed" class="basis-note">
          {{ p('basisPace', { needed: plan.needed, round: plan.this_round ?? plan.needed, current: plan.current }) }}
        </div>

        <div class="basis-block">
          <div class="basis-title">{{ p('basisBounds') }}</div>
          <div class="basis-sub">{{ p('basisRaw', { raw: plan?.raw ?? 0, final: plan?.needed ?? 0 }) }}</div>
          <div v-for="b in bounds" :key="b.key" class="basis-row">
            <span>{{ b.name }}</span>
            <b>{{ b.value }}</b>
            <NTag size="tiny" :bordered="false" :type="effectType[b.effect as 'on' | 'off' | 'unset']">
              {{ p(`boundEffect_${b.effect}`) }}
            </NTag>
          </div>
          <div v-for="item in protections" :key="item.key" class="basis-row">
            <span>{{ p(`protect_${item.key}`) }}</span>
            <span />
            <NTag size="tiny" :bordered="false" :type="item.on ? 'warning' : 'default'">
              {{ item.on ? p('boundEffect_on') : p('boundEffect_off') }}
            </NTag>
          </div>
          <div class="basis-sub">{{ p('basisFormulaNote') }}</div>
          <div class="basis-sub">{{ p('basisKeepsPod') }}</div>
        </div>
        <div v-if="oom" class="basis-note">
          {{
            p('basisOom', {
              f: amountText('memory', oom.floor),
              n: oom.kills,
              held: oom.replicas_held ? p('basisOomHeld') : ''
            })
          }}
        </div>
      </template>

      <!-- the way where the Pod changes: the replicas stay -->
      <template v-else>
        <div class="basis-note">{{ p('basisKeepsReplicas', { n: view?.current || '-' }) }}</div>
        <div v-for="item in configBlocks" :key="item.key" class="basis-block">
          <div class="basis-title">
            {{ p('basisConfigByResource', { r: item.name }) }}
            <NTag v-if="item.decides && caliber === 'all'" size="tiny" :bordered="false" type="info">
              {{ p('basisDecidedPercentile', { c: item.decides }) }}
            </NTag>
          </div>
          <FormulaView :lines="item.lines" />
          <div v-if="item.keptByVerdict" class="basis-sub">
            {{ p('basisKeptByVerdict', { s: p(`health_${item.status}`) }) }}
          </div>
          <ul class="basis-why">
            <li v-for="line in item.why" :key="line">{{ line }}</li>
          </ul>
        </div>
        <div v-for="line in limitRatio" :key="line" class="basis-sub">{{ line }}</div>
        <div v-for="line in exceedLines" :key="line" class="basis-sub">{{ line }}</div>
        <div v-if="oom" class="basis-note">
          {{
            p('basisOomConfig', {
              ws: amountText('memory', oom.working_set),
              up: oom.uplift,
              req: amountText('memory', oom.request),
              f: amountText('memory', oom.floor),
              n: oom.kills,
              raised: oom.floor_raised ? p('basisOomRaised') : p('basisOomNotRaised')
            })
          }}
        </div>
        <div class="basis-sub">{{ p('basisHowPercentiles') }}</div>
        <div class="basis-sub">{{ p('basisKeepsReplicasNote') }}</div>
      </template>
    </div>
    <div v-else class="text-13px opacity-70">{{ p('repNoPlan') }}</div>
  </NModal>
</template>

<style scoped>
.basis-body {
  display: grid;
  gap: 14px;
  max-height: 74vh;
  padding-right: 4px;
  overflow-y: auto;
}

.basis-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}

.basis-arrow {
  font-size: 22px;
  opacity: 0.5;
}

.basis-label,
.basis-sub {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.7;
}

.basis-figure {
  font-size: 26px;
  font-weight: 700;
  line-height: 32px;
}

.basis-block {
  display: grid;
  gap: 6px;
}

.basis-title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-weight: 600;
}

.basis-note {
  padding: 6px 10px;
  font-size: 13px;
  background: rgba(32, 128, 240, 0.08);
  border-radius: 6px;
}

.basis-table {
  table-layout: auto;
}

.basis-raw {
  font-size: 11px;
  opacity: 0.6;
}

.basis-why {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 20px;
}

.basis-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 100px auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
</style>
