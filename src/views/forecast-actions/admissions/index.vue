<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NFormItemGi, NInput, NSelect, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListSearchCard from '@/components/business/list-search-card.vue';
import RecordDetailModal from '@/components/business/record-detail-modal.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { useForecastModules, windowStart, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { fetchGetAdmissions } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastActionsAdmissions' });

const MIB = 1024 * 1024;
const { t } = useI18n();
const { moduleOptions, moduleName, loadModules } = useForecastModules();
const search = reactive({
  moduleId: null as number | null,
  applied: null as 'true' | 'false' | null,
  keyword: '',
  hours: (24 * 7) as number | null
});

const appliedOptions = computed(() => [
  { label: t('page.forecast.admissions.applied'), value: 'true' },
  { label: t('page.forecast.admissions.refused'), value: 'false' }
]);
const hoursOptions = useWindowOptions();

// the list below reads the sort parameters, and a change of the sort searches it again
let searchList: () => void = () => {};
const { handleSorterChange, sortParams } = useTableSort(() => searchList());
const list = usePagedList<Api.Forecast.Admission>(async (page, pageSize) => {
  const { data } = await fetchGetAdmissions({
    module_id: search.moduleId ?? undefined,
    applied: search.applied === null ? undefined : search.applied === 'true',
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
  Object.assign(search, { moduleId: null, applied: null, keyword: '', hours: 24 * 7 });
}

const cpu = (value: number) => (value ? `${value} m` : '-');
const memory = (value: number) => (value ? `${Math.round(value / MIB)} MiB` : '-');
const change = (now: number, before: number, format: (value: number) => string) =>
  before && now && before !== now ? `${format(before)} → ${format(now)}` : format(now);

const detail = ref<Api.Forecast.Admission | null>(null);

const columnMap: Record<string, any> = {
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
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Admission) =>
      `${row.namespace}/${row.workload}${row.container ? ` (${row.container})` : ''}`
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
  gpu: {
    title: 'GPU',
    key: 'gpu',
    width: 80,
    align: 'center',
    render: (row: Api.Forecast.Admission) => row.gpu || '-'
  },
  reason: { title: t('page.forecast.admissions.reason'), key: 'reason', minWidth: 320, ellipsis: { tooltip: true } },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 100,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Admission) =>
      h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => (detail.value = row) }, () =>
        t('common.detail')
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_admissions',
  columnMap,
  defaultKeys: ['created_at', 'target', 'applied', 'cpu', 'reason', 'module', 'memory', 'gpu', 'version', 'operate']
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
        <NSelect v-model:value="search.applied" clearable :options="appliedOptions" />
      </NFormItemGi>
      <NFormItemGi :span="4" :label="t('common.keyword')">
        <NInput v-model:value="search.keyword" clearable @keyup.enter="list.search" />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="3"
        :label="t('page.forecast.evaluation.range')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>
    <ListTablePanel
      :title="t('page.forecast.admissions.title')"
      :help="t('page.forecast.admissions.help')"
      :cfg="cfg"
      :loading="list.loading.value"
      :data="list.rows.value"
      :pagination="list.pagination"
      :empty-hint="t('page.forecast.admissions.empty')"
      @refresh="list.reload"
      @sorter="handleSorterChange"
    />
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
              { label: 'CPU', value: detail ? `${detail.cpu_milli}m (${detail.original_cpu_milli}m)` : '' },
              {
                label: t('page.forecast.admissions.memory'),
                value: detail ? `${detail.memory_bytes} (${detail.original_memory_bytes})` : ''
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
