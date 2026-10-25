<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NSelect, NTag, useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { useForecastModules, windowStart, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { downloadAuditExport, fetchGetExecutions } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastActionsExecutions' });

const { t } = useI18n();
const message = useMessage();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  result: null as string | null,
  action: null as string | null,
  keyword: '',
  hours: (24 * 7) as number | null
});
const exporting = ref(false);

const resultOptions = computed(() =>
  ['applied', 'observed', 'held', 'conflict', 'error'].map(value => ({
    label: t(`page.forecast.recommendations.result_${value}`),
    value
  }))
);
const actionOptions = computed(() =>
  ['ScaleUp', 'ScaleDown', 'None'].map(value => ({ label: t(`page.forecast.executions.action_${value}`), value }))
);
const hoursOptions = useWindowOptions();

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Execution>(async (page, pageSize) => {
  const { data } = await fetchGetExecutions({
    module_id: search.moduleId ?? undefined,
    result: search.result ?? undefined,
    action: search.action ?? undefined,
    keyword: search.keyword.trim() || undefined,
    from: windowStart(search.hours),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

function resetSearch() {
  Object.assign(search, { moduleId: null, result: null, action: null, keyword: '', hours: 24 * 7 });
}

async function exportCsv() {
  exporting.value = true;
  try {
    await downloadAuditExport({
      kind: 'executions',
      module_id: search.moduleId ?? undefined,
      result: search.result ?? undefined,
      from: windowStart(search.hours)
    });
  } catch (error) {
    message.error(String((error as Error).message || error));
  } finally {
    exporting.value = false;
  }
}

const resultType = (result: string) =>
  result === 'applied'
    ? 'success'
    : result === 'error' || result === 'conflict'
      ? 'error'
      : result === 'held'
        ? 'warning'
        : 'default';

const columnMap: Record<string, any> = {
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.Execution) => formatDateTime(row.created_at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.Execution) => moduleName(row.module_id)
  },
  target: {
    title: t('page.forecast.recommendations.target'),
    key: 'target',
    width: 230,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Execution) => `${row.namespace}/${row.target_kind}/${row.target_name}`
  },
  current: {
    title: t('page.forecast.recommendations.current'),
    key: 'current',
    width: 90,
    align: 'center',
    sorter: true
  },
  ready: { title: t('page.forecast.recommendations.ready'), key: 'ready', width: 90, align: 'center' },
  desired: {
    title: t('page.forecast.recommendations.desired'),
    key: 'desired',
    width: 90,
    align: 'center',
    sorter: true
  },
  action: { title: t('page.forecast.recommendations.action'), key: 'action', width: 110, align: 'center' },
  result: {
    title: t('page.forecast.recommendations.result'),
    key: 'result',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Execution) =>
      h(NTag, { size: 'small', bordered: false, type: resultType(row.result) }, () =>
        t(`page.forecast.recommendations.result_${row.result}`, row.result)
      )
  },
  decision_version: {
    title: t('page.forecast.executions.decisionVersion'),
    key: 'decision_version',
    width: 120,
    align: 'center',
    sorter: true,
    render: (row: Api.Forecast.Execution) =>
      row.decision_version
        ? h(
            NButton,
            { size: 'small', text: true, type: 'primary', onClick: () => openSnapshot(row) },
            () => `v${row.decision_version}`
          )
        : '-'
  },
  reason: { title: t('page.forecast.evaluation.reason'), key: 'reason', minWidth: 260, ellipsis: { tooltip: true } },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 170,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Execution) =>
      row.decision_version
        ? h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openSnapshot(row) }, () =>
            t('page.forecast.executions.openSnapshot', { version: row.decision_version })
          )
        : '-'
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_execution',
  columnMap,
  defaultKeys: ['created_at', 'module', 'target', 'desired', 'result', 'operate']
});

const router = useRouter();
/** The snapshot an execution acted on: the recommendations page filtered to that module. */
function openSnapshot(row: Api.Forecast.Execution) {
  router.push({
    path: '/forecast-actions/recommendations',
    query: { module_id: String(row.module_id), version: String(row.decision_version) }
  });
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="4" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="6" :label="t('page.forecast.modules.name')">
        <NSelect
          v-model:value="search.moduleId"
          filterable
          clearable
          :options="moduleOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.name') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.recommendations.result')"
      >
        <NSelect
          v-model:value="search.result"
          clearable
          :options="resultOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.recommendations.result') })"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.recommendations.action')"
      >
        <NSelect
          v-model:value="search.action"
          clearable
          :options="actionOptions"
          :placeholder="t('common.selectField', { field: t('page.forecast.recommendations.action') })"
        />
      </NFormItemGi>
      <NFormItemGi class="list-search-short-field" :span="4" :label="t('common.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('page.forecast.executions.keywordPlaceholder')"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="4"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.recommendations.executions')"
      :help="t('page.forecast.recommendations.executionsHelp')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.executions.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    >
      <template #suffix>
        <NButton size="small" :loading="exporting" @click="exportCsv">
          {{ t('page.forecast.recommendations.export') }}
        </NButton>
      </template>
    </ListTablePanel>
  </div>
</template>
