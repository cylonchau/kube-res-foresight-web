<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NInput, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import OverprovisionAiAdvice from '@/components/business/overprovision-ai-advice.vue';
import { useRouterPush } from '@/hooks/common/router';
import { useOverprovisionListState } from '@/hooks/business/use-overprovision-list-state';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetForecastModules, fetchGetOverprovisionResources } from '@/service/api';
import { formatBytes, formatCores } from '@/utils/format';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { operateProps } from '@/utils/operate-button';

defineOptions({ name: 'ForecastResultsOverprovision' });

/**
 * The resource dashboard, first level: the list of the modules. Choose a namespace or search, and open a module: its analysis is a page of its own (the second
 * level, `resource-analysis_overprovision-detail`), and coming back from it brings this list back as it was left. The rows are the modules of the module
 * management, every one of them, a row to a line and a page at a time (previous and next). The table has the CPU and memory requests and limits of one Pod of
 * each module, every one of them the answer of the Prometheus data source the module's dashboard metrics (Requests / Limits) point to; a module without such a
 * metric has a dash and the reason. The cluster has its own dashboard.
 */
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});
const { routerPushByKey } = useRouterPush();
const keep = useOverprovisionListState();

const modules = ref<Api.Forecast.Module[]>([]);
const modulesLoading = ref(false);
const resources = ref<Map<number, Api.Overprovision.ModuleResources>>(new Map());
const resourcesLoading = ref(false);
const resourcesError = ref('');
const resourcesPartial = ref(0);

/** every module of the module management, in the pages the server gives (200 at most a page), enabled or not */
async function loadModules() {
  modulesLoading.value = true;
  try {
    const all: Api.Forecast.Module[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const { data } = await fetchGetForecastModules({ page, page_size: 200 });
      if (!data) break;
      all.push(...data.list);
      if (!data.list.length || all.length >= data.total) break;
    }
    modules.value = all.sort((a, b) => a.id - b.id);
  } finally {
    modulesLoading.value = false;
  }
}

function reasonOf(error: unknown) {
  const response = (error as any)?.response;
  return response?.data?.msg || response?.data?.message || (error as any)?.message || '';
}

/** the requests and limits come in a request of their own, so the list is there at once and the figures follow */
let resourcesSeq = 0;
async function loadResources() {
  resourcesSeq += 1;
  const seq = resourcesSeq;
  resourcesLoading.value = true;
  resourcesError.value = '';
  try {
    const { data, error } = await fetchGetOverprovisionResources({ cancelled: () => seq !== resourcesSeq });
    if (seq !== resourcesSeq) return;
    if (!data) {
      resourcesError.value = reasonOf(error);
      return;
    }
    resources.value = new Map(data.rows.map(row => [row.module_id, row]));
    resourcesPartial.value = data.skipped;
  } finally {
    resourcesLoading.value = false;
  }
}

function reload() {
  loadModules();
  loadResources();
}

const namespaceOptions = computed(() =>
  [...new Set(modules.value.map(row => row.namespace))].sort().map(value => ({ label: value, value }))
);
const listRows = computed(() => {
  const keyword = keep.keyword.trim().toLowerCase();
  return modules.value.filter(
    row =>
      (!keep.namespace || row.namespace === keep.namespace) &&
      (!keyword || `${row.name} ${row.namespace} ${row.workload}`.toLowerCase().includes(keyword))
  );
});

// the page and its size stay in the list state, so coming back from a module lands on the same page; a new search starts on the first page
const pagination = reactive({
  page: keep.page,
  pageSize: keep.pageSize || getAdaptivePageSize(),
  pageSizes: getAdaptivePageSizes(),
  showSizePicker: true,
  onChange: (page: number) => {
    pagination.page = page;
    keep.page = page;
  },
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
    keep.pageSize = size;
    keep.page = 1;
  }
});
watch(
  () => [keep.namespace, keep.keyword],
  () => {
    pagination.page = 1;
    keep.page = 1;
  }
);

/** a module is opened as the second level; what is chosen here stays in the list state */
function open(row: Api.Forecast.Module) {
  routerPushByKey('resource-analysis_overprovision-detail', { query: { module: String(row.id) } });
}

// ---- the table: the requests and limits of one Pod, from Prometheus

type Field = 'cpu_request' | 'cpu_limit' | 'memory_request' | 'memory_limit';
const figure = (row: Api.Forecast.Module, field: Field) => {
  const got = resources.value.get(row.id);
  const value = got?.[field] ?? null;
  const memory = field.startsWith('memory');
  const text = value === null || value === undefined ? '-' : memory ? formatBytes(value, 2) : formatCores(value, 2);
  const why = got?.errors?.[field] || got?.errors?.all || '';
  if (text !== '-' || !why) return text;
  return h('span', { class: 'opacity-60', title: why }, '-');
};
const figureColumn = (key: Field, title: string) => ({
  title,
  key,
  width: 120,
  render: (row: Api.Forecast.Module) => figure(row, key)
});

const columnMap: Record<string, any> = {
  name: {
    title: p('colName'),
    key: 'name',
    minWidth: 200,
    // one line: the namespace and the workload are in the tooltip and in the columns of their own
    render: (row: Api.Forecast.Module) =>
      h(
        'span',
        { class: 'whitespace-nowrap', title: `${row.namespace}/${row.workload_kind}/${row.workload}` },
        row.enabled ? row.name : `${row.name} (${p('disabled')})`
      )
  },
  namespace: { title: p('namespace'), key: 'namespace', minWidth: 130, ellipsis: { tooltip: true } },
  workload: {
    title: p('colWorkload'),
    key: 'workload',
    minWidth: 200,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Module) => `${row.workload_kind}/${row.workload}`
  },
  cpu_request: figureColumn('cpu_request', p('colCpuRequest')),
  cpu_limit: figureColumn('cpu_limit', p('colCpuLimit')),
  memory_request: figureColumn('memory_request', p('colMemRequest')),
  memory_limit: figureColumn('memory_limit', p('colMemLimit')),
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([p('analyze')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(NButton, { size: 'tiny', ...operateProps('run'), onClick: () => open(row) }, () => p('analyze'))
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_overprovision_modules',
  columnMap,
  defaultKeys: [
    'name',
    'cpu_request',
    'cpu_limit',
    'memory_request',
    'memory_limit',
    'namespace',
    'workload',
    'operate'
  ],
  columnMinWidths: { operate: 70 }
});

onMounted(() => {
  cfg.initColumnConfig();
  reload();
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-hidden">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="filter-bar">
        <NSelect
          v-model:value="keep.namespace"
          clearable
          filterable
          size="small"
          class="w-180px"
          :placeholder="p('namespace')"
          :options="namespaceOptions"
        />
        <span class="w-260px">
          <NInput v-model:value="keep.keyword" clearable size="small" :placeholder="p('keyword')" />
        </span>
        <div class="filter-actions">
          <NTag v-if="resourcesError" size="small" :bordered="false" type="warning" :title="resourcesError">
            {{ p('resourcesFailed') }}
          </NTag>
          <NTag v-else-if="resourcesPartial" size="small" :bordered="false" type="warning">
            {{ p('promPartial', { n: resourcesPartial }) }}
          </NTag>
          <NButton v-if="resourcesError || resourcesPartial" size="small" secondary @click="loadResources">
            {{ p('retry') }}
          </NButton>
        </div>
      </div>
    </NCard>

    <OverprovisionAiAdvice />

    <div class="min-h-0 flex-1 flex-col">
      <ListTablePanel
        :title="p('listTitle')"
        :help="p('listHelp')"
        :cfg="cfg"
        :loading="modulesLoading || resourcesLoading"
        :data="listRows"
        :pagination="pagination"
        :row-key="(row: any) => row.id"
        :remote="false"
        :empty-hint="p('noModules')"
        @refresh="reload"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
