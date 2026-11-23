<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCollapse, NCollapseItem, NSkeleton, NSpin, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import OverprovisionCardWall, { type WallCard } from '@/components/business/overprovision-card-wall.vue';
import OverprovisionLineChart, { type ChartSpec } from '@/components/business/overprovision-line-chart.vue';
import PromqlList, { type PromqlItem } from '@/components/business/promql-list.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { allText, amountText, podsOf, totalText } from '@/utils/amount';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatDecimal, formatPercent } from '@/utils/format';
import { adjustmentOf, adjustmentText, shareText } from '@/utils/overprovision-verdict';

defineOptions({ name: 'OverprovisionModulePanel' });

/**
 * The analysis of one module, every figure of it read from Prometheus: first the table of the Requests and Limits (what they are now and what the use
 * supports, for one Pod and for all the replicas), then a wall of cards (the OOM kills, what it uses, what is left and how much of it is used), the quantiles of the use of one Pod and of all the replicas with the number of samples they are made of, the
 * use of one Pod and of all the replicas over the window, the queries that were sent, and the other metrics the module has set up (container, JVM, throttling).
 * Everything is of the module chosen on the page; the AI analysis is the helper at the lower right of the page.
 */
interface Props {
  detail: Api.Overprovision.Detail | null;
  loading: boolean;
  /** pod: the request and the use of one Pod; total: all the replicas together */
  basis: 'pod' | 'total';
  /** why the figures could not be read, when they could not */
  error: string;
}
const props = defineProps<Props>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

type Res = 'cpu' | 'memory';
const win = computed(() => props.detail?.windows[0] ?? null);
const results = computed(() =>
  (['cpu', 'memory'] as Res[])
    .map(resource => ({ resource, result: win.value?.[resource] ?? null }))
    .filter((item): item is { resource: Res; result: Api.Overprovision.Result } => Boolean(item.result))
);
/** the analysis of the recommendation period: the verdict and the recommended Requests and Limits are this one's, whatever window the page shows (an older answer of the platform has only the window) */
const rec = computed(() => props.detail?.recommend ?? win.value);
const recResults = computed(() =>
  (['cpu', 'memory'] as Res[])
    .map(resource => ({ resource, result: rec.value?.[resource] ?? null }))
    .filter((item): item is { resource: Res; result: Api.Overprovision.Result } => Boolean(item.result))
);
const recLabel = computed(() => rec.value?.label ?? '');
const times = computed(() => (props.basis === 'total' ? Math.max(props.detail?.replicas ?? 1, 1) : 1));

const fmt = (resource: string, value: number | null | undefined) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);
const resName = (resource: string) => (resource === 'cpu' ? p('sectionCpu') : p('sectionMemory'));

const statusType: Record<string, 'default' | 'error' | 'warning' | 'success' | 'info'> = {
  risk: 'error',
  under: 'error',
  over: 'warning',
  limited: 'info',
  ok: 'success',
  unknown: 'default'
};
const levelType: Record<string, 'default' | 'warning' | 'success'> = {
  high: 'success',
  medium: 'warning',
  low: 'default'
};
const riskType: Record<string, 'default' | 'error' | 'warning' | 'success'> = {
  high: 'error',
  medium: 'warning',
  low: 'success'
};

// ---- OOM: the number of times a container was killed for memory, and nothing else of it

const oomSource = computed(() => props.detail?.queries.find(query => query.kind === 'oom') ?? null);
const oomKills = computed(() => {
  const memory = win.value?.memory;
  if (!oomSource.value || oomSource.value.error || !memory) return null;
  return memory.oom_kills;
});
/** the working set at the time of the kill, when the module has that metric and a kill happened */
const oomWorkingSet = computed(() => {
  const memory = win.value?.memory;
  return memory && memory.oom_working_set > 0 ? memory.oom_working_set : 0;
});

// ---- the card wall

/** why a metric of the module has no figure: it is not set up on the module, or its query answered nothing */
function whyMissing(kind: string) {
  const query = props.detail?.queries.find(item => item.kind === kind);
  if (!query) return p('metricNotSetUp', { kind });
  return query.error || undefined;
}

/** the share of the request that is used, as a figure that stays readable: above 200% it says so instead of a number of thousands */
function rateText(rate: number | null) {
  if (rate === null) return '-';
  return rate > 2 ? '> 200%' : formatPercent(rate, 0);
}

const wall = computed<WallCard[]>(() => {
  const d = props.detail;
  if (!d) return [];
  const cards: WallCard[] = [];
  // OOM: how many times a container was killed for memory in the window, and what the working set was then
  cards.push({
    key: 'oom',
    label: p('oomCount'),
    help: p('oomCountHelp'),
    value: oomKills.value === null ? '-' : formatDecimal(oomKills.value, 0),
    sub: oomKills.value === null ? oomSource.value?.error || p('oomNoSource') : undefined,
    level: oomKills.value === null ? 'neutral' : oomKills.value > 0 ? 'danger' : 'good'
  });
  if (oomKills.value !== null && oomKills.value > 0) {
    cards.push({
      key: 'oomWs',
      label: p('oomWorkingSet'),
      help: p('oomWorkingSetHelp'),
      value: oomWorkingSet.value > 0 ? fmt('memory', oomWorkingSet.value * times.value) : '-',
      sub: oomWorkingSet.value > 0 ? undefined : whyMissing('oom_working_set'),
      level: 'danger'
    });
  }
  cards.push({
    key: 'replicas',
    label: p('configReplicas'),
    value: d.replicas ? String(d.replicas) : '-',
    level: 'neutral'
  });
  for (const { resource, result: r } of results.value) {
    const name = resName(resource);
    const used = props.basis === 'total' && r.total ? r.total.p95 : r.usage.p95;
    // all the replicas together: what Prometheus summed (the Pods in the sum are not always the ready replicas), else one Pod times the ready replicas
    const reserved = props.basis === 'total' && r.request_total > 0 ? r.request_total : r.request * times.value;
    const known = reserved > 0;
    const left = reserved - used;
    const rate = known ? used / reserved : null;
    // the share of the Requests the P95 takes is judged by the band of the P95: under it is more than needed, over it is too little
    const band = props.detail?.params?.p95 ?? { low: 0.8, high: 0.9 };
    const noRequest = whyMissing(resource === 'cpu' ? 'k8s_cpu_requests' : 'k8s_mem_requests') || p('noRequestFigure');
    cards.push({
      key: `${resource}Used`,
      label: `${name} ${p('usedP95')}`,
      help: p('usedHelp'),
      value: fmt(resource, used),
      level: 'info'
    });
    cards.push({
      key: `${resource}Left`,
      label: `${name} ${p('available')}`,
      help: p('availableHelp'),
      value: known ? fmt(resource, Math.max(left, 0)) : '-',
      sub: !known ? noRequest : left < 0 ? p('belowUse') : undefined,
      level: !known ? 'neutral' : left < 0 ? 'danger' : 'good'
    });
    cards.push({
      key: `${resource}Rate`,
      label: `${name} ${p('utilization')}`,
      help: p('utilizationHelp'),
      value: rateText(rate),
      sub: known ? undefined : noRequest,
      level: rate === null ? 'neutral' : rate > band.high ? 'danger' : rate < band.low ? 'warn' : 'good'
    });
  }
  return cards;
});

// ---- the table of the Requests and Limits: what they are now (Prometheus), and what the use supports for one Pod and for all the replicas

interface RecRow {
  key: string;
  label: string;
  resource: Res;
  /** one Pod: the figure now (0 = none) and the figure the use supports (0 = none) */
  current: number;
  recommended: number;
  /** the figure now of all the Pods together as Prometheus has it (0 = not known), and how many Pods the total is of */
  currentTotal: number;
  pods: number;
  /** the verdict of the analysis, for a Requests row (a Limits row has none of its own) */
  status: Api.Overprovision.Status | null;
  /** why there is no current figure, or no recommendation */
  whyNoCurrent?: string;
  whyNoRecommended?: string;
}
const replicas = computed(() => Math.max(props.detail?.replicas ?? 0, 0));
const recRows = computed<RecRow[]>(() => {
  const rows: RecRow[] = [];
  for (const resource of ['cpu', 'memory'] as Res[]) {
    const r = rec.value?.[resource];
    if (!r) continue;
    const none =
      r.suggested > 0 ? undefined : r.reasons.map(reason => p(`reason_${reason}`)).join(' ') || p('suggestedNone');
    rows.push({
      key: `${resource}-req`,
      label: resource === 'cpu' ? p('cpuRequests') : p('memRequests'),
      resource,
      current: r.request,
      recommended: r.suggested,
      currentTotal: r.request_total ?? 0,
      pods: podsOf(r.request, r.request_total, replicas.value),
      status: r.status,
      whyNoCurrent:
        r.request > 0 ? undefined : whyMissing(resource === 'cpu' ? 'k8s_cpu_requests' : 'k8s_mem_requests'),
      whyNoRecommended: none
    });
    rows.push({
      key: `${resource}-lim`,
      label: resource === 'cpu' ? p('cpuLimits') : p('memLimits'),
      resource,
      current: r.limit,
      recommended: r.suggested_limit,
      currentTotal: r.limit_total ?? 0,
      pods: podsOf(r.limit, r.limit_total, replicas.value),
      status: null,
      whyNoCurrent: r.limit > 0 ? undefined : whyMissing(resource === 'cpu' ? 'k8s_cpu_limits' : 'k8s_mem_limits'),
      whyNoRecommended: none
    });
  }
  return rows;
});
/** with no recommendation at all (too little data) the table is the figures now and their total, nothing more */
const hasRecommendation = computed(() => recRows.value.some(row => row.recommended > 0));
/** the figures are the ones of the spec and of the platform, as they are: the Requests of 4 cores is "4 cores", never "5" */
const cellNow = (row: RecRow) => amountText(row.resource, row.current);
const cellNowTotal = (row: RecRow) => allText(row.resource, row.current, row.currentTotal, replicas.value);
const cellRec = (row: RecRow) => amountText(row.resource, row.recommended);
const cellRecTotal = (row: RecRow) => totalText(row.resource, row.recommended, row.pods);

/** how the figure now stands against the recommended one: how much of it is more (or less) than the use needs, and the share of the figure that is */
interface AdjustCell {
  text: string;
  type: 'default' | 'success' | 'warning' | 'error' | 'info';
}
function cellAdjust(row: RecRow): AdjustCell {
  const a = adjustmentOf(row.current, row.recommended);
  if (!a) return { text: '-', type: 'default' };
  const amount = adjustmentText(row.resource, a);
  if (row.status === 'limited') return { text: p('adjLimited'), type: 'info' };
  if (a.direction === 'same') return { text: p('adjSame'), type: 'success' };
  if (row.status === null)
    return a.direction === 'over'
      ? { text: p('adjLimitsLower', { amount }), type: 'default' }
      : { text: p('adjLimitsRaise', { amount }), type: 'default' };
  if (row.status === 'ok')
    return a.direction === 'over'
      ? { text: p('adjOkCouldGive', { amount }), type: 'success' }
      : { text: p('adjOkAbove', { amount }), type: 'success' };
  return a.direction === 'over'
    ? { text: p('adjOver', { amount }), type: 'warning' }
    : { text: p('adjUnder', { amount }), type: 'error' };
}

/** where the P90, the P95 and the P99 of the use stand against the Requests, with the range that is reasonable for each: the figures the verdict is made of */
const shareLines = computed(() => {
  const params = props.detail?.params;
  return recResults.value
    .filter(item => item.result.shares)
    .map(item => {
      const sh = item.result.shares as Api.Overprovision.Usage;
      const range = (b?: Api.Overprovision.Band) =>
        b ? `${formatDecimal(b.low * 100, 0)}%–${formatDecimal(b.high * 100, 0)}%` : '-';
      return {
        key: item.resource,
        text: p('shareLine', {
          name: resName(item.resource),
          p90: shareText(sh.p90),
          p95: shareText(sh.p95),
          p99: shareText(sh.p99),
          r90: range(params?.p90),
          r95: range(params?.p95),
          r99: range(params?.p99)
        })
      };
    });
});

// ---- the quantiles, with the samples they are made of

interface QRow {
  key: string;
  label: string;
  resource: string;
  u: Api.Overprovision.Usage;
  expected: number;
  /** the request and the limit of what the row is about (one Pod, or all the replicas), from Prometheus; 0 when there is none */
  request: number;
  limit: number;
}
const quantileRows = computed<QRow[]>(() =>
  results.value.flatMap(({ resource, result: r }) => {
    const rows: QRow[] = [];
    rows.push({
      key: `${resource}-pod`,
      label: `${resName(resource)} · ${p('podUsage')}`,
      resource,
      u: r.usage,
      expected: r.expected_points,
      request: r.request,
      limit: r.limit
    });
    if (r.total)
      rows.push({
        key: `${resource}-all`,
        label: `${resName(resource)} · ${p('totalUsage')}`,
        resource,
        u: r.total,
        expected: r.expected_points,
        request: r.request_total > 0 ? r.request_total : r.request * Math.max(props.detail?.replicas ?? 1, 1),
        limit: r.limit_total > 0 ? r.limit_total : r.limit * Math.max(props.detail?.replicas ?? 1, 1)
      });
    return rows;
  })
);
const step = computed(() => props.detail?.queries.find(query => query.step)?.step ?? '');

// ---- the charts: one for each thing the module has set up (its CPU and memory, the heap of its JVM, the metrics of its own ...), and none for what it has not

const podQuantiles = (resource: Res) => {
  const r = win.value?.[resource];
  return r ? { p90: r.usage.p90, p95: r.usage.p95, p99: r.usage.p99 } : null;
};
const totalQuantiles = (resource: Res) => {
  const r = win.value?.[resource];
  return r?.total ? { p90: r.total.p90, p95: r.total.p95, p99: r.total.p99 } : null;
};
const COLORS = {
  usage: '#2080f0',
  request: '#d03050',
  suggested: '#18a058',
  limit: '#f0a020',
  p90: '#8e44ad',
  p95: '#00a3a3',
  p99: '#8d5524'
};
const unitOfResource = (resource: Res) => (resource === 'memory' ? 'bytes' : 'cores');

/** the use of the CPU or the memory of one Pod (or of all the replicas) with the Requests, the recommended Requests, the Limits and the quantiles drawn over it */
function usageChart(chart: Api.Overprovision.Chart, mode: 'pod' | 'total'): ChartSpec {
  const resource = chart.resource;
  const total = mode === 'total';
  const unit = unitOfResource(resource);
  const result = rec.value?.[resource] ?? win.value?.[resource];
  // all the replicas together are the Pods Prometheus summed, not always the ready replicas
  const pods = total
    ? Math.max(result ? podsOf(result.request, result.request_total, chart.replicas) : chart.replicas, 1)
    : 1;
  const figure = (value: number) => (resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2));
  const limit = (win.value?.[resource]?.limit ?? 0) * pods;
  const q = total ? totalQuantiles(resource) : podQuantiles(resource);
  const refs = [
    { name: 'Requests', value: chart.request * pods, color: COLORS.request },
    { name: p('chartSuggested'), value: chart.suggested * pods, color: COLORS.suggested },
    { name: 'Limits', value: limit, color: COLORS.limit },
    ...(q
      ? [
          { name: 'P90', value: q.p90, color: COLORS.p90, style: 'dotted' as const },
          { name: 'P95', value: q.p95, color: COLORS.p95, style: 'dotted' as const },
          { name: 'P99', value: q.p99, color: COLORS.p99, style: 'dotted' as const }
        ]
      : [])
  ];
  const figures: string[] = [];
  if (chart.request > 0) figures.push(`Requests ${figure(chart.request * pods)}`);
  if (chart.suggested > 0) figures.push(`${p('chartSuggested')} ${figure(chart.suggested * pods)}`);
  if (limit > 0) figures.push(`Limits ${figure(limit)}`);
  if (q) figures.push(`P90 ${figure(q.p90)} · P95 ${figure(q.p95)} · P99 ${figure(q.p99)}`);
  return {
    key: `${mode}:${resource}`,
    title: `${resName(resource)} · ${total ? p('totalUsage') : p('podUsage')}`,
    unit,
    lines: [
      {
        name: total ? p('chartTotalUsage') : p('chartUsage'),
        ts: total ? (chart.total_ts ?? []) : chart.ts,
        value: total ? (chart.total ?? []) : chart.value,
        color: COLORS.usage
      }
    ],
    refs,
    figures: figures.join('  |  ')
  };
}

/** the family of a metric that is drawn together with others: the heap used, committed and maximum of the JVM are one chart, the non-heap ones another; any other metric is a chart of its own */
function familyOf(m: Api.Overprovision.MetricStat): { key: string; title: string } {
  const heap = /^jvm_(heap|nonheap)_(used|committed|max)$/.exec(m.kind);
  if (heap) return { key: `jvm_${heap[1]}`, title: heap[1] === 'heap' ? p('jvmHeapChart') : p('jvmNonHeapChart') };
  return { key: m.key, title: m.name };
}
const unitOfMetric = (m: Api.Overprovision.MetricStat) => {
  const unit = (m.unit || '').toLowerCase();
  return unit === 'cores' || unit === 'bytes' || unit === 'seconds' ? unit : '';
};
const GROUP_ORDER = ['container', 'jvm', 'throttle', 'oom', 'other'];
const metricChartSpecs = computed<ChartSpec[]>(() => {
  const families = new Map<string, ChartSpec>();
  const metrics = [...(props.detail?.metrics ?? [])].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
  );
  for (const m of metrics) {
    if (!m.ts || m.ts.length < 2) continue;
    const family = familyOf(m);
    let spec = families.get(family.key);
    if (!spec) {
      spec = { key: `metric:${family.key}`, title: family.title, unit: unitOfMetric(m), lines: [], refs: [] };
      families.set(family.key, spec);
    }
    spec.lines.push({ name: m.name, ts: m.ts, value: m.value ?? [] });
  }
  return [...families.values()];
});

const chartSpecs = computed<ChartSpec[]>(() => {
  const charts = props.detail?.charts ?? [];
  const out: ChartSpec[] = charts.map(chart => usageChart(chart, 'pod'));
  for (const chart of charts) if ((chart.total ?? []).length > 0) out.push(usageChart(chart, 'total'));
  return [...out, ...metricChartSpecs.value];
});

// ---- the other metrics the module has set up (the OOM kills are the line at the top, not a metric)

const GROUPS = ['container', 'jvm', 'throttle', 'other'] as const;
const metricGroups = computed(() =>
  GROUPS.map(group => ({
    group,
    items: (props.detail?.metrics ?? []).filter(m => m.group === group)
  })).filter(g => g.items.length)
);
function metricValue(m: Api.Overprovision.MetricStat, value: number) {
  switch (m.unit.toLowerCase()) {
    case 'bytes':
      return formatBytes(value, 2);
    case 'cores':
      return formatCores(value, 2);
    case 'seconds':
      return `${formatDecimal(value, 3)} s`;
    default:
      return formatDecimal(value, 3);
  }
}
function metricCards(items: Api.Overprovision.MetricStat[], group: string): WallCard[] {
  return items.map(m => ({
    key: m.key,
    label: m.display ? `${m.name} · ${p('displayOnly')}` : m.name,
    value: m.points ? metricValue(m, m.latest) : '-',
    sub: m.points
      ? `P90 ${metricValue(m, m.p90)} · P95 ${metricValue(m, m.p95)} · P99 ${metricValue(m, m.p99)}`
      : p('metricEmpty'),
    level: !m.points ? 'neutral' : group === 'jvm' ? 'info' : group === 'throttle' && m.latest > 0 ? 'warn' : 'neutral'
  }));
}

// ---- the PromQL that was sent, in the form of Prometheus' own expression browser

/** the name of a metric kind as the metric templates page calls it */
const kindName = (kind: string) => t(`page.datasource.mappings.metric_${kind}` as any, kind);
const promItems = computed<PromqlItem[]>(() =>
  (props.detail?.queries ?? [])
    .filter(q => q.query || q.error)
    .map(q => ({
      name: `${q.name} · ${kindName(q.kind)}${q.display ? ` · ${p('displayOnly')}` : ''}`,
      query: q.query || '-',
      value:
        [
          q.points ? `${p('queryPoints', { step: q.step, n: q.points })}${q.per ? ` · ${p(`per_${q.per}`)}` : ''}` : '',
          q.note ? `⚠ ${q.note}` : ''
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      error: q.error
    }))
);
const skipped = computed(() => props.detail?.skipped ?? 0);
const failed = computed(() => (props.detail?.queries ?? []).filter(q => q.error && !q.skipped).length);
</script>

<template>
  <!-- the first read of a module: a skeleton of the page and what is being read, not a lone spinner in an empty page; a reload keeps the figures and spins over them -->
  <div v-if="loading && !detail" class="loading-state flex-col gap-14px pb-8px">
    <div class="flex items-center gap-8px text-13px opacity-80">
      <NSpin :size="16" />
      {{ p('loadingDetail') }}
    </div>
    <NSkeleton text style="width: 38%" />
    <div class="skeleton-cards">
      <NSkeleton v-for="n in 4" :key="n" :height="84" :sharp="false" />
    </div>
    <NSkeleton :height="150" :sharp="false" />
    <NSkeleton :height="220" :sharp="false" />
  </div>
  <NSpin v-else :show="loading">
    <div v-if="detail" class="min-w-0 flex-col gap-12px pb-8px">
      <div class="flex flex-wrap items-center gap-x-12px gap-y-4px text-13px">
        <span class="text-16px font-medium">{{ detail.name }}</span>
        <span class="opacity-70">{{ detail.namespace }}/{{ detail.workload_kind }}/{{ detail.workload }}</span>
        <NTag size="small" :bordered="false" type="success">
          Prometheus{{ detail.datasource?.name ? ` · ${detail.datasource.name}` : '' }}
        </NTag>
        <span class="opacity-70">
          {{ p('configWindow') }} {{ win?.label === 'custom' ? p('customRange') : win?.label }} · {{ p('configAt') }}
          {{ formatDateTime(detail.at) }}
        </span>
        <template v-for="item in recResults" :key="item.resource">
          <NTag size="small" :bordered="false" :type="statusType[item.result.status]">
            {{ resName(item.resource) }}
            {{ item.result.status === 'over' ? p(`grade_${item.result.grade}`) : p(`health_${item.result.status}`) }}
          </NTag>
        </template>
        <span class="opacity-70">{{ p('recPeriod', { period: recLabel }) }}</span>
      </div>

      <div v-if="skipped" class="flex flex-wrap items-center gap-8px text-12px">
        <NTag size="small" :bordered="false" type="warning">{{ p('promPartial', { n: skipped }) }}</NTag>
        <NButton size="tiny" quaternary @click="emit('retry')">{{ p('retry') }}</NButton>
      </div>
      <div v-else-if="failed" class="text-12px opacity-80">{{ p('queriesFailed', { n: failed }) }}</div>

      <div v-if="!results.length" class="text-13px opacity-70">{{ p('noData') }}</div>

      <!-- Requests and Limits: now, and what the use supports for one Pod and for all the replicas -->
      <div v-if="recRows.length" class="flex-col gap-4px">
        <HelpLabel :label="p('recTitle')" :help="p('recHelp')" class="text-13px font-medium" />
        <div class="table-scroll">
          <NTable size="small" :bordered="true" :single-line="false" class="rec text-12px">
            <thead>
              <tr>
                <th>{{ p('colItem') }}</th>
                <th>{{ p('colNowPod') }}</th>
                <th>{{ p('colNowTotal') }}</th>
                <template v-if="hasRecommendation">
                  <th class="key">{{ p('colRecPod') }}</th>
                  <th class="key">{{ p('colRecTotal') }}</th>
                  <th><HelpLabel :label="p('colAdjust')" :help="p('colAdjustHelp')" /></th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in recRows" :key="row.key">
                <td class="font-medium">{{ row.label }}</td>
                <td :title="row.current > 0 ? p('fromPrometheus') : row.whyNoCurrent">
                  <span :class="{ 'opacity-60': row.current <= 0 }">{{ cellNow(row) }}</span>
                </td>
                <td :title="row.current > 0 && replicas <= 0 ? p('noReplicas') : row.whyNoCurrent">
                  <span :class="{ 'opacity-60': cellNowTotal(row) === '-' }">{{ cellNowTotal(row) }}</span>
                </td>
                <template v-if="hasRecommendation">
                  <td class="key" :title="row.recommended > 0 ? undefined : row.whyNoRecommended">
                    <span :class="{ 'opacity-60': cellRec(row) === '-' }">{{ cellRec(row) }}</span>
                  </td>
                  <td
                    class="key"
                    :title="row.recommended > 0 && replicas <= 0 ? p('noReplicas') : row.whyNoRecommended"
                  >
                    <span :class="{ 'opacity-60': cellRecTotal(row) === '-' }">{{ cellRecTotal(row) }}</span>
                  </td>
                  <td :title="row.recommended > 0 ? undefined : row.whyNoRecommended">
                    <NTag size="small" :bordered="false" :type="cellAdjust(row).type">{{ cellAdjust(row).text }}</NTag>
                  </td>
                </template>
              </tr>
            </tbody>
          </NTable>
        </div>
        <div v-for="line in shareLines" :key="line.key" class="text-12px opacity-75">{{ line.text }}</div>
      </div>

      <OverprovisionCardWall v-if="wall.length" :cards="wall" />

      <div v-if="quantileRows.length" class="table-scroll">
        <NTable size="small" :bordered="true" :single-line="false" class="quantiles text-12px">
          <thead>
            <tr>
              <th></th>
              <th><HelpLabel label="Requests" :help="p('requestsHelp')" /></th>
              <th><HelpLabel label="Limits" :help="p('limitsHelp')" /></th>
              <th><HelpLabel label="P50" :help="p('statP50')" /></th>
              <th class="key"><HelpLabel label="P90" :help="p('statP90')" /></th>
              <th class="key"><HelpLabel label="P95" :help="p('statP95')" /></th>
              <th class="key"><HelpLabel label="P99" :help="p('statP99')" /></th>
              <th><HelpLabel label="Max" :help="p('statMax')" /></th>
              <th><HelpLabel :label="p('points')" :help="p('pointsHelp', { step: step || '-' })" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in quantileRows" :key="row.key">
              <td>{{ row.label }}</td>
              <td
                :title="
                  row.request > 0
                    ? p('fromPrometheus')
                    : whyMissing(row.resource === 'cpu' ? 'k8s_cpu_requests' : 'k8s_mem_requests')
                "
              >
                {{ row.request > 0 ? fmt(row.resource, row.request) : '-' }}
              </td>
              <td
                :title="
                  row.limit > 0
                    ? p('fromPrometheus')
                    : whyMissing(row.resource === 'cpu' ? 'k8s_cpu_limits' : 'k8s_mem_limits')
                "
              >
                {{ row.limit > 0 ? fmt(row.resource, row.limit) : '-' }}
              </td>
              <td>{{ fmt(row.resource, row.u.p50) }}</td>
              <td class="key">{{ fmt(row.resource, row.u.p90) }}</td>
              <td class="key">{{ fmt(row.resource, row.u.p95) }}</td>
              <td class="key">{{ fmt(row.resource, row.u.p99) }}</td>
              <td>{{ fmt(row.resource, row.u.max) }}</td>
              <td>{{ row.u.points }} / {{ row.expected }}</td>
            </tr>
          </tbody>
        </NTable>
      </div>

      <!-- one chart for each thing the module has set up, two to a row; a row that has one chart takes the whole width -->
      <div v-if="chartSpecs.length" class="chart-grid">
        <div v-for="spec in chartSpecs" :key="spec.key" class="chart-cell">
          <OverprovisionLineChart :spec="spec" />
        </div>
      </div>

      <NCollapse v-if="results.length || promItems.length" arrow-placement="right">
        <NCollapseItem v-if="promItems.length" :title="p('promQueries')" name="promql">
          <PromqlList :items="promItems" />
        </NCollapseItem>
        <NCollapseItem v-if="recResults.length" :title="p('reasons')" name="reasons">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-12px text-12px">
            <div v-for="item in recResults" :key="item.resource" class="flex-col gap-4px">
              <div class="flex flex-wrap items-center gap-6px">
                <span class="font-medium">{{ resName(item.resource) }}</span>
                <NTag size="tiny" :bordered="false" :type="levelType[item.result.confidence]">
                  {{ p('colConfidence') }} {{ p(`level_${item.result.confidence}`) }}
                </NTag>
                <NTag size="tiny" :bordered="false" :type="riskType[item.result.risk]">
                  {{ p('colRisk') }} {{ p(`level_${item.result.risk}`) }}
                </NTag>
                <span class="opacity-70">{{ p('configCoverage') }} {{ formatPercent(item.result.coverage, 0) }}</span>
                <span v-if="item.resource === 'cpu' && item.result.throttle > 0" class="opacity-70">
                  {{ p('throttle') }} {{ formatPercent(item.result.throttle, 1) }}
                </span>
              </div>
              <ul class="m-0 pl-18px leading-20px">
                <li v-for="reason in item.result.reasons" :key="reason">{{ p(`reason_${reason}`) }}</li>
                <li v-if="!item.result.reasons.length">-</li>
              </ul>
              <code v-if="item.result.formula" class="break-all opacity-80">{{ item.result.formula }}</code>
            </div>
          </div>
        </NCollapseItem>
      </NCollapse>

      <div v-for="group in metricGroups" :key="group.group" class="flex-col gap-4px">
        <div class="flex items-center gap-6px text-12px opacity-80">
          <NTag size="tiny" :bordered="false" type="info">{{ p(`group_${group.group}`) }}</NTag>
          <HelpLabel v-if="group.group === 'jvm'" :label="p('sectionJvm')" :help="p('jvmHelp')" />
        </div>
        <OverprovisionCardWall :cards="metricCards(group.items, group.group)" :min-width="200" />
        <ul v-if="group.group === 'jvm' && detail.jvm?.hints.length" class="m-0 pl-18px text-12px leading-20px">
          <li v-for="hint in detail.jvm.hints" :key="hint">{{ p(`hint_${hint}`) }}</li>
        </ul>
      </div>
    </div>
    <div v-else-if="!loading" class="text-13px opacity-80">
      {{ error || p('noData') }}
      <NButton v-if="error" size="tiny" quaternary @click="emit('retry')">{{ p('retry') }}</NButton>
    </div>
  </NSpin>
</template>

<style scoped>
/* the charts are two to a row: the one that is left alone in its row takes the whole of it, so there is no empty place */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.chart-cell {
  min-width: 0;
}

.chart-cell:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

@media (max-width: 1100px) {
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.skeleton-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.quantiles :deep(th.key),
.quantiles :deep(td.key),
.rec :deep(th.key),
.rec :deep(td.key) {
  font-weight: 600;
}

/* a table wider than the page scrolls in its own box, it does not push the page sideways */
.table-scroll {
  max-width: 100%;
  overflow-x: auto;
}
</style>
