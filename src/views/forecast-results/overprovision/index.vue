<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NFormItemGi, NInput, NSelect, NSpin, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import OverprovisionDetailModal from '@/components/business/overprovision-detail-modal.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { type ECOption, useEcharts } from '@/hooks/common/echarts';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetOverprovision, fetchRunOverprovision } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores, formatPercent } from '@/utils/format';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'ForecastResultsOverprovision' });

/**
 * The resource dashboard (P10 A3): what the Pods of the configured modules request against what they used, what could be given back, and which
 * workloads are over-, under-provisioned or at risk. It shows stored results of the analysis (pkg/overprovision), measured data only: no
 * forecast takes part and no money is counted. One view: the totals and the ranking above, the workloads below, the detail in a window.
 */
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const WINDOWS = ['15m', '30m', '1h', '1d', '7d', '15d', '30d'];
const HEALTHS: Api.Overprovision.Health[] = ['risk', 'under', 'over', 'limited', 'ok', 'unknown'];

const search = reactive({
  window: '7d',
  namespace: null as string | null,
  health: null as string | null,
  basis: 'pod' as 'pod' | 'total',
  keyword: ''
});
const board = ref<Api.Overprovision.Board | null>(null);
const loading = ref(false);
const analyzing = ref(false);
const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  onChange: (page: number) => (pagination.page = page),
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});

const detail = reactive({ show: false, moduleId: null as number | null });

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchGetOverprovision(search.window);
    board.value = data ?? null;
    pagination.page = 1;
  } finally {
    loading.value = false;
  }
}

function resetSearch() {
  Object.assign(search, { window: '7d', namespace: null, health: null, basis: 'pod', keyword: '' });
  load();
}

async function analyzeNow() {
  analyzing.value = true;
  try {
    const { data } = await fetchRunOverprovision();
    if (data) {
      window.$message?.success(
        data.failed
          ? p('analyzePartial', { n: data.analyzed, failed: data.failed })
          : p('analyzedCount', { n: data.analyzed })
      );
    }
    await load();
  } finally {
    analyzing.value = false;
  }
}

const windowOptions = computed(() => WINDOWS.map(value => ({ label: `${p('window')}: ${value}`, value })));
const basisOptions = computed(() => [
  { label: `${p('basis')}: ${p('basisPod')}`, value: 'pod' },
  { label: `${p('basis')}: ${p('basisTotal')}`, value: 'total' }
]);
const healthOptions = computed(() => HEALTHS.map(value => ({ label: p(`health_${value}`), value })));
const namespaceOptions = computed(() =>
  [...new Set((board.value?.rows ?? []).map(row => row.namespace))].sort().map(value => ({ label: value, value }))
);

const rows = computed(() => {
  const keyword = search.keyword.trim().toLowerCase();
  return (board.value?.rows ?? []).filter(
    row =>
      (!search.namespace || row.namespace === search.namespace) &&
      (!search.health || row.health === search.health) &&
      (!keyword || `${row.name} ${row.namespace}/${row.workload}`.toLowerCase().includes(keyword))
  );
});

// ---- the totals

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

// ---- the ranking: the most each module (or namespace) could give back, over all replicas

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
  for (const row of board.value?.rows ?? []) {
    const result = rank.resource === 'cpu' ? row.cpu : row.memory;
    if (!result || result.reclaimable <= 0) continue;
    const value = (result.reclaimable * Math.max(row.replicas, 1)) / (rank.resource === 'cpu' ? 1 : GIB);
    const key = rank.mode === 'top' ? `${row.namespace}/${row.name}` : row.namespace;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
});

const { domRef, updateOptions } = useEcharts(
  () =>
    ({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
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
      axisLabel: { width: 180, overflow: 'truncate' }
    },
    series: [
      {
        type: 'bar',
        name: rank.resource === 'cpu' ? p('rankCpu') : p('rankMemory'),
        data: list.map(item => Number(item[1].toFixed(3))),
        itemStyle: { color: '#f0a020' },
        barMaxWidth: 18
      }
    ] as never
  }));
}
watch([ranking, () => t('page.overprovision.rankCpu')], drawRanking);

// ---- the workloads

type RowT = Api.Overprovision.Row;
const total = computed(() => search.basis === 'total');
const times = (row: RowT) => (total.value ? Math.max(row.replicas, 1) : 1);
const fmt = (resource: 'cpu' | 'memory', value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);

const requestOf = (row: RowT, resource: 'cpu' | 'memory') => {
  const r = row[resource];
  return r && r.request > 0 ? fmt(resource, r.request * times(row)) : '-';
};
const usageOf = (row: RowT, resource: 'cpu' | 'memory') => {
  const r = row[resource];
  if (!r || !r.points) return '-';
  const pod = resource === 'cpu' ? r.p95 : r.p99;
  const sum = resource === 'cpu' ? r.total_p95 : r.total_p99;
  return fmt(resource, total.value ? sum : pod);
};
const suggestedOf = (row: RowT, resource: 'cpu' | 'memory') => {
  const r = row[resource];
  return r && r.suggested > 0 ? fmt(resource, r.suggested * times(row)) : '-';
};
const worstRatio = (row: RowT) => {
  const ratios = [row.cpu, row.memory].filter(r => r && r.suggested > 0).map(r => r!.ratio);
  return ratios.length ? Math.max(...ratios) : null;
};
/** the most careful confidence and the highest risk of the two resources */
const LEVELS = ['low', 'medium', 'high'];
const confidenceOf = (row: RowT) => {
  const levels = [row.cpu, row.memory].filter(Boolean).map(r => r!.confidence);
  return levels.length ? levels.sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))[0] : null;
};
const riskOf = (row: RowT) => {
  const levels = [row.cpu, row.memory].filter(Boolean).map(r => r!.risk);
  return levels.length ? levels.sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0] : null;
};

const healthType: Record<string, 'default' | 'error' | 'warning' | 'success' | 'info'> = {
  risk: 'error',
  under: 'error',
  over: 'warning',
  limited: 'info',
  ok: 'success',
  unknown: 'default'
};
const riskType: Record<string, 'default' | 'error' | 'warning' | 'success'> = {
  high: 'error',
  medium: 'warning',
  low: 'success'
};

const resourceTitle = (key: string, help?: string) => (help ? () => h(HelpLabel, { label: p(key), help }) : p(key));

const columnMap: Record<string, any> = {
  name: { title: p('colName'), key: 'name', minWidth: 140, ellipsis: { tooltip: true } },
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
    width: 80,
    align: 'center',
    render: (row: RowT) => row.replicas || '-'
  },
  cpu_request: {
    title: p('colCpuRequest'),
    key: 'cpu_request',
    width: 110,
    render: (row: RowT) => requestOf(row, 'cpu')
  },
  cpu_usage: { title: p('colCpuUsage'), key: 'cpu_usage', width: 120, render: (row: RowT) => usageOf(row, 'cpu') },
  cpu_suggested: {
    title: p('colCpuSuggested'),
    key: 'cpu_suggested',
    width: 110,
    render: (row: RowT) => suggestedOf(row, 'cpu')
  },
  mem_request: {
    title: p('colMemRequest'),
    key: 'mem_request',
    width: 110,
    render: (row: RowT) => requestOf(row, 'memory')
  },
  mem_usage: { title: p('colMemUsage'), key: 'mem_usage', width: 130, render: (row: RowT) => usageOf(row, 'memory') },
  mem_suggested: {
    title: p('colMemSuggested'),
    key: 'mem_suggested',
    width: 120,
    render: (row: RowT) => suggestedOf(row, 'memory')
  },
  ratio: {
    title: resourceTitle('colRatio', p('colRatioHelp')),
    key: 'ratio',
    width: 90,
    align: 'center',
    render: (row: RowT) => {
      const ratio = worstRatio(row);
      return ratio === null ? '-' : formatPercent(ratio, 0);
    }
  },
  health: {
    title: p('colHealth'),
    key: 'health',
    width: 100,
    align: 'center',
    render: (row: RowT) =>
      h(NTag, { size: 'small', bordered: false, type: healthType[row.health] }, () => p(`health_${row.health}`))
  },
  confidence: {
    title: resourceTitle('colConfidence', p('colConfidenceHelp')),
    key: 'confidence',
    width: 100,
    align: 'center',
    render: (row: RowT) => {
      const level = confidenceOf(row);
      return level ? p(`level_${level}`) : '-';
    }
  },
  risk: {
    title: resourceTitle('colRisk', p('colRiskHelp')),
    key: 'risk',
    width: 80,
    align: 'center',
    render: (row: RowT) => {
      const level = riskOf(row);
      return level
        ? h(NTag, { size: 'small', bordered: false, type: riskType[level] }, () => p(`level_${level}`))
        : '-';
    }
  },
  analyzed_at: {
    title: p('colAnalyzedAt'),
    key: 'analyzed_at',
    width: 170,
    render: (row: RowT) => (row.cpu || row.memory ? formatDateTime(row.analyzed_at) : '-')
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('detail')]),
    fixed: 'right',
    align: 'center',
    render: (row: RowT) =>
      h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          secondary: true,
          onClick: () => {
            detail.moduleId = row.module_id;
            detail.show = true;
          }
        },
        () => p('detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_overprovision',
  columnMap,
  defaultKeys: [
    'name',
    'cpu_request',
    'cpu_suggested',
    'mem_request',
    'mem_suggested',
    'ratio',
    'health',
    'cpu_usage',
    'mem_usage',
    'confidence',
    'risk',
    'workload',
    'replicas',
    'analyzed_at',
    'operate'
  ],
  columnMinWidths: { operate: 80 }
});

watch(
  () => search.window,
  () => load()
);

onMounted(() => {
  cfg.initColumnConfig();
  load();
  drawRanking();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="4" @search="load" @reset="resetSearch">
      <NFormItemGi :span="4" class="list-search-select-field list-search-short-field">
        <NSelect v-model:value="search.window" :options="windowOptions" />
      </NFormItemGi>
      <NFormItemGi :span="4" class="list-search-select-field" :label="p('namespace')">
        <NSelect
          v-model:value="search.namespace"
          clearable
          filterable
          :placeholder="p('namespace')"
          :options="namespaceOptions"
        />
      </NFormItemGi>
      <NFormItemGi :span="4" class="list-search-select-field" :label="p('health')">
        <NSelect v-model:value="search.health" clearable :placeholder="p('health')" :options="healthOptions" />
      </NFormItemGi>
      <NFormItemGi :span="4" class="list-search-select-field">
        <NSelect v-model:value="search.basis" :options="basisOptions" />
      </NFormItemGi>
      <NFormItemGi :span="4" :label="p('keyword')">
        <NInput v-model:value="search.keyword" clearable :placeholder="p('keyword')" />
      </NFormItemGi>
    </ListSearchCard>

    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <NSpin :show="loading">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-16px gap-y-8px">
          <div v-for="cell in cells" :key="cell.key">
            <div class="text-12px opacity-70"><HelpLabel :label="cell.label" :help="cell.help" /></div>
            <div :class="cell.key === 'analyzedAt' ? 'text-14px leading-30px' : 'text-20px leading-30px'">
              <NTag v-if="cell.type && cell.type !== 'default'" :type="cell.type" :bordered="false" size="medium">
                {{ cell.value }}
              </NTag>
              <span v-else>{{ cell.value }}</span>
            </div>
          </div>
        </div>
        <div v-if="board && !board.analyzed" class="mt-8px text-13px opacity-80">{{ p('notAnalyzed') }}</div>
        <div class="mt-8px">
          <div class="mb-4px flex flex-wrap items-center gap-8px">
            <HelpLabel :label="p('rankTitle')" :help="p('rankHelp')" class="text-13px opacity-80" />
            <NSelect v-model:value="rank.mode" size="tiny" class="w-130px" :options="rankModeOptions" />
            <NSelect v-model:value="rank.resource" size="tiny" class="w-110px" :options="rankResourceOptions" />
          </div>
          <div v-show="ranking.length" ref="domRef" class="h-220px w-full"></div>
          <div v-if="!ranking.length" class="h-60px flex-center text-13px opacity-70">{{ p('rankEmpty') }}</div>
        </div>
      </NSpin>
    </NCard>

    <ListTablePanel
      :title="p('listTitle')"
      :help="`${p('listHelp')} ${p('windowHelp')} ${p('basisHelp')}`"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :row-key="(row: any) => row.module_id"
      :remote="false"
      :pagination="pagination"
      :empty-hint="p('notAnalyzed')"
      @refresh="load"
    >
      <template #suffix>
        <NButton size="small" type="primary" secondary :loading="analyzing" @click="analyzeNow">
          {{ p('analyzeNow') }}
        </NButton>
      </template>
    </ListTablePanel>

    <OverprovisionDetailModal v-model:show="detail.show" :module-id="detail.moduleId" :window="search.window" />
  </div>
</template>
