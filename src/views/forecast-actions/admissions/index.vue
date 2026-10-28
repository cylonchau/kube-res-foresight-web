<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RecordDetailModal from '@/components/business/record-detail-modal.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { useForecastModules, lastHours, rangeParams } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetAdmissions, fetchBatchDeleteRecords } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatMilli } from '@/utils/format';
import { copyCell } from '@/utils/copy-cell';
import { reasonText } from '@/utils/reason';
import { operateWidth } from '@/utils/operate-width';

defineOptions({ name: 'ForecastActionsAdmissions' });

const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  applied: null as 'true' | 'false' | null,
  keyword: '',
  range: lastHours(24 * 7) as [number, number] | null
});

const appliedOptions = computed(() => [
  { label: t('page.forecast.admissions.applied'), value: 'true' },
  { label: t('page.forecast.admissions.refused'), value: 'false' }
]);

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Admission>(async (page, pageSize) => {
  const { data } = await fetchGetAdmissions({
    module_id: search.moduleId ?? undefined,
    applied: search.applied === null ? undefined : search.applied === 'true',
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
  const { data, error } = await fetchBatchDeleteRecords({ kind: 'admissions', ids: checkedRowKeys.value });
  if (error || !data) return;
  window.$message?.success(t('common.batchDone', { done: data.done }));
  checkedRowKeys.value = [];
  await list.reload();
}

function resetSearch() {
  Object.assign(search, { moduleId: null, applied: null, keyword: '', range: lastHours(24 * 7) });
}

const cpu = (value: number) => (value ? formatMilli(value) : '-');
const memory = (value: number) => (value ? formatBytes(value) : '-');
const change = (now: number, before: number, format: (value: number) => string) =>
  before && now && before !== now ? `${format(before)} → ${format(now)}` : format(now);

const detail = ref<Api.Forecast.Admission | null>(null);

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    sorter: true,
    render: (row: Api.Forecast.Admission) => formatDateTime(row.created_at)
  },
  module: {
    title: t('page.forecast.modules.name'),
    key: 'module',
    width: 150,
    resizable: true,
    render: (row: Api.Forecast.Admission) => moduleName(row.module_id)
  },
  target: {
    title: t('page.forecast.admissions.target'),
    key: 'target',
    minWidth: 240,
    render: (row: Api.Forecast.Admission) =>
      copyCell(`${row.namespace}/${row.workload}${row.container ? `/${row.container}` : ''}`)
  },
  applied: {
    title: t('page.forecast.admissions.result'),
    key: 'applied',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Admission) =>
      h(NTag, { size: 'small', bordered: false, type: row.applied ? 'success' : 'default' }, () =>
        t(row.applied ? 'page.forecast.admissions.applied' : 'page.forecast.admissions.refused')
      )
  },
  version: {
    title: t('page.forecast.recommendations.version'),
    key: 'version',
    width: 90,
    align: 'center',
    sorter: true
  },
  cpu: {
    title: 'CPU',
    key: 'cpu_milli',
    width: 170,
    render: (row: Api.Forecast.Admission) => change(row.cpu_milli, row.original_cpu_milli, cpu)
  },
  memory: {
    title: t('page.forecast.admissions.memory'),
    key: 'memory_bytes',
    width: 190,
    render: (row: Api.Forecast.Admission) => change(row.memory_bytes, row.original_memory_bytes, memory)
  },
  limits: {
    title: t('page.forecast.admissions.limits'),
    key: 'limits',
    width: 200,
    render: (row: Api.Forecast.Admission) =>
      row.limit_cpu_milli || row.limit_memory_bytes
        ? `${cpu(row.limit_cpu_milli)} / ${memory(row.limit_memory_bytes)}`
        : '-'
  },
  mode: {
    title: t('page.forecast.modules.mode'),
    key: 'mode',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Admission) => (row.mode ? t(`page.forecast.modules.mode_${row.mode}`) : '-')
  },
  algorithm: {
    title: t('page.forecast.recommendations.algorithm'),
    key: 'algorithm',
    width: 150,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Admission) => row.algorithm || '-'
  },
  workload_kind: {
    title: t('page.forecast.modules.workloadKind'),
    key: 'workload_kind',
    width: 120,
    render: (row: Api.Forecast.Admission) => row.workload_kind || '-'
  },
  gpu: {
    title: 'GPU',
    key: 'gpu',
    width: 80,
    align: 'center',
    render: (row: Api.Forecast.Admission) => row.gpu || '-'
  },
  reason: {
    title: t('page.forecast.admissions.reason'),
    key: 'reason',
    minWidth: 320,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Admission) => reasonText(row.reason) || '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([t('common.detail')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Admission) =>
      h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_admissions',
  columnMap,
  defaultKeys: [
    '__selection__',
    'created_at',
    'target',
    'applied',
    'cpu',
    'memory',
    'limits',
    'mode',
    'algorithm',
    'reason',
    'module',
    'gpu',
    'version',
    'workload_kind',
    'operate'
  ]
});

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  list.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="6" @search="list.search" @reset="resetSearch">
      <NFormItemGi class="list-search-select-field" :span="7" :label="t('page.forecast.modules.name')">
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
        :span="4"
        :label="t('page.forecast.admissions.result')"
      >
        <NSelect
          v-model:value="search.applied"
          clearable
          :options="appliedOptions"
          :placeholder="t('page.forecast.admissions.result')"
        />
      </NFormItemGi>
      <NFormItemGi :span="4" :label="t('common.keyword')">
        <NInput
          v-model:value="search.keyword"
          clearable
          :placeholder="t('common.keyword')"
          @keyup.enter="list.search"
        />
      </NFormItemGi>
      <NFormItemGi :span="9" :label="t('common.timeRange')">
        <TimeRangeField v-model="search.range" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.admissions.title')"
      :help="t('page.forecast.admissions.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.admissions.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    >
      <template #suffix>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>
    <RecordDetailModal
      :show="Boolean(detail)"
      :title="detail ? `${detail.namespace}/${detail.workload}${detail.container ? ' / ' + detail.container : ''}` : ''"
      :items="
        detail
          ? [
              { label: t('common.createTime'), value: detail ? formatDateTime(detail.created_at) : '' },
              { label: t('page.forecast.modules.name'), value: detail ? moduleName(detail.module_id) : '' },
              {
                label: t('page.forecast.admissions.result'),
                value: detail
                  ? t(detail.applied ? 'page.forecast.admissions.applied' : 'page.forecast.admissions.refused')
                  : ''
              },
              { label: t('page.forecast.detail.version'), value: detail?.version },
              { label: t('page.forecast.modules.workloadKind'), value: detail?.workload_kind },
              {
                label: t('page.forecast.modules.mode'),
                value: detail?.mode ? t(`page.forecast.modules.mode_${detail.mode}`) : ''
              },
              { label: t('page.forecast.recommendations.algorithm'), value: detail?.algorithm },
              { label: 'CPU requests', value: detail ? change(detail.cpu_milli, detail.original_cpu_milli, cpu) : '' },
              {
                label: t('page.forecast.admissions.memory'),
                value: detail ? change(detail.memory_bytes, detail.original_memory_bytes, memory) : ''
              },
              { label: 'CPU limits', value: detail ? cpu(detail.limit_cpu_milli) : '' },
              {
                label: t('page.forecast.admissions.limitMemory'),
                value: detail ? memory(detail.limit_memory_bytes) : ''
              },
              { label: 'GPU', value: detail?.gpu },
              { label: t('page.forecast.admissions.reason'), value: detail?.reason, pre: true }
            ]
          : []
      "
      @update:show="value => !value && (detail = null)"
    />
  </div>
</template>
