<script setup lang="ts">
import { computed, h, reactive, ref, onMounted } from 'vue';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  NSpace,
  NCard,
  NForm,
  NGrid,
  NFormItemGi,
  NSelect,
  NTag,
  NCollapse,
  NCollapseItem,
  NGi,
  NPopconfirm,
  NEllipsis,
  NModal,
  NInput
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchBatchResetJobs, fetchGetJobTypes, fetchGetJobs, fetchResetJob } from '@/service/api/system';
import { useLoading } from '@sa/hooks';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';
import { operateWidth } from '@/utils/operate-width';

const { t } = useI18n();
const { loading, startLoading, endLoading } = useLoading(false);

interface SearchParams {
  jobType: string;
  targetKeyword: string;
  status: string | null;
  latest: string;
}

const searchParams = reactive<SearchParams>({
  jobType: '',
  targetKeyword: '',
  status: null,
  latest: 'true'
});

const tableData = ref<Api.System.Job[]>([]);
const showResultModal = ref(false);
const currentResult = ref('');
const checkedRowKeys = ref<number[]>([]);
// The filter's options come from the server (distinct job types actually
// recorded plus the seeded task definitions) rather than a hardcoded list
// that silently drifts whenever a task type is added or renamed.
const jobTypes = ref<string[]>([]);

function jobTypeLabel(value: string) {
  return value;
}

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  itemCount: 0,
  onChange: (page: number) => {
    pagination.page = page;
    getTableData();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    getTableData();
  }
});

const { handleSorterChange, sortParams } = useTableSort(() => {
  pagination.page = 1;
  getTableData();
});

async function getTableData() {
  startLoading();
  const { data } = await fetchGetJobs({
    page: pagination.page,
    page_size: pagination.pageSize,
    job_type: searchParams.jobType || undefined,
    target_keyword: searchParams.targetKeyword || undefined,
    status: searchParams.status || undefined,
    latest: searchParams.latest === 'true' ? true : undefined,
    ...sortParams()
  });
  if (data) {
    tableData.value = data.list;
    pagination.itemCount = data.total;
  }
  endLoading();
}

const statusOptions = computed<NaiveUI.SelectOptionOf<string | null>[]>(() => [
  { label: t('common.allStatuses'), value: null },
  { label: t('page.job.status.pending'), value: 'pending' },
  { label: t('page.job.status.running'), value: 'running' },
  { label: t('page.job.status.success'), value: 'success' },
  { label: t('page.job.status.failed'), value: 'failed' }
]);

const latestOptions = computed(() => [
  { label: t('page.job.latestOnly'), value: 'true' },
  { label: t('page.job.allRecords'), value: 'false' }
]);

const jobTypeOptions = computed(() => [
  { label: t('common.allJobTypes'), value: '' },
  ...jobTypes.value.map(type => ({ label: type, value: type }))
]);

async function loadJobTypes() {
  const { data } = await fetchGetJobTypes();
  jobTypes.value = data || [];
}

const columnMap: Record<string, any> = {
  __selection__: {
    type: 'selection',
    width: 48,
    resizable: true,
    align: 'center'
  },
  id: {
    title: t('common.id'),
    key: 'id',
    width: 80,
    align: 'center',
    resizable: true,
    sorter: true
  },
  job_type: {
    title: t('page.job.columns.jobType'),
    key: 'job_type',
    width: 100,
    align: 'center',
    resizable: true,
    sorter: true,
    render(row: Api.System.Job) {
      return h(NTag, { type: 'info', bordered: false }, { default: () => jobTypeLabel(row.job_type) });
    }
  },
  target_name: {
    title: t('page.job.columns.targetName'),
    key: 'target_name',
    width: 150,
    align: 'center',
    resizable: true,
    sorter: true
  },
  status: {
    title: t('page.job.columns.status'),
    key: 'status',
    width: 100,
    align: 'center',
    resizable: true,
    sorter: true,
    render(row: Api.System.Job) {
      const typeMap: Record<string, 'default' | 'primary' | 'success' | 'error'> = {
        pending: 'default',
        running: 'primary',
        success: 'success',
        failed: 'error'
      };
      return h(
        NTag,
        { type: typeMap[row.status] || 'default', bordered: false },
        { default: () => t(`page.job.status.${row.status}`) }
      );
    }
  },
  scheduled_at: {
    title: t('page.job.columns.scheduledAt'),
    key: 'scheduled_at',
    width: 180,
    align: 'center',
    resizable: true,
    sorter: true,
    render: (row: Api.System.Job) => formatDateTime(row.scheduled_at)
  },
  started_at: {
    title: t('page.job.columns.startedAt'),
    key: 'started_at',
    width: 180,
    align: 'center',
    resizable: true,
    sorter: true,
    render: (row: Api.System.Job) => formatDateTime(row.started_at)
  },
  finished_at: {
    title: t('page.job.columns.finishedAt'),
    key: 'finished_at',
    width: 180,
    align: 'center',
    resizable: true,
    sorter: true,
    render: (row: Api.System.Job) => formatDateTime(row.finished_at)
  },
  retry_count: {
    title: t('page.job.columns.retryCount'),
    key: 'retry_count',
    width: 80,
    align: 'center',
    resizable: true,
    sorter: true
  },
  result: {
    title: t('page.job.columns.result'),
    key: 'result',
    width: 320,
    align: 'left',
    resizable: true,
    render(row: Api.System.Job) {
      const result = row.result || '-';
      return h(
        NButton,
        {
          text: true,
          class: 'job-result-button',
          onClick: () => {
            currentResult.value = result;
            showResultModal.value = true;
          }
        },
        {
          default: () => h(NEllipsis, { lineClamp: 1, tooltip: false }, { default: () => result })
        }
      );
    }
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([t('page.job.reset')]),
    align: 'center',
    fixed: 'right',
    render(row: Api.System.Job) {
      return h(
        NPopconfirm,
        {
          onPositiveClick: async () => {
            const { error } = await fetchResetJob(row.id);
            if (!error) {
              window.$message?.success(t('common.modifySuccess'));
              getTableData();
            }
          }
        },
        {
          trigger: () => h(NButton, { size: 'tiny', type: 'warning' }, { default: () => t('page.job.reset') }),
          default: () => t('page.job.resetConfirm')
        }
      );
    }
  }
};

const defaultKeys = [
  '__selection__',
  'id',
  'job_type',
  'target_name',
  'status',
  'scheduled_at',
  'started_at',
  'finished_at',
  'retry_count',
  'result',
  'operate'
];

const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({
  pageCode: 'task_center_audit',
  columnMap,
  defaultKeys
});

function resetSearchParams() {
  searchParams.jobType = '';
  searchParams.targetKeyword = '';
  searchParams.status = null;
  searchParams.latest = 'true';
  pagination.page = 1;
  getTableData();
}

const canBatchReset = computed(() => checkedRowKeys.value.length > 0);

async function handleBatchReset() {
  if (!canBatchReset.value) return;
  const { data, error } = await fetchBatchResetJobs(checkedRowKeys.value);
  if (error) return;

  const reset = data?.reset ?? 0;
  const requested = data?.requested ?? checkedRowKeys.value.length;
  // A job a worker already claimed is skipped server-side rather than yanked
  // out from under it, so say how many actually moved back to pending.
  if (reset < requested) {
    window.$message?.warning(t('page.job.batchResetPartial', { reset, requested }));
  } else {
    window.$message?.success(t('common.modifySuccess'));
  }
  checkedRowKeys.value = [];
  getTableData();
}

onMounted(() => {
  getTableData();
  loadJobTypes();
  initColumnConfig();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="searchParams" label-placement="top" :show-feedback="false">
            <NGrid class="list-search-row" :cols="24" :x-gap="24">
              <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.job.columns.jobType')">
                <NSelect
                  v-model:value="searchParams.jobType"
                  :placeholder="t('page.job.selectTaskType')"
                  :options="jobTypeOptions"
                  @update:value="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi class="list-search-select-field" :span="5" :label="t('page.job.columns.targetName')">
                <NInput
                  v-model:value="searchParams.targetKeyword"
                  clearable
                  :placeholder="t('page.job.targetKeywordPlaceholder')"
                  @keyup.enter="getTableData"
                  @clear="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="5"
                :label="t('page.job.columns.status')"
              >
                <NSelect
                  v-model:value="searchParams.status"
                  :placeholder="t('page.job.selectStatus')"
                  :options="statusOptions"
                  @update:value="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="t('page.job.latestOnly')"
              >
                <NSelect
                  v-model:value="searchParams.latest"
                  :placeholder="t('common.selectField', { field: t('page.job.latestOnly') })"
                  :options="latestOptions"
                  @update:value="getTableData"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="5">
                <NSpace justify="end" class="w-full">
                  <NButton @click="resetSearchParams">{{ t('common.reset') }}</NButton>
                  <NButton type="primary" @click="getTableData">{{ t('common.search') }}</NButton>
                </NSpace>
              </NGi>
            </NGrid>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>

    <NCard :bordered="false" size="small" class="flex-1 rounded-16px shadow-sm overflow-hidden">
      <div class="h-full flex-col">
        <TableHeaderOperation
          v-model:columns="columnChecks"
          v-model:density="density"
          class="pb-12px"
          :loading="loading"
          :show-add="false"
          :show-delete="false"
          @refresh="getTableData"
        >
          <template #prefix>
            <NPopconfirm @positive-click="handleBatchReset">
              <template #trigger>
                <NButton size="small" type="warning" ghost :disabled="!canBatchReset">
                  {{ t('page.job.batchReset') }}
                </NButton>
              </template>
              {{ t('page.job.batchResetConfirm', { count: checkedRowKeys.length }) }}
            </NPopconfirm>
          </template>
        </TableHeaderOperation>
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="tableData"
            :pagination="pagination"
            :row-key="row => row.id"
            hide-synthetic-id
            :size="density"
            :scroll-x="1500"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @update:checked-row-keys="val => (checkedRowKeys = val as number[])"
            @update:sorter="handleSorterChange"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NModal v-model:show="showResultModal" preset="card" :title="t('page.job.columns.result')" class="w-720px">
      <NInput :value="currentResult" type="textarea" readonly :autosize="{ minRows: 6, maxRows: 18 }" />
    </NModal>
  </div>
</template>

<style scoped>
.job-result-button {
  max-width: 100%;
  justify-content: flex-start;
}
</style>
