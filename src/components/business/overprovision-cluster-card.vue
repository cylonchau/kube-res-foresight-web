<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NCollapse, NCollapseItem, NProgress, NSpin, NTag } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import PromqlList, { type PromqlItem } from '@/components/business/promql-list.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { fetchGetOverprovisionCluster } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatPercent } from '@/utils/format';

defineOptions({ name: 'OverprovisionClusterCard' });

/**
 * The cluster, as the Prometheus data source answers for it now: the nodes (ready and all), the Pods, and for the CPU and the memory what the cluster has to
 * give, what has been requested of it and what it uses, each against what it has to give. The figures are the answers to the metric mappings of the cluster in
 * the metric templates (the cluster_* kinds); a figure with no mapping is asked with the system parameter or the default query, and the card says so. When
 * the cluster cannot be read at all the card says why and where to set it up, instead of a bare failure.
 */
interface Props {
  /** the module whose data source is the cluster's when none is set; 0 for the one the platform picks */
  moduleId?: number;
  /** the Grafana link of the cluster, when there is one */
  grafanaUrl?: string | null;
  /** the section is open when the page shows it first (the overview); the module page leaves it closed until it is opened */
  open?: boolean;
}
const props = withDefaults(defineProps<Props>(), { moduleId: 0, grafanaUrl: null, open: false });
const { t } = useI18n();
const router = useRouter();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const cluster = ref<Api.Overprovision.Cluster | null>(null);
const failure = ref('');
const loading = ref(false);
const opened = ref<string[]>(props.open ? ['cluster'] : []);
let loadedFor = -1;

async function load(force = false) {
  if (!force && loadedFor === props.moduleId) return;
  loadedFor = props.moduleId;
  loading.value = true;
  failure.value = '';
  const { data, error } = await fetchGetOverprovisionCluster(props.moduleId || undefined);
  loading.value = false;
  if (data) cluster.value = data;
  else {
    cluster.value = null;
    const response = (error as any)?.response;
    failure.value =
      response?.data?.msg || response?.data?.message || (error as any)?.message || p('clusterUnavailable');
  }
}

const isOpen = computed(() => opened.value.includes('cluster'));
watch(
  [isOpen, () => props.moduleId],
  ([open]) => {
    if (open) load();
  },
  { immediate: true }
);

/** a reason the cluster is not read: the message of the platform, and the way to the page where it is set up */
const unreadable = computed(() => cluster.value?.reason || failure.value);
const goSetup = () => router.push('/datasource/metric-mappings');

interface Meter {
  key: string;
  label: string;
  /** null: the data source did not answer this figure (shown as a dash, never as 0) */
  value: string | null;
  ratio: number | null;
  tone: 'success' | 'warning' | 'error' | 'info';
}
const ratioTone = (ratio: number) => (ratio >= 1 ? 'error' : ratio >= 0.85 ? 'warning' : 'success');

/** the answer of a query of the set by its name, or null when it was not answered (no series, a failure) */
const answer = (name: string) => {
  const value = cluster.value?.queries.find(q => q.name === name)?.value;
  return value === undefined || value === null ? null : value;
};

const groups = computed(() => {
  const c = cluster.value;
  if (!c || c.reason) return [];
  const meter = (
    key: string,
    label: string,
    value: number | null,
    all: number | null,
    format: (v: number) => string
  ): Meter => {
    const ratio = value !== null && all !== null && all > 0 ? value / all : null;
    return {
      key,
      label,
      value: value === null ? null : format(value),
      ratio,
      tone: ratio === null ? 'info' : ratioTone(ratio)
    };
  };
  const cores = (v: number) => formatCores(v, 1);
  const bytes = (v: number) => formatBytes(v, 1);
  const cpuAll = answer('cluster_allocatable_cpu');
  const memAll = answer('cluster_allocatable_memory');
  return [
    {
      key: 'cpu',
      title: p('sectionCpu'),
      all: cpuAll === null ? '-' : cores(cpuAll),
      meters: [
        meter('cpuReq', p('clusterRequested'), answer('cluster_requests_cpu'), cpuAll, cores),
        meter('cpuUse', p('clusterUsed'), answer('cluster_used_cpu'), cpuAll, cores)
      ]
    },
    {
      key: 'memory',
      title: p('sectionMemory'),
      all: memAll === null ? '-' : bytes(memAll),
      meters: [
        meter('memReq', p('clusterRequested'), answer('cluster_requests_memory'), memAll, bytes),
        meter('memUse', p('clusterUsed'), answer('cluster_used_memory'), memAll, bytes)
      ]
    }
  ];
});

const queryItems = computed<PromqlItem[]>(() =>
  (cluster.value?.queries ?? []).map(q => {
    const memory = q.kind.includes('memory');
    const count = q.kind === 'cluster_nodes' || q.kind === 'cluster_nodes_ready' || q.kind === 'cluster_pods';
    return {
      name: `${q.title || q.name}`,
      query: q.query,
      source: q.source,
      mapping: q.mapping,
      error: q.error,
      value:
        q.value === undefined || q.value === null
          ? undefined
          : count
            ? String(Math.round(q.value))
            : memory
              ? formatBytes(q.value, 2)
              : formatCores(q.value, 2)
    };
  })
);

const missingKinds = computed(() => cluster.value?.missing ?? []);
const stats = computed(() => {
  const c = cluster.value;
  if (!c || c.reason) return [];
  const nodes = answer('cluster_nodes');
  const ready = answer('cluster_nodes_ready');
  const pods = answer('cluster_pods');
  const whole = (v: number | null) => (v === null ? '-' : String(Math.round(v)));
  return [
    {
      label: p('clusterNodes'),
      value: nodes === null ? '-' : ready === null ? whole(nodes) : `${whole(ready)} / ${whole(nodes)}`,
      bad: nodes !== null && ready !== null && ready < nodes
    },
    { label: 'Pods', value: whole(pods), bad: false }
  ];
});
</script>

<template>
  <NCollapse v-model:expanded-names="opened" arrow-placement="right">
    <NCollapseItem name="cluster">
      <template #header>
        <span class="inline-flex flex-wrap items-center gap-8px">
          <HelpLabel :label="p('clusterTitle')" :help="p('clusterHelp')" class="text-13px font-medium" />
          <NTag v-if="cluster?.datasource?.name" size="tiny" :bordered="false" type="success">
            Prometheus · {{ cluster.datasource.name }}
          </NTag>
          <NTag v-if="cluster?.configured === false && !unreadable" size="tiny" :bordered="false" type="warning">
            {{ p('clusterNotMapped') }}
          </NTag>
        </span>
      </template>
      <template #header-extra>
        <span class="inline-flex items-center gap-8px" @click.stop>
          <span v-if="cluster?.at && !cluster.reason" class="text-12px opacity-70">
            {{ formatDateTime(cluster.at) }}
          </span>
          <GrafanaLink :url="grafanaUrl" :label="p('invGrafanaCluster')" />
          <NButton size="tiny" quaternary :loading="loading" @click="load(true)">{{ p('reload') }}</NButton>
        </span>
      </template>

      <NSpin :show="loading">
        <div class="flex-col gap-10px">
          <!-- the cluster cannot be read at all: why, and where it is set up -->
          <div v-if="unreadable" class="setup">
            <div class="text-13px font-medium">
              {{ cluster?.reason === 'no_datasource' ? p('clusterNoSource') : p('clusterUnavailable') }}
            </div>
            <div class="mt-4px text-12px opacity-80">{{ cluster?.message || failure }}</div>
            <NButton size="small" type="primary" secondary class="mt-8px" @click="goSetup">
              {{ p('clusterGoSetup') }}
            </NButton>
          </div>

          <template v-else-if="cluster">
            <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-10px">
              <div class="card">
                <div v-for="item in stats" :key="item.label" class="stat-row">
                  <span class="opacity-70">{{ item.label }}</span>
                  <span class="text-16px" :class="{ 'text-[#d03050]': item.bad }">{{ item.value }}</span>
                </div>
              </div>
              <div v-for="group in groups" :key="group.key" class="card">
                <div class="flex items-baseline justify-between">
                  <span class="font-medium">{{ group.title }}</span>
                  <span class="text-12px opacity-70">{{ p('clusterAllocatable') }} {{ group.all }}</span>
                </div>
                <div v-for="meter in group.meters" :key="meter.key" class="mt-6px">
                  <div class="flex items-baseline justify-between text-12px">
                    <span class="opacity-75">{{ meter.label }}</span>
                    <span v-if="meter.value !== null">
                      {{ meter.value }}
                      <span v-if="meter.ratio !== null" class="opacity-70">· {{ formatPercent(meter.ratio, 0) }}</span>
                    </span>
                    <span v-else class="opacity-60" :title="p('clusterNoAnswer')">-</span>
                  </div>
                  <NProgress
                    type="line"
                    :percentage="meter.ratio === null ? 0 : Math.min(Math.round(meter.ratio * 100), 100)"
                    :status="meter.tone === 'info' ? 'default' : meter.tone"
                    :show-indicator="false"
                    :height="6"
                    :border-radius="3"
                  />
                </div>
              </div>
            </div>

            <div v-if="missingKinds.length" class="setup">
              <div class="text-12px">{{ p('clusterMissing', { n: missingKinds.length }) }}</div>
              <div class="mt-4px flex flex-wrap gap-4px">
                <NTag v-for="kind in missingKinds" :key="kind" size="tiny" :bordered="false">
                  {{ t(`page.datasource.mappings.metric_${kind}`) }}
                </NTag>
              </div>
              <NButton size="tiny" secondary class="mt-6px" @click="goSetup">{{ p('clusterGoSetup') }}</NButton>
            </div>

            <ul v-if="cluster.notes.length" class="m-0 pl-18px text-12px leading-20px opacity-80">
              <li v-for="note in cluster.notes" :key="note">{{ note }}</li>
            </ul>

            <NCollapse arrow-placement="right">
              <NCollapseItem :title="p('clusterQueries')" name="queries">
                <PromqlList :items="queryItems" />
              </NCollapseItem>
            </NCollapse>
          </template>
        </div>
      </NSpin>
    </NCollapseItem>
  </NCollapse>
</template>

<style scoped>
.card {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.07);
}
.stat-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 0;
  font-size: 12px;
}
.setup {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(240, 160, 32, 0.1);
}
</style>
