<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCollapse, NCollapseItem, NSpin, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import OverprovisionClusterCard from '@/components/business/overprovision-cluster-card.vue';
import OverprovisionOomCards from '@/components/business/overprovision-oom-cards.vue';
import OverprovisionUsageChart from '@/components/business/overprovision-usage-chart.vue';
import PromqlList, { type PromqlItem } from '@/components/business/promql-list.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatDecimal, formatPercent } from '@/utils/format';

defineOptions({ name: 'OverprovisionModulePanel' });

/**
 * The analysis of one module, in small tiles and two charts: first what it says about running out of memory (the OOM cards), then what it is configured with
 * (requests, limits), what it uses (P50, P90, P95, P99, the maximum) and what is left, the use of one Pod and of all the replicas over the window with the results
 * the analysis stored over time on the same chart, the metrics the module has set up (container, JVM, throttling, OOM: only those), and the cluster it runs in.
 * Everything is of the module chosen on the page; the AI analysis is the helper at the lower right of the page.
 */
interface Props {
  detail: Api.Overprovision.Detail | null;
  loading: boolean;
  /** pod: the request and the use of one Pod; total: all the replicas together */
  basis: 'pod' | 'total';
  /** the quantiles as the Prometheus data source computed them now; null while they are asked or when it did not answer */
  prom: Api.Overprovision.PromStats | null;
  promLoading: boolean;
  promError: string;
  /** the Grafana link of the cluster, when there is one */
  grafanaCluster?: string | null;
}
const props = withDefaults(defineProps<Props>(), { grafanaCluster: null });
const emit = defineEmits<{ retryProm: [] }>();
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

interface Tile {
  key: string;
  label: string;
  help?: string;
  value: string;
  sub?: string;
  tone?: 'bad' | 'good' | 'warn';
}

/** requests and limits: the four figures of the configuration, and the replicas */
const configTiles = computed<Tile[]>(() => {
  const d = props.detail;
  if (!d) return [];
  const tiles: Tile[] = [];
  const request = (resource: Res) => {
    const r = win.value?.[resource];
    return r && r.request > 0 ? fmt(resource, r.request * times.value) : '-';
  };
  const limit = (resource: Res) => {
    const r = win.value?.[resource];
    if (!r || !(r.limit > 0)) return { value: p('limitUnknown'), sub: undefined };
    return {
      value: fmt(resource, r.limit * times.value),
      sub:
        r.limit_from === 'module' ? p('limitFromModule') : r.limit_from === 'metric' ? p('limitFromMetric') : undefined
    };
  };
  tiles.push({ key: 'cpuReq', label: p('cpuRequests'), help: p('requestsHelp'), value: request('cpu') });
  tiles.push({ key: 'cpuLim', label: p('cpuLimits'), help: p('limitsHelp'), ...limit('cpu') });
  tiles.push({ key: 'memReq', label: p('memRequests'), help: p('requestsHelp'), value: request('memory') });
  tiles.push({ key: 'memLim', label: p('memLimits'), help: p('limitsHelp'), ...limit('memory') });
  tiles.push({ key: 'replicas', label: p('configReplicas'), value: d.replicas ? String(d.replicas) : '-' });
  return tiles;
});

/** the quantiles of every resource, of one Pod and of all the replicas: the P90, the P95 and the P99 are always there */
interface QRow {
  key: string;
  label: string;
  resource: string;
  u: { p50: number; p90: number; p95: number; p99: number; max: number; points?: number };
}
const promMetric = (kind: string) => props.prom?.metrics.find(m => m.kind === kind && !m.error) ?? null;
/** the quantiles Prometheus answered for the CPU or the memory of the module, or null */
function promQuantiles(resource: string) {
  const m = promMetric(resource);
  return m && (m.pod || m.total) ? { pod: m.pod, total: m.total } : null;
}
const quantilesFromPrometheus = computed(() => results.value.some(item => promQuantiles(item.resource)));
const quantileRows = computed<QRow[]>(() =>
  results.value.flatMap(({ resource, result: r }) => {
    const live = promQuantiles(resource);
    const rows: QRow[] = [];
    const pod = live ? live.pod : r.usage;
    const total = live ? live.total : r.total;
    if (pod) rows.push({ key: `${resource}-pod`, label: `${resName(resource)} · ${p('podUsage')}`, resource, u: pod });
    if (total)
      rows.push({ key: `${resource}-all`, label: `${resName(resource)} · ${p('totalUsage')}`, resource, u: total });
    return rows;
  })
);

/** what is used, what is left of the request, how much of it is used, and what the use supports */
const useTiles = computed<Tile[]>(() => {
  const tiles: Tile[] = [];
  for (const { resource, result: r } of results.value) {
    const name = resName(resource);
    const live = promQuantiles(resource);
    const stored = props.basis === 'total' && r.total ? r.total.p95 : r.usage.p95;
    const used = live
      ? ((props.basis === 'total' ? (live.total ?? live.pod)?.p95 : (live.pod ?? live.total)?.p95) ?? stored)
      : stored;
    const request = r.request * times.value;
    const left = request - used;
    tiles.push({
      key: `${resource}Used`,
      label: `${name} ${p('usedP95')}`,
      help: p('usedHelp'),
      value: fmt(resource, used)
    });
    tiles.push({
      key: `${resource}Left`,
      label: `${name} ${p('available')}`,
      help: p('availableHelp'),
      value: request > 0 ? fmt(resource, Math.max(left, 0)) : '-',
      sub: left < 0 ? p('belowUse') : undefined,
      tone: left < 0 ? 'bad' : undefined
    });
    tiles.push({
      key: `${resource}Rate`,
      label: `${name} ${p('utilization')}`,
      help: p('utilizationHelp'),
      value: request > 0 ? formatPercent(used / request, 0) : '-',
      tone: request > 0 && used / request > 0.85 ? 'warn' : undefined
    });
    tiles.push({
      key: `${resource}Sug`,
      label: `${name} ${p('suggested')}`,
      value: r.suggested > 0 ? fmt(resource, r.suggested * times.value) : p('suggestedNone'),
      sub: r.suggested > 0 ? `${p('ratioLabel')} ${formatPercent(r.ratio, 0)}` : undefined,
      tone: r.suggested > 0 && r.ratio >= 0.3 ? 'warn' : undefined
    });
  }
  return tiles;
});

// ---- the charts: the quantiles and the limits of one Pod and of all the replicas, drawn with the use

const podLimits = computed(() => ({
  cpu: win.value?.cpu?.limit ?? 0,
  memory: win.value?.memory?.limit ?? 0
}));
/** the P90, P95 and P99 of one Pod: Prometheus' when it answered, the stored samples' when not */
const podQuantiles = computed(() => {
  const out: Partial<Record<Res, { p90: number; p95: number; p99: number }>> = {};
  for (const { resource, result: r } of results.value) {
    const q = promQuantiles(resource)?.pod ?? r.usage;
    out[resource] = { p90: q.p90, p95: q.p95, p99: q.p99 };
  }
  return out;
});
/** the same of all the replicas together */
const totalQuantiles = computed(() => {
  const out: Partial<Record<Res, { p90: number; p95: number; p99: number }>> = {};
  for (const { resource, result: r } of results.value) {
    const q = promQuantiles(resource)?.total ?? r.total;
    if (q) out[resource] = { p90: q.p90, p95: q.p95, p99: q.p99 };
  }
  return out;
});
const hasTotal = computed(() => (props.detail?.charts ?? []).some(chart => (chart.total ?? []).length > 0));

// ---- the other metrics the module has set up

const GROUPS = ['container', 'jvm', 'throttle', 'oom', 'other'] as const;
/** the other metrics with their quantiles from Prometheus when it answered, from the stored samples when not (the latest value is the stored one) */
const metricItems = computed(() =>
  (props.detail?.metrics ?? []).map(m => {
    const live = props.prom?.metrics.find(item => item.key === m.key && !item.error);
    const q = live ? (live.pod ?? live.total) : undefined;
    return q
      ? { ...m, p90: q.p90, p95: q.p95, p99: q.p99, max: q.max, points: m.points || 1, live: true }
      : { ...m, live: false };
  })
);
/** the OOM metrics are the cards at the top; the other groups are listed below */
const metricGroups = computed(() =>
  GROUPS.filter(group => group !== 'oom')
    .map(group => ({ group, items: metricItems.value.filter(m => m.group === group) }))
    .filter(g => g.items.length)
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

// ---- the PromQL that was sent, in the form of Prometheus' own expression browser

const promItems = computed<PromqlItem[]>(() =>
  (props.prom?.metrics ?? [])
    .filter(m => m.query)
    .map(m => ({ name: m.name, query: m.example || m.query, error: m.error }))
);
const skipped = computed(() => props.prom?.skipped ?? 0);
</script>

<template>
  <NSpin :show="loading">
    <div v-if="detail" class="flex-col gap-12px pb-8px">
      <div class="flex flex-wrap items-center gap-x-12px gap-y-4px text-13px">
        <span class="text-16px font-medium">{{ detail.name }}</span>
        <span class="opacity-70">{{ detail.namespace }}/{{ detail.workload_kind }}/{{ detail.workload }}</span>
        <span class="opacity-70">
          {{ p('configWindow') }} {{ win?.label }} · {{ p('configAt') }} {{ formatDateTime(detail.at) }} ·
          {{ p('configFormula') }}
          {{ results[0]?.result.formula_version || '-' }}
        </span>
        <template v-for="item in results" :key="item.resource">
          <NTag size="small" :bordered="false" :type="statusType[item.result.status]">
            {{ resName(item.resource) }}
            {{ item.result.status === 'over' ? p(`grade_${item.result.grade}`) : p(`health_${item.result.status}`) }}
          </NTag>
        </template>
      </div>

      <!-- OOM: at the top of the dashboard -->
      <div class="flex-col gap-6px">
        <HelpLabel :label="p('oomTitle')" :help="p('oomHelp')" class="text-13px font-medium" />
        <OverprovisionOomCards :detail="detail" :metrics="metricItems" />
      </div>

      <div v-if="!results.length" class="text-13px opacity-70">{{ p('noData') }}</div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-8px">
        <div v-for="tile in configTiles" :key="tile.key" class="tile">
          <div class="tile-label">
            <HelpLabel v-if="tile.help" :label="tile.label" :help="tile.help" />
            <span v-else>{{ tile.label }}</span>
          </div>
          <div class="tile-value">{{ tile.value }}</div>
          <div v-if="tile.sub" class="tile-sub">{{ tile.sub }}</div>
        </div>
        <div v-for="tile in useTiles" :key="tile.key" class="tile" :class="tile.tone ? `tile-${tile.tone}` : ''">
          <div class="tile-label">
            <HelpLabel v-if="tile.help" :label="tile.label" :help="tile.help" />
            <span v-else>{{ tile.label }}</span>
          </div>
          <div class="tile-value">{{ tile.value }}</div>
          <div v-if="tile.sub" class="tile-sub">{{ tile.sub }}</div>
        </div>
      </div>

      <div v-if="quantileRows.length" class="flex flex-wrap items-center gap-8px text-12px">
        <NTag size="tiny" :bordered="false" :type="quantilesFromPrometheus ? 'success' : 'warning'">
          {{
            quantilesFromPrometheus
              ? `Prometheus${prom?.datasource?.name ? ` · ${prom.datasource.name}` : ''}`
              : p('promSourceStored')
          }}
        </NTag>
        <HelpLabel :label="p('promQueries')" :help="p('promHelp')" class="opacity-70" />
        <span v-if="promLoading" class="opacity-70">{{ p('promLoading') }}</span>
        <span v-else-if="promError" class="opacity-70">{{ p('promFailed') }}: {{ promError }}</span>
        <span v-else-if="prom" class="opacity-70">{{ prom.window }} / {{ prom.step }}</span>
        <template v-if="skipped && !promLoading">
          <NTag size="tiny" :bordered="false" type="warning">{{ p('promPartial', { n: skipped }) }}</NTag>
          <NButton size="tiny" quaternary @click="emit('retryProm')">{{ p('retry') }}</NButton>
        </template>
      </div>
      <NTable v-if="quantileRows.length" size="small" :bordered="true" :single-line="false" class="quantiles text-12px">
        <thead>
          <tr>
            <th></th>
            <th>P50</th>
            <th class="key">P90</th>
            <th class="key">P95</th>
            <th class="key">P99</th>
            <th>Max</th>
            <th>{{ p('points') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in quantileRows" :key="row.key">
            <td>{{ row.label }}</td>
            <td>{{ fmt(row.resource, row.u.p50) }}</td>
            <td class="key">{{ fmt(row.resource, row.u.p90) }}</td>
            <td class="key">{{ fmt(row.resource, row.u.p95) }}</td>
            <td class="key">{{ fmt(row.resource, row.u.p99) }}</td>
            <td>{{ fmt(row.resource, row.u.max) }}</td>
            <td>{{ row.u.points ?? '-' }}</td>
          </tr>
        </tbody>
      </NTable>

      <!-- the use of one Pod, CPU and memory in one chart, with the results the analysis stored over time -->
      <div v-if="results.length" class="flex-col gap-4px">
        <HelpLabel :label="p('chartPodTitle')" :help="p('chartPodHelp')" class="text-13px font-medium" />
        <OverprovisionUsageChart
          mode="pod"
          :charts="detail.charts ?? []"
          :history="detail.history"
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
          :history="detail.history"
          :limits="podLimits"
          :quantiles="totalQuantiles"
        />
      </div>

      <NCollapse v-if="results.length" arrow-placement="right">
        <NCollapseItem v-if="promItems.length" :title="p('promQueries')" name="promql">
          <PromqlList :items="promItems" />
        </NCollapseItem>
        <NCollapseItem :title="p('reasons')" name="reasons">
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
        <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-8px">
          <div v-for="m in group.items" :key="m.key" class="tile">
            <div class="tile-label" :title="m.name">{{ m.name }}</div>
            <template v-if="m.points">
              <div class="tile-value">{{ metricValue(m, m.latest) }}</div>
              <div class="tile-sub">
                P90 {{ metricValue(m, m.p90) }} · P95 {{ metricValue(m, m.p95) }} · P99 {{ metricValue(m, m.p99) }}
              </div>
            </template>
            <div v-else class="tile-sub">{{ p('metricEmpty') }}</div>
          </div>
        </div>
        <ul v-if="group.group === 'jvm' && detail.jvm?.hints.length" class="m-0 pl-18px text-12px leading-20px">
          <li v-for="hint in detail.jvm.hints" :key="hint">{{ p(`hint_${hint}`) }}</li>
        </ul>
      </div>

      <OverprovisionClusterCard :module-id="detail.module_id" :grafana-url="grafanaCluster" />
    </div>
  </NSpin>
</template>

<style scoped>
.tile {
  border-radius: 8px;
  padding: 6px 10px;
  background: rgba(128, 128, 128, 0.07);
  min-width: 0;
}
.tile-label {
  font-size: 12px;
  opacity: 0.72;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.tile-value {
  font-size: 16px;
  line-height: 24px;
  white-space: nowrap;
}
.tile-sub {
  font-size: 11px;
  opacity: 0.7;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.tile-bad {
  background: rgba(208, 48, 80, 0.1);
}
.tile-warn {
  background: rgba(240, 160, 32, 0.12);
}
.quantiles :deep(th.key),
.quantiles :deep(td.key) {
  font-weight: 600;
}
</style>
