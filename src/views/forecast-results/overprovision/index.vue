<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NSelect } from 'naive-ui';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import OverprovisionAiAssistant from '@/components/business/overprovision-ai-assistant.vue';
import OverprovisionClusterCard from '@/components/business/overprovision-cluster-card.vue';
import OverprovisionModulePanel from '@/components/business/overprovision-module-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import HelpLabel from '@/components/common/help-label.vue';
import type { RangeValue } from '@/hooks/business/use-forecast-modules';
import { useOverprovisionAi } from '@/hooks/business/use-overprovision-ai';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetForecastModules, fetchGetGrafanaSettings, fetchGetModuleOverprovision } from '@/service/api';
import { buildAnalysisQuestion } from '@/utils/overprovision-ai';
import { operateWidth } from '@/utils/operate-width';
import { grafanaUrl, parseRouteSelection } from '@/utils/resource-links';
import { DEFAULT_WINDOW_LABEL, rangeOfLabel, windowOf } from '@/utils/overprovision-window';

defineOptions({ name: 'ForecastResultsOverprovision' });

/**
 * The resource dashboard: with no module chosen it is the list of the modules (to pick the instance from) and the cluster; choose a namespace and an instance
 * and the page is that module: its OOM kills, what it is configured with and uses (P50 to P99 and the maximum), the use over the window of one Pod and of all
 * the replicas, the metrics it has set up, and the AI analysis at the lower right. Every figure is read from the Prometheus data source of the module's
 * metric mappings, as it is now: nothing comes from what the platform stored, no forecast takes part and no money is counted.
 */
const { t, locale } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const sel = reactive({
  namespace: null as string | null,
  moduleId: null as number | null,
  basis: 'pod' as 'pod' | 'total'
});
/** the analysis window, chosen with the same time field as everywhere else: the last N minutes, hours or days, or a fixed range */
const range = ref<RangeValue | null>(rangeOfLabel(DEFAULT_WINDOW_LABEL));

/** the modules the dashboard can show: the enabled ones */
const modules = ref<Api.Forecast.Module[]>([]);
const modulesLoading = ref(false);
/** the route has been read and the module it names chosen: the overview is not drawn before, so it does not ask for the cluster of a page that is about a module */
const ready = ref(false);
const detail = ref<Api.Overprovision.Detail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const ai = useOverprovisionAi();

/** the address of the Grafana and of its dashboard; null until asked, and the links are drawn only when it is set */
const grafana = ref<Api.Grafana.Settings | null>(null);

/** what the range means for the requests and for Grafana (see utils/overprovision-window) */
const win = computed(() => windowOf(range.value));
const grafanaRange = computed(() => win.value.grafana);

async function loadModules() {
  modulesLoading.value = true;
  try {
    const { data } = await fetchGetForecastModules({ page: 1, page_size: 500, enabled: true });
    modules.value = data?.list ?? [];
  } finally {
    modulesLoading.value = false;
  }
}

function reasonOf(error: unknown) {
  const response = (error as any)?.response;
  return response?.data?.msg || response?.data?.message || (error as any)?.message || '';
}

let detailSeq = 0;
async function loadDetail() {
  const id = sel.moduleId;
  detail.value = null;
  detailError.value = '';
  if (!id) return;
  detailSeq += 1;
  const seq = detailSeq;
  detailLoading.value = true;
  try {
    const { data, error } = await fetchGetModuleOverprovision(id, win.value.params);
    if (seq !== detailSeq) return;
    detail.value = data ?? null;
    if (!data) detailError.value = reasonOf(error);
  } finally {
    if (seq === detailSeq) detailLoading.value = false;
  }
}

// ---- the choice of the module: the namespace first, then the instance of it

const namespaceOptions = computed(() =>
  [...new Set(modules.value.map(row => row.namespace))].sort().map(value => ({ label: value, value }))
);
/** the instances of the namespace chosen (all of them when none is): named by themselves, the namespace is the other filter; a name two namespaces share says which */
const moduleOptions = computed(() => {
  const list = modules.value.filter(row => !sel.namespace || row.namespace === sel.namespace);
  const count = new Map<string, number>();
  for (const row of list) count.set(row.name, (count.get(row.name) ?? 0) + 1);
  return list.map(row => ({
    label: (count.get(row.name) ?? 0) > 1 ? `${row.name} (${row.namespace})` : row.name,
    value: row.id
  }));
});
const basisOptions = computed(() => [
  { label: p('basisPod'), value: 'pod' },
  { label: p('basisTotal'), value: 'total' }
]);

function pickModule(id: number | null) {
  sel.moduleId = id;
  // the namespace follows the instance chosen, so the two filters never disagree
  const row = modules.value.find(item => item.id === id);
  if (row) sel.namespace = row.namespace;
}
function pickNamespace(ns: string | null) {
  sel.namespace = ns;
  // an instance that is not of the namespace is let go (and so is the instance when the namespace is cleared)
  const row = modules.value.find(item => item.id === sel.moduleId);
  if (row && row.namespace !== ns) sel.moduleId = null;
}
watch(
  () => sel.moduleId,
  id => {
    ai.show(id ?? 0);
    loadDetail();
  }
);
watch(range, loadDetail);

const selectedRow = computed(() => modules.value.find(row => row.id === sel.moduleId) ?? null);

/** the toolbar link: the module chosen, or the cluster when none is */
const toolbarGrafana = computed(() =>
  grafanaUrl(
    grafana.value,
    selectedRow.value ? { namespace: selectedRow.value.namespace, workload: selectedRow.value.workload } : {},
    grafanaRange.value
  )
);
const clusterGrafana = computed(() => grafanaUrl(grafana.value, {}, grafanaRange.value));

// ---- Grafana opens this page with the namespace and the workload (and a window) in the query: take the ones that name exactly one thing

const route = useRoute();
function applyRouteSelection() {
  const want = parseRouteSelection(route.query as Record<string, unknown>);
  if (want.window) range.value = rangeOfLabel(want.window);
  const byId = want.moduleId ? modules.value.find(row => row.id === want.moduleId) : undefined;
  const byName =
    want.namespace && want.workload
      ? modules.value.find(row => row.namespace === want.namespace && row.workload === want.workload)
      : undefined;
  const hit = byId ?? byName;
  if (hit) pickModule(hit.id);
  else if (want.namespace && modules.value.some(row => row.namespace === want.namespace))
    sel.namespace = want.namespace;
}

// ---- the AI analysis: the helper at the lower right asks when the user presses it, the page answers with the figures it shows

const aiLabel = computed(() => win.value.grafana.window ?? p('customRange'));
async function analyzeWithAi() {
  const d = detail.value;
  if (!d || ai.state.running) return;
  const question = buildAnalysisQuestion(d, aiLabel.value, locale.value === 'en-US' ? 'en-US' : 'zh-CN');
  await ai.run(d.module_id, question, locale.value, aiLabel.value, {
    page: 'forecast-results_overprovision',
    title: p('listTitle'),
    module_id: d.module_id,
    namespace: d.namespace,
    workload: d.workload
  });
}

// ---- the list of the modules, to pick the instance from

const listRows = computed(() => modules.value.filter(row => !sel.namespace || row.namespace === sel.namespace));
/** the list is as high as its rows need, between a short one and a page of them */
const listHeight = computed(() => Math.min(520, Math.max(250, 190 + listRows.value.length * 37)));

const columnMap: Record<string, any> = {
  name: { title: p('colName'), key: 'name', minWidth: 160, ellipsis: { tooltip: true } },
  namespace: { title: p('namespace'), key: 'namespace', minWidth: 140, ellipsis: { tooltip: true } },
  workload: {
    title: p('colWorkload'),
    key: 'workload',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Module) => `${row.workload_kind}/${row.workload}`
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('analyze')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => pickModule(row.id) }, () =>
        p('analyze')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_overprovision_modules',
  columnMap,
  defaultKeys: ['name', 'namespace', 'workload', 'operate'],
  columnMinWidths: { operate: 70 }
});

onMounted(async () => {
  cfg.initColumnConfig();
  ai.checkReady();
  fetchGetGrafanaSettings().then(({ data }) => {
    grafana.value = data ?? null;
  });
  await loadModules();
  applyRouteSelection();
  ready.value = true;
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-hidden">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <!-- every control opens downward from its own left edge and is the same height; the actions are on the right -->
      <div class="filter-bar">
        <NSelect
          :value="sel.namespace"
          clearable
          filterable
          size="small"
          class="w-180px"
          :placeholder="p('namespace')"
          :options="namespaceOptions"
          @update:value="pickNamespace"
        />
        <NSelect
          :value="sel.moduleId"
          clearable
          filterable
          size="small"
          class="w-260px"
          :placeholder="p('instance')"
          :options="moduleOptions"
          :consistent-menu-width="false"
          @update:value="pickModule"
        />
        <span v-if="sel.moduleId" class="filter-item">
          <HelpLabel :label="p('window')" :help="p('windowHelp')" class="filter-help" />
          <span class="w-250px"><TimeRangeField v-model="range" :clearable="false" size="small" /></span>
        </span>
        <span v-if="sel.moduleId" class="filter-item">
          <HelpLabel :label="p('basis')" :help="p('basisHelp')" class="filter-help" />
          <NSelect v-model:value="sel.basis" size="small" class="w-130px" :options="basisOptions" />
        </span>
        <div class="filter-actions">
          <GrafanaLink :url="toolbarGrafana" :label="p('invGrafanaOpen')" />
          <NButton v-if="sel.moduleId" size="small" secondary :loading="detailLoading" @click="loadDetail">
            {{ p('reload') }}
          </NButton>
        </div>
      </div>
    </NCard>

    <div v-if="sel.moduleId" class="min-h-0 flex-1 overflow-y-auto">
      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
        <OverprovisionModulePanel
          :detail="detail"
          :loading="detailLoading"
          :basis="sel.basis"
          :error="detailError"
          @retry="loadDetail"
        />
      </NCard>
    </div>

    <div v-else-if="ready" class="min-h-0 flex-1 flex-col gap-10px overflow-y-auto">
      <!-- the modules first: pick the instance -->
      <div class="shrink-0 flex-col" :style="{ height: `${listHeight}px` }">
        <ListTablePanel
          :title="p('listTitle')"
          :help="p('listHelp')"
          :cfg="cfg"
          :loading="modulesLoading"
          :data="listRows"
          :row-key="(row: any) => row.id"
          :remote="false"
          :empty-hint="p('noModules')"
          @refresh="loadModules"
        />
      </div>

      <!-- the cluster, as the data source answers -->
      <NCard :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
        <OverprovisionClusterCard open :grafana-url="clusterGrafana" />
      </NCard>
    </div>

    <!-- the AI helper belongs to the module: no module, no button -->
    <OverprovisionAiAssistant
      v-if="sel.moduleId"
      :ai="ai.state"
      :module-name="selectedRow?.name ?? ''"
      :can-analyze="Boolean(detail) && !detailLoading"
      @analyze="analyzeWithAi"
      @stop="ai.stop"
    />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.filter-help {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
