<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import ScaleOutcomeModal from '@/components/business/scale-outcome-modal.vue';
import SnapshotHistoryModal from '@/components/business/snapshot-history-modal.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetExecutions, fetchBatchDeleteRecords } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { copyCell } from '@/utils/copy-cell';
import { reasonText, scalingActionText } from '@/utils/reason';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'ForecastActionsExecutions' });

const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  result: null as string | null,
  action: null as string | null,
  keyword: '',
  range: lastHours(24 * 7) as [number, number] | null
});

const resultOptions = computed(() =>
  ['applied', 'observed', 'held', 'conflict', 'error'].map(value => ({
    label: t(`page.forecast.recommendations.result_${value}`),
    value
  }))
);
const actionOptions = computed(() =>
  ['ScaleUp', 'ScaleDown', 'None'].map(value => ({ label: t(`page.forecast.executions.action_${value}`), value }))
);

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Execution>(async (page, pageSize) => {
  const { data } = await fetchGetExecutions({
    module_id: search.moduleId ?? undefined,
    result: search.result ?? undefined,
    action: search.action ?? undefined,
    keyword: search.keyword.trim() || undefined,
    ...rangeParams(search.range),
    page,
    page_size: pageSize,
    ...sortParams()
  });
  return data;
});
searchList = () => {
  list.search();
};

const checkedRowKeys = ref<number[]>([]);
const batchActions = computed(() => [{ key: 'delete', label: t('common.delete'), danger: true }]);

async function runBatch() {
  const { data, error } = await fetchBatchDeleteRecords({ kind: 'executions', ids: checkedRowKeys.value });
  if (error || !data) return;
  window.$message?.success(t('common.batchDone', { done: data.done }));
  checkedRowKeys.value = [];
  await list.reload();
}

function resetSearch() {
  Object.assign(search, { moduleId: null, result: null, action: null, keyword: '', range: lastHours(24 * 7) });
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
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
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
    render: (row: Api.Forecast.Execution) => copyCell(`${row.namespace}/${row.target_kind}/${row.target_name}`)
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
  action: {
    title: t('page.forecast.recommendations.action'),
    key: 'action',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.Execution) => scalingActionText(row.action)
  },
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
        ? h(NButton, { size: 'small', text: true, type: 'primary', onClick: () => openSnapshot(row) }, () =>
            t('page.forecast.snapshots.versionShort', { version: row.decision_version })
          )
        : '-'
  },
  reason: {
    title: t('page.forecast.evaluation.reason'),
    key: 'reason',
    minWidth: 260,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Execution) => reasonText(row.reason) || '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([t('page.forecast.executions.openSnapshot', { version: 9999 })]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Execution) =>
      row.decision_version
        ? h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => openSnapshot(row) }, () =>
            t('page.forecast.executions.openSnapshot', { version: row.decision_version })
          )
        : '-'
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_execution',
  columnMap,
  defaultKeys: [
    '__selection__',
    'created_at',
    'module',
    'target',
    'current',
    'desired',
    'action',
    'result',
    'reason',
    'operate'
  ]
});

/** The snapshot an execution acted on, opened over this page: no other page is opened. */
const snapshotOf = ref<{ moduleId: number; version: number } | null>(null);
const showOutcomes = ref(false);
function openSnapshot(row: Api.Forecast.Execution) {
  snapshotOf.value = { moduleId: row.module_id, version: row.decision_version };
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
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
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
        <NButton size="small" secondary type="primary" @click="showOutcomes = true">
          {{ t('page.forecast.explain.aheadHistory') }}
        </NButton>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>
    <ScaleOutcomeModal v-model:show="showOutcomes" :module-id="search.moduleId" :module-name="moduleName" />
    <SnapshotHistoryModal
      :show="snapshotOf !== null"
      :module-id="snapshotOf?.moduleId ?? null"
      :module-name="snapshotOf ? moduleName(snapshotOf.moduleId) : ''"
      :focus-version="snapshotOf?.version ?? null"
      @update:show="value => !value && (snapshotOf = null)"
    />
  </div>
</template>
