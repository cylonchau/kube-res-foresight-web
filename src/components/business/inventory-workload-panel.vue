<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NCollapse, NCollapseItem, NSpin, NTable, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import InventoryTrendChart from '@/components/business/inventory-trend-chart.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { fetchGetModuleInventory } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatMilli } from '@/utils/format';
import { type GrafanaRange, grafanaUrl } from '@/utils/resource-links';

defineOptions({ name: 'InventoryWorkloadPanel' });

/**
 * What the operator reported of the workload of the module (P10 A3): its replicas, its HPA or KEDA scaler, the requests and limits of every container,
 * the Pods, the trend of the replicas and the history of the changes of its configuration. The operator only reads the cluster; this is what it saw.
 */
interface Props {
  moduleId: number;
  namespace: string;
  workload: string;
  grafana: Api.Grafana.Settings | null;
  range: GrafanaRange;
  /** the hours of the trend and of the history of changes */
  hours: number;
  /** bump to read again (the analysis was run) */
  refreshKey?: number;
}
const props = withDefaults(defineProps<Props>(), { refreshKey: 0 });
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const data = ref<Api.Inventory.Workload | null>(null);
const loading = ref(false);
let seq = 0;
async function load() {
  seq += 1;
  const mine = seq;
  loading.value = true;
  try {
    const res = await fetchGetModuleInventory(props.moduleId, props.hours);
    if (mine === seq) data.value = res.data ?? null;
  } finally {
    if (mine === seq) loading.value = false;
  }
}
watch(() => [props.moduleId, props.hours, props.refreshKey], load, { immediate: true });

const w = computed(() => data.value);
const reported = computed(() => Boolean(w.value?.reported));

const target = computed(() => ({ namespace: props.namespace, workload: props.workload }));
const workloadUrl = computed(() => grafanaUrl(props.grafana, target.value, props.range));
const podUrl = (name: string) => grafanaUrl(props.grafana, { ...target.value, pod: name }, props.range);
const containerUrl = (name: string) => grafanaUrl(props.grafana, { ...target.value, container: name }, props.range);

interface Tile {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone?: 'bad' | 'warn';
}
const tiles = computed<Tile[]>(() => {
  const x = w.value;
  if (!x || !x.reported) return [];
  const out: Tile[] = [
    {
      key: 'replicas',
      label: p('invReplicas'),
      value: `${x.ready} / ${x.desired}`,
      sub: p('invReplicasSub', { available: x.available, updated: x.updated }),
      tone: x.ready < x.desired ? 'warn' : undefined
    }
  ];
  if (x.hpa) {
    out.push({
      key: 'hpa',
      label: x.hpa.kind === 'keda' ? p('invKeda') : p('invHpa'),
      value: x.hpa.name,
      sub: `${p('invHpaRange')} ${x.hpa.min} – ${x.hpa.max}`
    });
    out.push({
      key: 'hpaNow',
      label: p('invHpaNow'),
      value: `${x.hpa.current} → ${x.hpa.desired}`,
      sub: x.hpa.behavior || undefined
    });
  } else {
    out.push({ key: 'hpa', label: p('invHpa'), value: p('invHpaNone') });
  }
  const restarts = x.pods.reduce((sum, pod) => sum + pod.restarts, 0);
  out.push({ key: 'pods', label: p('invPods'), value: String(x.pods.length) });
  out.push({
    key: 'restarts',
    label: p('invRestarts'),
    value: String(restarts),
    tone: restarts > 0 ? 'warn' : undefined
  });
  return out;
});

const trendSeries = computed(() => {
  const points = w.value?.trend ?? [];
  const at = (point: Api.Inventory.TrendPoint) => new Date(point.observed_at).getTime();
  const series: Array<{ name: string; step?: boolean; dashed?: boolean; data: Array<[number, number | null]> }> = [
    {
      name: p('invTrendDesired'),
      step: true,
      data: points.map(point => [at(point), point.desired] as [number, number])
    },
    { name: p('invTrendReadyRep'), step: true, data: points.map(point => [at(point), point.ready] as [number, number]) }
  ];
  if (points.some(point => point.hpa_kind)) {
    const hpa = (pick: (point: Api.Inventory.TrendPoint) => number) =>
      points.map(point => [at(point), point.hpa_kind ? pick(point) : null] as [number, number | null]);
    series.push(
      { name: p('invTrendHpaCurrent'), step: true, data: hpa(point => point.hpa_current) },
      { name: p('invTrendHpaMin'), step: true, data: hpa(point => point.hpa_min), dashed: true },
      { name: p('invTrendHpaMax'), step: true, data: hpa(point => point.hpa_max), dashed: true }
    );
  }
  return series;
});

const openChanges = ref<string[]>([]);
const started = (value?: string) => (value ? formatDateTime(value) : '-');
</script>

<template>
  <NSpin :show="loading">
    <div v-if="w" class="flex-col gap-8px">
      <div class="flex flex-wrap items-center gap-x-10px gap-y-4px text-13px">
        <HelpLabel :label="p('invWorkload')" :help="p('invWorkloadHelp')" class="font-medium" />
        <span v-if="w.reported" class="opacity-70">
          {{ w.namespace }}/{{ w.kind }}/{{ w.name }} · {{ p('invReportedAt') }} {{ formatDateTime(w.observed_at) }}
        </span>
        <NTag v-if="w.reported && w.stale" size="tiny" :bordered="false" type="warning">{{ p('invStale') }}</NTag>
        <NTag v-if="w.missing" size="tiny" :bordered="false" type="error">{{ p('invMissing') }}</NTag>
        <GrafanaLink :url="workloadUrl" :label="p('invGrafanaWorkload')" />
      </div>

      <div v-if="!reported" class="text-12px opacity-80">{{ p('invNoWorkload') }}</div>
      <div v-else-if="w.error" class="text-12px text-[#d03050]">{{ p('invReadError', { error: w.error }) }}</div>

      <template v-if="reported">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-8px">
          <div v-for="tile in tiles" :key="tile.key" class="tile" :class="tile.tone ? `tile-${tile.tone}` : ''">
            <div class="tile-label">{{ tile.label }}</div>
            <div class="tile-value" :title="tile.value">{{ tile.value }}</div>
            <div v-if="tile.sub" class="tile-sub">{{ tile.sub }}</div>
          </div>
        </div>

        <div class="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-12px">
          <div>
            <div class="mb-2px text-12px font-medium opacity-80">{{ p('invContainers') }}</div>
            <NTable size="small" :bordered="true" :single-line="false" class="text-12px">
              <thead>
                <tr>
                  <th>{{ p('invColContainer') }}</th>
                  <th>{{ p('cpuRequests') }}</th>
                  <th>{{ p('cpuLimits') }}</th>
                  <th>{{ p('memRequests') }}</th>
                  <th>{{ p('memLimits') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in w.containers" :key="c.name">
                  <td>{{ c.name }}</td>
                  <td>{{ c.requests.cpu_milli ? formatMilli(c.requests.cpu_milli) : '-' }}</td>
                  <td>{{ c.limits.cpu_milli ? formatMilli(c.limits.cpu_milli) : '-' }}</td>
                  <td>{{ c.requests.memory_bytes ? formatBytes(c.requests.memory_bytes, 1) : '-' }}</td>
                  <td>{{ c.limits.memory_bytes ? formatBytes(c.limits.memory_bytes, 1) : '-' }}</td>
                  <td><GrafanaLink :url="containerUrl(c.name)" :label="p('invGrafanaContainer')" /></td>
                </tr>
              </tbody>
            </NTable>
          </div>
          <div>
            <HelpLabel :label="p('invReplicaTrend')" :help="p('invReplicaTrendHelp')" class="text-12px opacity-80" />
            <InventoryTrendChart :series="trendSeries" :height="150" :empty="p('invTrendEmpty')" />
          </div>
        </div>

        <NCollapse arrow-placement="right">
          <NCollapseItem :title="`${p('invPodList')} (${w.pods.length})`" name="pods">
            <div class="pods">
              <NTable size="small" :bordered="true" :single-line="false" class="text-12px">
                <thead>
                  <tr>
                    <th>Pod</th>
                    <th>{{ p('invColNode') }}</th>
                    <th>{{ p('invColPhase') }}</th>
                    <th>{{ p('invColRestarts') }}</th>
                    <th>{{ p('invColStarted') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pod in w.pods" :key="pod.name">
                    <td class="break-all">{{ pod.name }}</td>
                    <td>{{ pod.node || '-' }}</td>
                    <td>
                      <NTag size="tiny" :bordered="false" :type="pod.ready ? 'success' : 'warning'">
                        {{ pod.phase }}{{ pod.ready ? '' : ` · ${p('invNotReady')}` }}
                      </NTag>
                    </td>
                    <td>{{ pod.restarts }}</td>
                    <td>{{ started(pod.started_at) }}</td>
                    <td><GrafanaLink :url="podUrl(pod.name)" :label="p('invGrafanaPod')" /></td>
                  </tr>
                </tbody>
              </NTable>
            </div>
          </NCollapseItem>
          <NCollapseItem :title="`${p('invChanges')} (${w.changes.length})`" name="changes">
            <div v-if="!w.changes.length" class="text-12px opacity-70">{{ p('invChangesEmpty') }}</div>
            <div v-else class="changes flex-col gap-6px text-12px">
              <div v-for="(change, index) in w.changes" :key="`${change.observed_at}-${index}`">
                <div class="flex flex-wrap items-center gap-8px">
                  <span class="opacity-70">{{ formatDateTime(change.observed_at) }}</span>
                  <span class="font-medium">{{ change.summary }}</span>
                  <a
                    v-if="change.changes.length > 1"
                    class="cursor-pointer opacity-70"
                    @click="
                      openChanges = openChanges.includes(String(index))
                        ? openChanges.filter(item => item !== String(index))
                        : [...openChanges, String(index)]
                    "
                  >
                    {{
                      openChanges.includes(String(index)) ? p('invLess') : p('invMore', { n: change.changes.length })
                    }}
                  </a>
                </div>
                <ul
                  v-if="change.changes.length > 1 && openChanges.includes(String(index))"
                  class="m-0 pl-18px leading-20px"
                >
                  <li v-for="item in change.changes" :key="item.path">
                    <code>{{ item.path }}</code>
                    : {{ item.from || '∅' }} → {{ item.to || '∅' }}
                  </li>
                </ul>
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </template>
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
  overflow-wrap: anywhere;
}
.tile-warn {
  background: rgba(240, 160, 32, 0.12);
}
.pods {
  max-height: 260px;
  overflow: auto;
}
.changes {
  max-height: 260px;
  overflow: auto;
}
</style>
