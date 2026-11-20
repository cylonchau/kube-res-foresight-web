<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { NCollapse, NCollapseItem, NDataTable, NSpin, NTag } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import InventoryTrendChart from '@/components/business/inventory-trend-chart.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { fetchGetInventoryNodeTrend, fetchGetInventoryNodeUsage, fetchGetInventoryNodes } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatMilli, formatPercent } from '@/utils/format';
import { type GrafanaRange, grafanaUrl } from '@/utils/resource-links';

defineOptions({ name: 'InventoryClusterPanel' });

/**
 * The cluster and its nodes (P10 A3): the cards of the cluster, the trend of the nodes that are ready, and the table of the nodes. The nodes, their
 * capacity and their Ready state are what the operator reported (read-only); what a node uses right now is asked of the Prometheus data source, and a
 * source that cannot be read is told in place. One section that opens and closes; no tabs.
 */
interface Props {
  grafana: Api.Grafana.Settings | null;
  range: GrafanaRange;
  /** the hours of the trend of the nodes that are ready */
  hours: number;
  /** open when the page shows it first (the overview); false: it loads when it is opened */
  open?: boolean;
}
const props = withDefaults(defineProps<Props>(), { open: false });
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const expanded = ref<string[]>(props.open ? ['cluster'] : []);
const isOpen = computed(() => expanded.value.includes('cluster'));

const nodes = ref<Api.Inventory.Nodes | null>(null);
const trend = ref<Api.Inventory.NodeTrendPoint[]>([]);
const usage = ref<Api.Inventory.NodeUsage | null>(null);
const usageError = ref('');
const loading = ref(false);
let loaded = false;
let hoursLoaded = 0;

async function load(force = false) {
  if (!force && loaded && hoursLoaded === props.hours) return;
  loaded = true;
  hoursLoaded = props.hours;
  loading.value = true;
  try {
    const [n, tr] = await Promise.all([fetchGetInventoryNodes(), fetchGetInventoryNodeTrend(props.hours)]);
    nodes.value = n.data ?? null;
    trend.value = tr.data ?? [];
  } finally {
    loading.value = false;
  }
  // what the nodes use is a live question to Prometheus: asked after the rest is there, and never needed for it
  usage.value = null;
  usageError.value = '';
  const { data, error } = await fetchGetInventoryNodeUsage();
  if (data?.reason) usageError.value = data.message || p('invUsageFailed');
  else if (data) usage.value = data;
  else {
    const response = (error as any)?.response;
    usageError.value = response?.data?.msg || response?.data?.message || (error as any)?.message || p('invUsageFailed');
  }
}
watch(
  isOpen,
  value => {
    if (value) load();
  },
  { immediate: true }
);
watch(
  () => props.hours,
  () => {
    if (isOpen.value) load();
  }
);

interface Tile {
  key: string;
  label: string;
  help?: string;
  value: string;
  sub?: string;
  tone?: 'bad' | 'warn';
}
const top = (counts: Record<string, number> | undefined) =>
  Object.entries(counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} × ${n}`)
    .join(', ');

const tiles = computed<Tile[]>(() => {
  const n = nodes.value;
  if (!n || !n.reported) return [];
  const totals = n.totals;
  const allocCpu = totals.alloc_cpu_milli;
  const allocMem = totals.alloc_memory_bytes;
  const rate = (used: number, all: number) => (all > 0 ? formatPercent(used / all, 0) : undefined);
  return [
    { key: 'cluster', label: p('invClusterName'), value: n.cluster },
    {
      key: 'ready',
      label: p('invNodesReady'),
      value: `${totals.ready} / ${totals.nodes}`,
      tone: totals.ready < totals.nodes ? 'bad' : undefined
    },
    {
      key: 'unsched',
      label: p('invUnschedulable'),
      value: String(totals.unschedulable),
      tone: totals.unschedulable > 0 ? 'warn' : undefined
    },
    { key: 'allocCpu', label: p('clusterAllocCpu'), value: formatMilli(allocCpu) },
    { key: 'allocMem', label: p('clusterAllocMem'), value: formatBytes(allocMem, 1) },
    { key: 'pods', label: p('invModulePods'), help: p('invModulePodsHelp'), value: String(totals.module_pods) },
    {
      key: 'reqCpu',
      label: p('invModuleReqCpu'),
      help: p('invModulePodsHelp'),
      value: formatMilli(totals.req_cpu_milli),
      sub: rate(totals.req_cpu_milli, allocCpu)
    },
    {
      key: 'reqMem',
      label: p('invModuleReqMem'),
      help: p('invModulePodsHelp'),
      value: formatBytes(totals.req_memory_bytes, 1),
      sub: rate(totals.req_memory_bytes, allocMem)
    },
    { key: 'providers', label: p('invProviders'), value: top(n.providers) || '-' },
    { key: 'zones', label: p('invZones'), value: top(n.zones) || '-' },
    { key: 'types', label: p('invTypes'), value: top(n.instance_types) || '-' }
  ];
});

const trendSeries = computed(() => [
  {
    name: p('invTrendNodes'),
    step: true,
    data: trend.value.map(point => [new Date(point.observed_at).getTime(), point.nodes] as [number, number])
  },
  {
    name: p('invTrendReady'),
    step: true,
    data: trend.value.map(point => [new Date(point.observed_at).getTime(), point.ready] as [number, number])
  }
]);

const figure = (value: number | null | undefined, format: (v: number) => string) =>
  value === null || value === undefined ? '-' : format(value);

type Row = Api.Inventory.NodeRow;
const columns = computed<DataTableColumns<Row>>(() => [
  { title: p('invColNode'), key: 'node', width: 190, fixed: 'left', ellipsis: { tooltip: true } },
  {
    title: p('invColReady'),
    key: 'ready',
    width: 96,
    render: row =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.ready ? 'success' : 'error' },
        () => (row.ready ? 'Ready' : 'NotReady') + (row.unschedulable ? ` · ${p('invCordoned')}` : '')
      )
  },
  {
    title: p('invColPressure'),
    key: 'pressure',
    width: 110,
    render: row => (row.pressure_list.length ? row.pressure_list.join(', ') : '-')
  },
  { title: p('invColType'), key: 'instance_type', width: 130, render: row => row.instance_type || '-' },
  { title: p('invColZone'), key: 'zone', width: 130, render: row => row.zone || '-' },
  { title: p('invColAllocCpu'), key: 'alloc_cpu', width: 100, render: row => formatMilli(row.alloc_cpu_milli) },
  { title: p('invColAllocMem'), key: 'alloc_mem', width: 100, render: row => formatBytes(row.alloc_memory_bytes, 1) },
  { title: p('invColModulePods'), key: 'pods', width: 90, render: row => row.module_pods },
  {
    title: p('invColReqCpu'),
    key: 'req_cpu',
    width: 100,
    render: row => (row.req_cpu_milli ? formatMilli(row.req_cpu_milli) : '-')
  },
  {
    title: p('invColReqMem'),
    key: 'req_mem',
    width: 100,
    render: row => (row.req_memory_bytes ? formatBytes(row.req_memory_bytes, 1) : '-')
  },
  {
    title: () => h(HelpLabel, { label: p('invColUsedCpu'), help: p('invUsedHelp') }),
    key: 'used_cpu',
    width: 130,
    render: row => {
      const f = usage.value?.nodes[row.node];
      return figure(
        f?.cpu_used,
        v =>
          `${formatCores(v, 2)}${row.alloc_cpu_milli ? ` · ${formatPercent(v / (row.alloc_cpu_milli / 1000), 0)}` : ''}`
      );
    }
  },
  {
    title: () => h(HelpLabel, { label: p('invColUsedMem'), help: p('invUsedHelp') }),
    key: 'used_mem',
    width: 140,
    render: row => {
      const f = usage.value?.nodes[row.node];
      return figure(
        f?.memory_used,
        v => `${formatBytes(v, 1)}${row.alloc_memory_bytes ? ` · ${formatPercent(v / row.alloc_memory_bytes, 0)}` : ''}`
      );
    }
  },
  {
    title: '',
    key: 'grafana',
    width: 110,
    fixed: 'right',
    render: row => {
      const url = grafanaUrl(props.grafana, { node: row.node }, props.range);
      return url ? h(GrafanaLink, { url, label: p('invGrafanaNode') }) : null;
    }
  }
]);

const clusterUrl = computed(() => grafanaUrl(props.grafana, {}, props.range));
const reportNote = computed(() => {
  const n = nodes.value;
  if (!n) return '';
  if (!n.reported) return p('invNotReported');
  return '';
});
</script>

<template>
  <NCollapse v-model:expanded-names="expanded" arrow-placement="right">
    <NCollapseItem name="cluster">
      <template #header>
        <span class="inline-flex items-center gap-8px">
          <HelpLabel :label="p('invCluster')" :help="p('invClusterHelp')" class="text-13px font-medium" />
          <NTag v-if="nodes?.reported && nodes.stale" size="tiny" :bordered="false" type="warning">
            {{ p('invStale') }}
          </NTag>
        </span>
      </template>
      <template #header-extra>
        <span class="inline-flex items-center gap-8px" @click.stop>
          <span v-if="nodes?.at" class="text-12px opacity-70">
            {{ p('invReportedAt') }} {{ formatDateTime(nodes.at) }}
          </span>
          <GrafanaLink :url="clusterUrl" :label="p('invGrafanaCluster')" />
        </span>
      </template>

      <NSpin :show="loading">
        <div class="flex-col gap-10px">
          <div v-if="reportNote" class="text-12px opacity-80">{{ reportNote }}</div>
          <template v-else-if="nodes">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-8px">
              <div v-for="tile in tiles" :key="tile.key" class="tile" :class="tile.tone ? `tile-${tile.tone}` : ''">
                <div class="tile-label">
                  <HelpLabel v-if="tile.help" :label="tile.label" :help="tile.help" />
                  <span v-else>{{ tile.label }}</span>
                </div>
                <div class="tile-value" :title="tile.value">{{ tile.value }}</div>
                <div v-if="tile.sub" class="tile-sub">{{ tile.sub }}</div>
              </div>
            </div>

            <div>
              <HelpLabel :label="p('invTrend')" :help="p('invTrendHelp')" class="text-12px opacity-80" />
              <InventoryTrendChart :series="trendSeries" :height="150" :empty="p('invTrendEmpty')" />
            </div>

            <div class="flex-col gap-4px">
              <div class="flex flex-wrap items-center gap-8px text-12px">
                <span class="font-medium">{{ p('invNodeTable') }}</span>
                <span v-if="usage" class="opacity-70">{{ p('invUsageSource', { name: usage.datasource.name }) }}</span>
                <span v-else-if="usageError" class="text-[#d03050]">{{ p('invUsageFailed') }}: {{ usageError }}</span>
              </div>
              <NDataTable
                size="small"
                :columns="columns"
                :data="nodes.nodes"
                :row-key="(row: Row) => row.node"
                :max-height="320"
                :scroll-x="1500"
                :bordered="false"
              />
              <ul v-if="usage?.notes?.length" class="m-0 pl-18px text-12px leading-20px opacity-70">
                <li v-for="note in usage.notes" :key="note">{{ note }}</li>
              </ul>
            </div>
          </template>
        </div>
      </NSpin>
    </NCollapseItem>
  </NCollapse>
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
}
.tile-value {
  font-size: 16px;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-sub {
  font-size: 11px;
  opacity: 0.7;
  line-height: 16px;
}
.tile-bad {
  background: rgba(208, 48, 80, 0.1);
}
.tile-warn {
  background: rgba(240, 160, 32, 0.12);
}
</style>
