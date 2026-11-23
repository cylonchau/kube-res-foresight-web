<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCollapse, NCollapseItem, NSpin, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import OverprovisionCardWall, { type WallCard } from '@/components/business/overprovision-card-wall.vue';
import OverprovisionUsageChart from '@/components/business/overprovision-usage-chart.vue';
import PromqlList, { type PromqlItem } from '@/components/business/promql-list.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { amountText, wholeAmount, wholeText } from '@/utils/amount';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatDecimal, formatPercent } from '@/utils/format';

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
    const reserved = r.request * times.value;
    const known = reserved > 0;
    const left = reserved - used;
    const rate = known ? used / reserved : null;
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
      level: rate === null ? 'neutral' : rate >= 0.95 ? 'danger' : rate >= 0.85 ? 'warn' : rate < 0.3 ? 'warn' : 'good'
    });
  }
  return cards;
});

// ---- the table of the Requests and Limits: what they are now (Prometheus), and what the use supports for one Pod and for all the replicas

interface RecRow {
  key: string;
  label: string;
  /** what the figure is: the Requests are what is reserved for the Pod, the Limits are the most it may use */
  tag: 'reserved' | 'limit';
  resource: Res;
  /** one Pod: the figure now (0 = none) and the figure the use supports (0 = none) */
  current: number;
  recommended: number;
  /** why there is no current figure, or no recommendation */
  whyNoCurrent?: string;
  whyNoRecommended?: string;
}
const replicas = computed(() => Math.max(props.detail?.replicas ?? 0, 0));
const recRows = computed<RecRow[]>(() => {
  const rows: RecRow[] = [];
  for (const resource of ['cpu', 'memory'] as Res[]) {
    const r = win.value?.[resource];
    if (!r) continue;
    const none =
      r.suggested > 0 ? undefined : r.reasons.map(reason => p(`reason_${reason}`)).join(' ') || p('suggestedNone');
    rows.push({
      key: `${resource}-req`,
      label: resource === 'cpu' ? p('cpuRequests') : p('memRequests'),
      tag: 'reserved',
      resource,
      current: r.request,
      recommended: r.suggested,
      whyNoCurrent:
        r.request > 0 ? undefined : whyMissing(resource === 'cpu' ? 'k8s_cpu_requests' : 'k8s_mem_requests'),
      whyNoRecommended: none
    });
    rows.push({
      key: `${resource}-lim`,
      label: resource === 'cpu' ? p('cpuLimits') : p('memLimits'),
      tag: 'limit',
      resource,
      current: r.limit,
      recommended: r.suggested_limit,
      whyNoCurrent: r.limit > 0 ? undefined : whyMissing(resource === 'cpu' ? 'k8s_cpu_limits' : 'k8s_mem_limits'),
      whyNoRecommended: none
    });
  }
  return rows;
});
/** with no recommendation at all (too little data) the table is the figures now and their total, nothing more */
const hasRecommendation = computed(() => recRows.value.some(row => row.recommended > 0));
/** the figures are whole numbers; a recommendation is rounded up, so it is never less than the use needs, and its total is the whole figure of one Pod times the replicas */
const cellNow = (row: RecRow) => (row.current > 0 ? wholeText(row.resource, row.current) : '-');
const cellNowTotal = (row: RecRow) =>
  row.current > 0 && replicas.value > 0 ? wholeText(row.resource, row.current * replicas.value) : '-';
const recPod = (row: RecRow) => (row.recommended > 0 ? wholeAmount(row.resource, row.recommended, 'up') : 0);
const cellRec = (row: RecRow) => (recPod(row) > 0 ? amountText(row.resource, recPod(row)) : '-');
const cellRecTotal = (row: RecRow) =>
  recPod(row) > 0 && replicas.value > 0 ? amountText(row.resource, recPod(row) * replicas.value) : '-';

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
        request: r.request * Math.max(props.detail?.replicas ?? 1, 1),
        limit: r.limit * Math.max(props.detail?.replicas ?? 1, 1)
      });
    return rows;
  })
);
const step = computed(() => props.detail?.queries.find(query => query.step)?.step ?? '');

// ---- the charts: the quantiles and the limits of one Pod and of all the replicas, drawn with the use

const podLimits = computed(() => ({
  cpu: win.value?.cpu?.limit ?? 0,
  memory: win.value?.memory?.limit ?? 0
}));
const podQuantiles = computed(() => {
  const out: Partial<Record<Res, { p90: number; p95: number; p99: number }>> = {};
  for (const { resource, result: r } of results.value)
    out[resource] = { p90: r.usage.p90, p95: r.usage.p95, p99: r.usage.p99 };
  return out;
});
const totalQuantiles = computed(() => {
  const out: Partial<Record<Res, { p90: number; p95: number; p99: number }>> = {};
  for (const { resource, result: r } of results.value)
    if (r.total) out[resource] = { p90: r.total.p90, p95: r.total.p95, p99: r.total.p99 };
  return out;
});
const hasTotal = computed(() => (props.detail?.charts ?? []).some(chart => (chart.total ?? []).length > 0));

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
  <NSpin :show="loading">
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
        <template v-for="item in results" :key="item.resource">
          <NTag size="small" :bordered="false" :type="statusType[item.result.status]">
            {{ resName(item.resource) }}
            {{ item.result.status === 'over' ? p(`grade_${item.result.grade}`) : p(`health_${item.result.status}`) }}
          </NTag>
        </template>
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
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in recRows" :key="row.key">
                <td class="font-medium">
                  {{ row.label }}
                  <span class="font-normal opacity-60">
                    （{{ p(row.tag === 'reserved' ? 'tagReserved' : 'tagLimit') }}）
                  </span>
                </td>
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
                </template>
              </tr>
            </tbody>
          </NTable>
        </div>
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

      <!-- the use of one Pod, CPU and memory in one chart -->
      <div v-if="results.length" class="flex-col gap-4px">
        <HelpLabel :label="p('chartPodTitle')" :help="p('chartPodHelp')" class="text-13px font-medium" />
        <OverprovisionUsageChart
          mode="pod"
          :charts="detail.charts ?? []"
          :limits="podLimits"
          :quantiles="podQuantiles"
        />
      </div>

      <!-- the use of all the replicas together -->
      <div v-if="results.length && hasTotal" class="flex-col gap-4px">
        <HelpLabel :label="p('chartTotalTitle')" :help="p('chartTotalHelp')" class="text-13px font-medium" />
        <OverprovisionUsageChart
          mode="total"
          :charts="detail.charts ?? []"
          :limits="podLimits"
          :quantiles="totalQuantiles"
        />
      </div>

      <NCollapse v-if="results.length || promItems.length" arrow-placement="right">
        <NCollapseItem v-if="promItems.length" :title="p('promQueries')" name="promql">
          <PromqlList :items="promItems" />
        </NCollapseItem>
        <NCollapseItem v-if="results.length" :title="p('reasons')" name="reasons">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-12px text-12px">
            <div v-for="item in results" :key="item.resource" class="flex-col gap-4px">
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
