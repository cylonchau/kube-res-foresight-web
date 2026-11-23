<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NButton, NCard, NTag } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import OverprovisionClusterCard from '@/components/business/overprovision-cluster-card.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetGrafanaSettings, fetchGetOverprovisionClusters } from '@/service/api';
import { operateWidth } from '@/utils/operate-width';
import { grafanaUrl } from '@/utils/resource-links';

defineOptions({ name: 'ForecastResultsClusterDashboard' });

/**
 * The cluster dashboard: a page of its own, apart from the resource dashboard of the modules. It shows how many clusters the platform manages (the Prometheus
 * data sources that have cluster metric templates declared, and the one the system parameter names), the list of them with how much of the set of cluster
 * metrics each declares, and for the cluster chosen the figures of its nodes, Pods, CPU and memory, every one the answer of Prometheus now. A figure whose
 * template is not declared is not asked: the page says which to declare, in the metric templates, as a cluster metric. The cluster chosen is in the address
 * (`?cluster=`), so a reload or the back button lands on the same one.
 */
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});
const route = useRoute();
const router = useRouter();

const clusters = ref<Api.Overprovision.ClusterEntry[]>([]);
const count = ref(0);
const loading = ref(false);
const failure = ref('');
const selected = ref(0);
const grafana = ref<Api.Grafana.Settings | null>(null);

function reasonOf(error: unknown) {
  const response = (error as any)?.response;
  return response?.data?.msg || response?.data?.message || (error as any)?.message || '';
}

async function load() {
  loading.value = true;
  failure.value = '';
  try {
    const { data, error } = await fetchGetOverprovisionClusters();
    if (!data) {
      failure.value = reasonOf(error);
      return;
    }
    clusters.value = data.clusters;
    count.value = data.count;
    const wanted = Number(Array.isArray(route.query.cluster) ? route.query.cluster[0] : route.query.cluster);
    const hit = data.clusters.find(item => item.datasource_id === wanted) ?? data.clusters[0];
    selected.value = hit?.datasource_id ?? 0;
  } finally {
    loading.value = false;
  }
}

function choose(id: number) {
  selected.value = id;
  router.replace({ name: route.name as string, query: { cluster: String(id) } });
}

const current = computed(() => clusters.value.find(item => item.datasource_id === selected.value) ?? null);
const clusterGrafana = computed(() => grafanaUrl(grafana.value, {}, {}));
const goSetup = () => router.push({ path: '/datasource/metric-mappings' });

const columnMap: Record<string, any> = {
  name: {
    title: p('clusterName'),
    key: 'name',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (row: Api.Overprovision.ClusterEntry) =>
      h('span', { class: 'inline-flex items-center gap-6px' }, [
        row.name,
        row.primary ? h(NTag, { size: 'tiny', type: 'info', bordered: false }, () => p('clusterPrimary')) : null,
        row.datasource_id === selected.value
          ? h(NTag, { size: 'tiny', type: 'success', bordered: false }, () => p('clusterShown'))
          : null
      ])
  },
  declared: {
    title: p('clusterDeclared'),
    key: 'declared',
    width: 130,
    align: 'center',
    render: (row: Api.Overprovision.ClusterEntry) =>
      h(
        NTag,
        { size: 'small', type: row.declared === row.total ? 'success' : 'warning', bordered: false },
        () => `${row.declared} / ${row.total}`
      )
  },
  missing: {
    title: p('clusterUndeclared'),
    key: 'missing',
    minWidth: 260,
    ellipsis: { tooltip: true },
    render: (row: Api.Overprovision.ClusterEntry) =>
      row.missing.length ? row.missing.map(kind => t(`page.datasource.mappings.metric_${kind}`)).join('、') : '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('clusterView')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Overprovision.ClusterEntry) =>
      h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          secondary: true,
          disabled: row.datasource_id === selected.value,
          onClick: () => choose(row.datasource_id)
        },
        () => p('clusterView')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_cluster_dashboard',
  columnMap,
  defaultKeys: ['name', 'declared', 'missing', 'operate'],
  columnMinWidths: { operate: 70 }
});

onMounted(() => {
  cfg.initColumnConfig();
  fetchGetGrafanaSettings().then(({ data }) => {
    grafana.value = data ?? null;
  });
  load();
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-y-auto">
    <!-- how many clusters are managed -->
    <NCard :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
      <div class="flex flex-wrap items-center gap-24px">
        <div>
          <div class="text-12px opacity-75">
            <HelpLabel :label="p('clusterCount')" :help="p('clusterCountHelp')" />
          </div>
          <div class="text-28px font-600 leading-36px">{{ count }}</div>
        </div>
        <div v-if="current" class="text-13px opacity-80">
          {{ p('clusterShowing', { name: current.name }) }}
        </div>
        <div class="ml-auto flex items-center gap-8px">
          <GrafanaLink :url="clusterGrafana" :label="p('invGrafanaCluster')" />
          <NButton size="small" secondary :loading="loading" @click="load">{{ p('reload') }}</NButton>
        </div>
      </div>
      <div v-if="failure" class="mt-8px text-12px text-[#d03050]">{{ failure }}</div>
    </NCard>

    <!-- no cluster: the way to declare one -->
    <NCard v-if="!loading && !failure && !count" :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
      <div class="text-13px font-medium">{{ p('clusterNone') }}</div>
      <div class="mt-4px text-12px opacity-80">{{ p('clusterNoneHint') }}</div>
      <NButton size="small" type="primary" secondary class="mt-8px" @click="goSetup">{{ p('clusterGoSetup') }}</NButton>
    </NCard>

    <!-- the clusters -->
    <div
      v-if="count"
      class="shrink-0 flex-col"
      :style="{ height: `${Math.min(360, Math.max(230, 180 + count * 37))}px` }"
    >
      <ListTablePanel
        :title="p('clusterListTitle')"
        :help="p('clusterListHelp')"
        :cfg="cfg"
        :loading="loading"
        :data="clusters"
        :row-key="(row: any) => row.datasource_id"
        :remote="false"
        @refresh="load"
      />
    </div>

    <!-- the cluster chosen: its figures -->
    <NCard v-if="selected" :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
      <OverprovisionClusterCard :key="selected" open :datasource-id="selected" :grafana-url="clusterGrafana" />
    </NCard>
  </div>
</template>
