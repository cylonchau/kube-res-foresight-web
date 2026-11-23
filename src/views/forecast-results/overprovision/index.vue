<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NButton, NCard, NInput, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { useRouterPush } from '@/hooks/common/router';
import { useOverprovisionListState } from '@/hooks/business/use-overprovision-list-state';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetForecastModules, fetchGetOverprovisionResources } from '@/service/api';
import { formatBytes, formatCores } from '@/utils/format';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'ForecastResultsOverprovision' });

/**
 * The resource dashboard, first level: the list of the modules. Choose a namespace or search, and open a module: its analysis is a page of its own (the second
 * level, `forecast-results_overprovision-detail`), and coming back from it brings this list back as it was left. The table has the CPU and memory requests and
 * limits of one Pod of each module, every one of them the answer of the Prometheus data source of the module's metric mapping; a module without such a metric
 * has a dash and the reason. The cluster has its own dashboard.
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

/** the requests and limits come in a request of their own, so the list is there at once and the figures follow */
async function loadResources() {
  resourcesLoading.value = true;
  resourcesError.value = '';
  try {
    const { data, error } = await fetchGetOverprovisionResources();
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

/** a module is opened as the second level; what is chosen here stays in the list state */
function open(row: Api.Forecast.Module) {
  routerPushByKey('forecast-results_overprovision-detail', { query: { module: String(row.id) } });
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
    minWidth: 220,
    render: (row: Api.Forecast.Module) =>
      h('div', { class: 'leading-18px' }, [
        h('div', row.name),
        h('div', { class: 'text-11px opacity-60' }, `${row.namespace}/${row.workload_kind}/${row.workload}`)
      ])
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
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => open(row) }, () => p('analyze'))
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

    <div class="min-h-0 flex-1 flex-col">
      <ListTablePanel
        :title="p('listTitle')"
        :help="p('listHelp')"
        :cfg="cfg"
        :loading="modulesLoading || resourcesLoading"
        :data="listRows"
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
