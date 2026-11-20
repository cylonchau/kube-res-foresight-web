<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NRadioButton, NRadioGroup, NSelect, NSpin, NTag } from 'naive-ui';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GrafanaLink from '@/components/business/grafana-link.vue';
import InventoryClusterPanel from '@/components/business/inventory-cluster-panel.vue';
import InventoryWorkloadPanel from '@/components/business/inventory-workload-panel.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import OverprovisionModulePanel from '@/components/business/overprovision-module-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { type RangeValue, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { useOverprovisionAi } from '@/hooks/business/use-overprovision-ai';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchGetGrafanaSettings,
  fetchGetModuleOverprovision,
  fetchGetModulePrometheus,
  fetchGetOverprovision,
  fetchRunOverprovision
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatPercent } from '@/utils/format';
import { buildAnalysisQuestion } from '@/utils/overprovision-ai';
import { operateWidth } from '@/utils/operate-width';
import { grafanaUrl, parseRouteSelection } from '@/utils/resource-links';

defineOptions({ name: 'ForecastResultsOverprovision' });

/**
 * The resource dashboard (P10 A3): choose a namespace and a module, and the page is that module: what it is configured with and uses (P90, P95 and
 * P99 among the quantiles), the metrics it has set up, the history of the analysis, the cluster, and a one-click AI analysis. With no module chosen
 * it is the overview of all the modules: the totals, the ranking of what could be given back and a compact list to pick a module from. It shows
 * measured data only: no forecast takes part and no money is counted.
 */
const { t, locale } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const WINDOWS = ['15m', '30m', '1h', '1d', '7d', '15d', '30d'];
const HEALTHS: Api.Overprovision.Health[] = ['risk', 'under', 'over', 'limited', 'ok', 'unknown'];

const sel = reactive({
  namespace: null as string | null,
  moduleId: null as number | null,
  health: null as string | null,
  window: '7d',
  basis: 'pod' as 'pod' | 'total'
});
const customRange = ref<RangeValue | null>(lastHours(6));

const board = ref<Api.Overprovision.Board | null>(null);
const boardLoading = ref(false);
const detail = ref<Api.Overprovision.Detail | null>(null);
const detailLoading = ref(false);
/** the quantiles as the Prometheus data source computes them, asked after the rest of the page is there: a long window is a slow query */
const prom = ref<Api.Overprovision.PromStats | null>(null);
const promLoading = ref(false);
const promError = ref('');
const analyzing = ref(false);
const ai = useOverprovisionAi();

/** the address of the Grafana and of its dashboard; null until asked, and the links are drawn only when it is set */
const grafana = ref<Api.Grafana.Settings | null>(null);
const inventoryKey = ref(0);

const custom = computed(() => sel.window === 'custom');
/** the window of the page as Grafana's time range: '7d' is now-7d, a custom range is its two ends */
const grafanaRange = computed(() => {
  if (custom.value) {
    const params = rangeParams(customRange.value);
    return { from: params.from, to: params.to };
  }
  return { window: sel.window };
});
const WINDOW_HOURS: Record<string, number> = {
  '15m': 1,
  '30m': 1,
  '1h': 1,
  '1d': 24,
  '7d': 168,
  '15d': 360,
  '30d': 720
};
/** how far back the trends and the history of changes of the inventory go: the window of the page, at least an hour */
const inventoryHours = computed(() => {
  if (!custom.value) return WINDOW_HOURS[sel.window] ?? 168;
  const range = rangeParams(customRange.value);
  const span = range.from && range.to ? (Date.parse(range.to) - Date.parse(range.from)) / 3600000 : 24;
  return Math.min(Math.max(Math.ceil(Number.isFinite(span) ? span : 24), 1), 24 * 365);
});
/** the overview reads the stored results of one of the seven windows; a custom range has none, so it shows the 7 days */
const boardWindow = computed(() => (custom.value ? '7d' : sel.window));

async function loadBoard() {
  boardLoading.value = true;
  try {
    const { data } = await fetchGetOverprovision(boardWindow.value);
    board.value = data ?? null;
  } finally {
    boardLoading.value = false;
  }
}

let detailSeq = 0;
async function loadDetail() {
  const id = sel.moduleId;
  if (!id) {
    detail.value = null;
    return;
  }
  detailSeq += 1;
  const seq = detailSeq;
  detailLoading.value = true;
  try {
    const params = custom.value ? rangeParams(customRange.value) : { window: sel.window };
    const { data } = await fetchGetModuleOverprovision(id, params);
    if (seq === detailSeq) detail.value = data ?? null;
  } finally {
    if (seq === detailSeq) detailLoading.value = false;
  }
}

let promSeq = 0;
async function loadProm() {
  const id = sel.moduleId;
  prom.value = null;
  promError.value = '';
  if (!id) return;
  promSeq += 1;
  const seq = promSeq;
  promLoading.value = true;
  try {
    const params = custom.value ? rangeParams(customRange.value) : { window: sel.window };
    const { data, error } = await fetchGetModulePrometheus(id, params);
    if (seq !== promSeq) return;
    if (data) prom.value = data;
    else {
      const response = (error as any)?.response;
      promError.value = response?.data?.msg || response?.data?.message || (error as any)?.message || '';
    }
  } finally {
    if (seq === promSeq) promLoading.value = false;
  }
}

async function analyzeNow() {
  analyzing.value = true;
  try {
    const { data } = await fetchRunOverprovision(sel.moduleId ?? undefined);
    if (data) {
      window.$message?.success(
        data.failed
          ? p('analyzePartial', { n: data.analyzed, failed: data.failed })
          : p('analyzedCount', { n: data.analyzed })
      );
    }
    await Promise.all([loadBoard(), loadDetail(), loadProm()]);
    inventoryKey.value += 1;
  } finally {
    analyzing.value = false;
  }
}

// ---- the choice of the module

const rows = computed(() => board.value?.rows ?? []);
const namespaceOptions = computed(() =>
  [...new Set(rows.value.map(row => row.namespace))].sort().map(value => ({ label: value, value }))
);
const moduleOptions = computed(() =>
  rows.value
    .filter(row => !sel.namespace || row.namespace === sel.namespace)
    .map(row => ({ label: sel.namespace ? row.name : `${row.name}  ·  ${row.namespace}`, value: row.module_id }))
);
const healthOptions = computed(() => HEALTHS.map(value => ({ label: p(`health_${value}`), value })));

function pickModule(id: number | null) {
  sel.moduleId = id;
  // a namespace filter that does not hold the module is dropped, so the module list is never emptied by the choice that was just made
  const row = rows.value.find(item => item.module_id === id);
  if (row && sel.namespace && row.namespace !== sel.namespace) sel.namespace = null;
}
watch(
  () => sel.namespace,
  ns => {
    // a namespace that does not hold the chosen module takes the choice back
    const row = rows.value.find(item => item.module_id === sel.moduleId);
    if (row && ns && row.namespace !== ns) sel.moduleId = null;
  }
);
watch(
  () => sel.moduleId,
  id => {
    ai.show(id ?? 0);
    loadDetail();
    loadProm();
  }
);
watch(
  () => sel.window,
  () => {
    loadBoard();
    loadDetail();
    loadProm();
  }
);
watch(customRange, () => {
  if (custom.value) {
    loadDetail();
    loadProm();
  }
});

const selectedRow = computed(() => rows.value.find(row => row.module_id === sel.moduleId) ?? null);

/** the toolbar link: the module chosen, or the cluster when none is */
const toolbarGrafana = computed(() =>
  grafanaUrl(
    grafana.value,
    selectedRow.value ? { namespace: selectedRow.value.namespace, workload: selectedRow.value.workload } : {},
    grafanaRange.value
  )
);

// ---- Grafana opens this page with the namespace and the workload (and a window) in the query: take the ones that name exactly one thing

const route = useRoute();
function applyRouteSelection() {
  const want = parseRouteSelection(route.query as Record<string, unknown>);
  if (want.window) sel.window = want.window;
  const byId = want.moduleId ? rows.value.find(row => row.module_id === want.moduleId) : undefined;
  const byName =
    want.namespace && want.workload
      ? rows.value.find(row => row.namespace === want.namespace && row.workload === want.workload)
      : undefined;
  const hit = byId ?? byName;
  if (hit) {
    sel.namespace = hit.namespace;
    pickModule(hit.module_id);
  } else if (want.namespace && rows.value.some(row => row.namespace === want.namespace)) {
    sel.namespace = want.namespace;
  }
}

// ---- the one-click AI analysis

const aiLabel = computed(() => (custom.value ? p('customRange') : sel.window));
async function analyzeWithAi() {
  const d = detail.value;
  if (!d || ai.state.running) return;
  const question = buildAnalysisQuestion(d, aiLabel.value, locale.value === 'en-US' ? 'en-US' : 'zh-CN', prom.value);
  await ai.run(d.module_id, question, locale.value, aiLabel.value, {
    page: 'forecast-results_overprovision',
    title: p('listTitle'),
    module_id: d.module_id,
    namespace: d.namespace,
    workload: d.workload
  });
}

// ---- the overview: the totals

interface Cell {
  key: string;
  label: string;
  help: string;
  value: string;
  type?: 'default' | 'warning' | 'error' | 'success';
}

const cells = computed<Cell[]>(() => {
  const b = board.value;
  if (!b) return [];
  const reclaim = (totals: Api.Overprovision.Totals, format: (v: number) => string) =>
    `${format(totals.reclaimable)} (${formatPercent(totals.share, 0)})`;
  return [
    {
      key: 'cpuReserved',
      label: p('cardCpuReserved'),
      help: p('cardReservedHelp'),
      value: formatCores(b.cpu.request, 2)
    },
    {
      key: 'memReserved',
      label: p('cardMemReserved'),
      help: p('cardReservedHelp'),
      value: formatBytes(b.memory.request, 2)
    },
    {
      key: 'cpuReclaim',
      label: p('cardCpuReclaim'),
      help: p('cardReclaimHelp'),
      value: reclaim(b.cpu, v => formatCores(v, 2)),
      type: b.cpu.reclaimable > 0 ? 'warning' : 'default'
    },
    {
      key: 'memReclaim',
      label: p('cardMemReclaim'),
      help: p('cardReclaimHelp'),
      value: reclaim(b.memory, v => formatBytes(v, 2)),
      type: b.memory.reclaimable > 0 ? 'warning' : 'default'
    },
    {
      key: 'over',
      label: p('cardOver'),
      help: p('cardOverHelp'),
      value: `${b.over} / ${b.modules}`,
      type: b.over > 0 ? 'warning' : 'default'
    },
    {
      key: 'under',
      label: p('cardUnder'),
      help: p('cardUnderHelp'),
      value: String(b.under),
      type: b.under > 0 ? 'error' : 'default'
    },
    {
      key: 'risk',
      label: p('cardRisk'),
      help: p('cardRiskHelp'),
      value: String(b.risk),
      type: b.risk > 0 ? 'error' : 'success'
    },
    { key: 'limited', label: p('cardLimited'), help: p('cardLimitedHelp'), value: String(b.limited) },
    {
      key: 'analyzedAt',
      label: p('analyzedAt'),
      help: b.basis,
      value: b.analyzed_at ? formatDateTime(b.analyzed_at) : '-'
    }
  ];
});

// ---- the overview: the ranking of what could be given back, over all replicas

const rank = reactive({ mode: 'top' as 'top' | 'namespace', resource: 'cpu' as 'cpu' | 'memory' });
const rankModeOptions = computed(() => [
  { label: p('rankTop'), value: 'top' },
  { label: p('rankNamespace'), value: 'namespace' }
]);
const rankResourceOptions = computed(() => [
  { label: p('rankCpu'), value: 'cpu' },
  { label: p('rankMemory'), value: 'memory' }
]);
const GIB = 1024 ** 3;

const ranking = computed(() => {
  const totals = new Map<string, number>();
  for (const row of rows.value) {
    const result = rank.resource === 'cpu' ? row.cpu : row.memory;
    if (!result || result.reclaimable <= 0) continue;
    const value = (result.reclaimable * Math.max(row.replicas, 1)) / (rank.resource === 'cpu' ? 1 : GIB);
    const key = rank.mode === 'top' ? `${row.namespace}/${row.name}` : row.namespace;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
});

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      grid: { left: 8, right: 24, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', inverse: true, data: [] as string[] },
      series: []
    }) as ECOption,
  { onRender: () => {}, onUpdated: () => {} }
);

async function drawRanking() {
  const list = ranking.value;
  await updateOptions(opts => ({
    ...opts,
    yAxis: {
      type: 'category',
      inverse: true,
      data: list.map(item => item[0]),
      axisLabel: { width: 220, overflow: 'truncate' }
    },
    series: [
      {
        type: 'bar',
        name: rank.resource === 'cpu' ? p('rankCpu') : p('rankMemory'),
        data: list.map(item => Number(item[1].toFixed(3))),
        itemStyle: { color: '#f0a020' },
        barMaxWidth: 14
      }
    ] as never
  }));
}
watch([ranking, locale], drawRanking);

// ---- the overview: the compact list of modules, to pick one from

type RowT = Api.Overprovision.Row;
const total = computed(() => sel.basis === 'total');
const times = (row: RowT) => (total.value ? Math.max(row.replicas, 1) : 1);
const fmt = (resource: 'cpu' | 'memory', value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);

const requestOf = (row: RowT, resource: 'cpu' | 'memory') => {
  const r = row[resource];
  return r && r.request > 0 ? fmt(resource, r.request * times(row)) : '-';
};
type Q = 'p90' | 'p95' | 'p99';
const quantileOf = (row: RowT, resource: 'cpu' | 'memory', q: Q) => {
  const r = row[resource];
  if (!r || !r.points) return '-';
  const key = total.value ? (`total_${q}` as const) : q;
  return fmt(resource, r[key]);
};
const suggestedOf = (row: RowT, resource: 'cpu' | 'memory') => {
  const r = row[resource];
  return r && r.suggested > 0 ? fmt(resource, r.suggested * times(row)) : '-';
};
const worstRatio = (row: RowT) => {
  const ratios = [row.cpu, row.memory].filter(r => r && r.suggested > 0).map(r => r!.ratio);
  return ratios.length ? Math.max(...ratios) : null;
};

const healthType: Record<string, 'default' | 'error' | 'warning' | 'success' | 'info'> = {
  risk: 'error',
  under: 'error',
  over: 'warning',
  limited: 'info',
  ok: 'success',
  unknown: 'default'
};

const listRows = computed(() =>
  rows.value.filter(
    row => (!sel.namespace || row.namespace === sel.namespace) && (!sel.health || row.health === sel.health)
  )
);

const quantileColumn = (key: string, title: string, resource: 'cpu' | 'memory', q: Q) => ({
  title,
  key,
  width: 100,
  render: (row: RowT) => quantileOf(row, resource, q)
});

const columnMap: Record<string, any> = {
  name: { title: p('colName'), key: 'name', minWidth: 150, ellipsis: { tooltip: true } },
  workload: {
    title: p('colWorkload'),
    key: 'workload',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (row: RowT) => `${row.namespace}/${row.workload}`
  },
  replicas: {
    title: p('colReplicas'),
    key: 'replicas',
    width: 70,
    align: 'center',
    render: (row: RowT) => row.replicas || '-'
  },
  cpu_request: {
    title: p('colCpuRequest'),
    key: 'cpu_request',
    width: 100,
    render: (row: RowT) => requestOf(row, 'cpu')
  },
  cpu_p90: quantileColumn('cpu_p90', 'CPU P90', 'cpu', 'p90'),
  cpu_p95: quantileColumn('cpu_p95', 'CPU P95', 'cpu', 'p95'),
  cpu_p99: quantileColumn('cpu_p99', 'CPU P99', 'cpu', 'p99'),
  cpu_suggested: {
    title: p('colCpuSuggested'),
    key: 'cpu_suggested',
    width: 100,
    render: (row: RowT) => suggestedOf(row, 'cpu')
  },
  mem_request: {
    title: p('colMemRequest'),
    key: 'mem_request',
    width: 100,
    render: (row: RowT) => requestOf(row, 'memory')
  },
  mem_p90: quantileColumn('mem_p90', p('colMemP90'), 'memory', 'p90'),
  mem_p95: quantileColumn('mem_p95', p('colMemP95'), 'memory', 'p95'),
  mem_p99: quantileColumn('mem_p99', p('colMemP99'), 'memory', 'p99'),
  mem_suggested: {
    title: p('colMemSuggested'),
    key: 'mem_suggested',
    width: 110,
    render: (row: RowT) => suggestedOf(row, 'memory')
  },
  ratio: {
    title: () => h(HelpLabel, { label: p('colRatio'), help: p('colRatioHelp') }),
    key: 'ratio',
    width: 80,
    align: 'center',
    render: (row: RowT) => {
      const ratio = worstRatio(row);
      return ratio === null ? '-' : formatPercent(ratio, 0);
    }
  },
  health: {
    title: p('colHealth'),
    key: 'health',
    width: 96,
    align: 'center',
    render: (row: RowT) =>
      h(NTag, { size: 'small', bordered: false, type: healthType[row.health] }, () => p(`health_${row.health}`))
  },
  analyzed_at: {
    title: p('colAnalyzedAt'),
    key: 'analyzed_at',
    width: 160,
    render: (row: RowT) => (row.cpu || row.memory ? formatDateTime(row.analyzed_at) : '-')
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('analyze')]),
    fixed: 'right',
    align: 'center',
    render: (row: RowT) =>
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => pickModule(row.module_id) }, () =>
        p('analyze')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_overprovision',
  columnMap,
  defaultKeys: [
    'name',
    'cpu_request',
    'cpu_p95',
    'cpu_suggested',
    'mem_request',
    'mem_p95',
    'mem_suggested',
    'ratio',
    'health',
    'cpu_p90',
    'cpu_p99',
    'mem_p90',
    'mem_p99',
    'workload',
    'replicas',
    'analyzed_at',
    'operate'
  ],
  columnMinWidths: { operate: 70 }
});

onMounted(async () => {
  cfg.initColumnConfig();
  ai.checkReady();
  fetchGetGrafanaSettings().then(({ data }) => {
    grafana.value = data ?? null;
  });
  await loadBoard();
  applyRouteSelection();
  drawRanking();
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-hidden">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="flex flex-wrap items-center gap-x-12px gap-y-8px">
        <NSelect
          v-model:value="sel.namespace"
          clearable
          filterable
          size="small"
          class="w-170px"
          :placeholder="p('namespace')"
          :options="namespaceOptions"
        />
        <NSelect
          :value="sel.moduleId"
          clearable
          filterable
          size="small"
          class="w-260px"
          :placeholder="p('pickModule')"
          :options="moduleOptions"
          :consistent-menu-width="false"
          @update:value="pickModule"
        />
        <span class="inline-flex items-center gap-4px text-12px opacity-80">
          <HelpLabel :label="p('window')" :help="p('windowHelp')" />
        </span>
        <NRadioGroup v-model:value="sel.window" size="small">
          <NRadioButton v-for="w in WINDOWS" :key="w" :value="w">{{ w }}</NRadioButton>
          <NRadioButton value="custom">{{ p('customRange') }}</NRadioButton>
        </NRadioGroup>
        <TimeRangeField v-if="custom" v-model="customRange" :clearable="false" />
        <span class="inline-flex items-center gap-4px text-12px opacity-80">
          <HelpLabel :label="p('basis')" :help="p('basisHelp')" />
        </span>
        <NRadioGroup v-model:value="sel.basis" size="small">
          <NRadioButton value="pod">{{ p('basisPod') }}</NRadioButton>
          <NRadioButton value="total">{{ p('basisTotal') }}</NRadioButton>
        </NRadioGroup>
        <div class="ml-auto flex items-center gap-8px">
          <GrafanaLink :url="toolbarGrafana" :label="p('invGrafanaOpen')" />
          <NButton size="small" secondary :loading="analyzing" @click="analyzeNow">{{ p('analyzeNow') }}</NButton>
          <NButton
            v-if="sel.moduleId"
            size="small"
            type="primary"
            :loading="ai.state.running"
            :disabled="!detail || ai.state.ready === false"
            :title="ai.state.ready === false ? ai.state.problem || p('aiNotReady') : ''"
            @click="analyzeWithAi"
          >
            {{ p('aiButton') }}
          </NButton>
          <NButton v-if="ai.state.running" size="small" @click="ai.stop">{{ t('common.cancel') }}</NButton>
        </div>
      </div>
    </NCard>

    <div v-if="sel.moduleId" class="min-h-0 flex-1 overflow-y-auto">
      <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
        <OverprovisionModulePanel
          :detail="detail"
          :loading="detailLoading"
          :basis="sel.basis"
          :prom="prom"
          :prom-loading="promLoading"
          :prom-error="promError"
          :ai="ai.state"
        />
        <div v-if="!detail && !detailLoading" class="text-13px opacity-70">
          {{ selectedRow ? p('noData') : '' }}
        </div>
      </NCard>
      <NCard v-if="selectedRow" :bordered="false" size="small" class="mt-10px rounded-16px shadow-sm">
        <InventoryWorkloadPanel
          :module-id="selectedRow.module_id"
          :namespace="selectedRow.namespace"
          :workload="selectedRow.workload"
          :grafana="grafana"
          :range="grafanaRange"
          :hours="inventoryHours"
          :refresh-key="inventoryKey"
        />
      </NCard>
      <NCard :bordered="false" size="small" class="mt-10px rounded-16px shadow-sm">
        <InventoryClusterPanel :grafana="grafana" :range="grafanaRange" :hours="inventoryHours" />
      </NCard>
    </div>

    <div v-else class="min-h-0 flex-1 flex-col gap-10px overflow-y-auto">
      <NCard :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
        <InventoryClusterPanel open :grafana="grafana" :range="grafanaRange" :hours="inventoryHours" />
      </NCard>

      <NCard :bordered="false" size="small" class="shrink-0 rounded-16px shadow-sm">
        <NSpin :show="boardLoading">
          <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-8px">
            <div v-for="cell in cells" :key="cell.key" class="cell">
              <div class="text-12px opacity-70"><HelpLabel :label="cell.label" :help="cell.help" /></div>
              <div :class="cell.key === 'analyzedAt' ? 'text-13px leading-24px' : 'text-16px leading-24px'">
                <NTag v-if="cell.type && cell.type !== 'default'" :type="cell.type" :bordered="false" size="small">
                  {{ cell.value }}
                </NTag>
                <span v-else>{{ cell.value }}</span>
              </div>
            </div>
          </div>
          <div v-if="board && !board.analyzed" class="mt-6px text-12px opacity-80">{{ p('notAnalyzed') }}</div>
          <div class="mt-8px">
            <div class="mb-2px flex flex-wrap items-center gap-8px">
              <HelpLabel :label="p('rankTitle')" :help="p('rankHelp')" class="text-12px opacity-80" />
              <NSelect v-model:value="rank.mode" size="tiny" class="w-130px" :options="rankModeOptions" />
              <NSelect v-model:value="rank.resource" size="tiny" class="w-110px" :options="rankResourceOptions" />
            </div>
            <div v-show="ranking.length" ref="domRef" class="h-150px w-full"></div>
            <div v-if="!ranking.length" class="h-40px flex-center text-12px opacity-70">{{ p('rankEmpty') }}</div>
          </div>
        </NSpin>
      </NCard>

      <div class="h-520px shrink-0 flex-col">
        <ListTablePanel
          :title="p('listTitle')"
          :help="p('listHelp')"
          :cfg="cfg"
          :loading="boardLoading"
          :data="listRows"
          :row-key="(row: any) => row.module_id"
          :remote="false"
          :empty-hint="p('notAnalyzed')"
          @refresh="loadBoard"
        >
          <template #suffix>
            <NSelect
              v-model:value="sel.health"
              clearable
              size="small"
              class="w-130px"
              :placeholder="p('health')"
              :options="healthOptions"
            />
          </template>
        </ListTablePanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cell {
  border-radius: 8px;
  padding: 4px 10px;
  background: rgba(128, 128, 128, 0.07);
}
</style>
