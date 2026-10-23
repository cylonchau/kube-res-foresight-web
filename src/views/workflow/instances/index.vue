<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItem,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  NTooltip,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useLoading } from '@sa/hooks';
import {
  fetchBatchDeleteWorkflowInstances,
  fetchDeleteWorkflowInstance,
  fetchGetWorkflowDefs,
  fetchGetWorkflowInstances
} from '@/service/api';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import WorkflowInstanceDrawer from '@/components/business/workflow-instance-drawer.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';

const { t } = useI18n();
const message = useMessage();

const PAGE_CODE = 'workflow_instances_global';
const { loading, startLoading, endLoading } = useLoading(false);

const searchForm = reactive({
  workflow_key: 'all',
  status: 'all',
  requester_name: ''
});

const statusOptions = [
  { label: t('page.workflow.instances.statusAll'), value: 'all' },
  { label: t('page.workflow.instances.statusRunning'), value: 'running' },
  { label: t('page.workflow.instances.statusCompleted'), value: 'completed' },
  { label: t('page.workflow.instances.statusRejected'), value: 'rejected' },
  { label: t('page.workflow.instances.statusFailed'), value: 'failed' }
];

const workflows = ref<Api.Telegram.WorkflowDef[]>([]);
const instances = ref<Api.Telegram.WorkflowInstance[]>([]);

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  itemCount: 0,
  onChange: (page: number) => {
    pagination.page = page;
    loadInstances();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    loadInstances();
  }
});

function statusTag(status: string) {
  switch (status) {
    case 'running':
      return { type: 'info' as const, label: t('page.workflow.instances.statusTagRunning') };
    case 'completed':
      return { type: 'success' as const, label: t('page.workflow.instances.statusTagCompleted') };
    case 'rejected':
      return { type: 'error' as const, label: t('page.workflow.instances.statusTagRejected') };
    case 'failed':
      return { type: 'error' as const, label: t('page.workflow.instances.statusTagFailed') };
    default:
      return { type: 'default' as const, label: status };
  }
}

function requesterDisplay(row: Api.Telegram.WorkflowInstance): string {
  return row.requester_name || '-';
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 80, align: 'center', resizable: true },
  workflow_key: {
    title: t('page.workflow.instances.columns.workflowKey'),
    key: 'workflow_key',
    width: 180,
    resizable: true,
    render(row: Api.Telegram.WorkflowInstance) {
      // The defined title ("域名采购全流程审批"), not the raw key — the key
      // is still available as a tooltip for anyone who needs it verbatim.
      const title = workflows.value.find(w => w.workflow_key === row.workflow_key)?.name || row.workflow_key;
      return h(
        NTooltip,
        { trigger: 'hover' },
        {
          trigger: () =>
            h(NTag, { size: 'small', type: 'primary', bordered: false, round: true }, { default: () => title }),
          default: () => row.workflow_key
        }
      );
    }
  },
  business_type: {
    title: t('page.workflow.instances.businessType'),
    key: 'business_type',
    width: 130,
    resizable: true,
    render: (row: Api.Telegram.WorkflowInstance) => row.business_type || '-'
  },
  requester_name: {
    title: t('page.workflow.instances.columns.requesterName'),
    key: 'requester_name',
    width: 130,
    resizable: true,
    render: (row: Api.Telegram.WorkflowInstance) => requesterDisplay(row)
  },
  current_state: {
    title: t('page.workflow.instances.columns.currentState'),
    key: 'current_state',
    width: 130,
    resizable: true,
    render(row: Api.Telegram.WorkflowInstance) {
      return h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => row.current_state });
    }
  },
  status: {
    title: t('common.status'),
    key: 'status',
    width: 100,
    align: 'center',
    resizable: true,
    render(row: Api.Telegram.WorkflowInstance) {
      const tag = statusTag(row.status);
      return h(NTag, { size: 'small', type: tag.type, bordered: false }, { default: () => tag.label });
    }
  },
  created_at: {
    title: t('page.workflow.instances.columns.createdAt'),
    key: 'created_at',
    width: 170,
    resizable: true,
    render: (row: Api.Telegram.WorkflowInstance) => formatDateTime(row.created_at)
  },
  updated_at: {
    title: t('common.updateTime'),
    key: 'updated_at',
    width: 170,
    resizable: true,
    render: (row: any) => formatDateTime(row.updated_at)
  },
  finished_at: {
    title: t('page.workflow.instances.finishedAt'),
    key: 'finished_at',
    width: 170,
    resizable: true,
    render: (row: any) => (row.finished_at ? formatDateTime(row.finished_at) : '-')
  },
  business_id: {
    title: t('page.workflow.instances.columns.businessId'),
    key: 'business_id',
    width: 100,
    align: 'center',
    resizable: true
  },
  requester_user_id: {
    title: t('page.workflow.instances.linkedSystemUserId'),
    key: 'requester_user_id',
    width: 130,
    align: 'center',
    resizable: true,
    render: (row: any) => row.requester_user_id ?? '-'
  },
  requester_telegram_user_id: {
    title: t('page.workflow.instances.linkedTelegramUser'),
    key: 'requester_telegram_user_id',
    width: 150,
    align: 'center',
    resizable: true,
    render: (row: any) => row.requester_telegram_user_id || '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 140,
    fixed: 'right',
    align: 'center',
    render(row: Api.Telegram.WorkflowInstance) {
      return h(
        NSpace,
        { justify: 'center', size: 6 },
        {
          default: () => [
            h(
              NButton,
              { size: 'tiny', type: 'primary', ghost: true, onClick: () => viewInstanceDetail(row) },
              { default: () => t('common.detail') }
            ),
            h(
              NPopconfirm,
              { onPositiveClick: () => deleteInstance(row) },
              {
                trigger: () =>
                  h(NButton, { size: 'tiny', type: 'error', ghost: true }, { default: () => t('common.delete') }),
                default: () => t('common.confirmDelete')
              }
            )
          ]
        }
      );
    }
  }
};

const defaultOrder = [
  '__selection__',
  'id',
  'workflow_key',
  'business_type',
  'requester_name',
  'current_state',
  'status',
  'created_at',
  'operate'
];

const {
  density,
  tableColumns,
  columnChecks,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({
  pageCode: PAGE_CODE,
  columnMap,
  defaultKeys: defaultOrder
});

async function loadWorkflows() {
  try {
    const { data } = await fetchGetWorkflowDefs({ page: 1, page_size: 100 });
    if (data) workflows.value = data.list || [];
  } catch {}
}

const checkedRowKeys = ref<number[]>([]);

async function loadInstances() {
  startLoading();
  try {
    const { data } = await fetchGetWorkflowInstances({
      page: pagination.page,
      page_size: pagination.pageSize,
      workflow_key: searchForm.workflow_key !== 'all' ? searchForm.workflow_key : undefined,
      status: searchForm.status !== 'all' ? searchForm.status : undefined,
      requester_name: searchForm.requester_name.trim() || undefined
    });
    if (data) {
      instances.value = data.list || [];
      pagination.itemCount = data.total || 0;
    }
    // A row selected before this reload may no longer be on the page (or in
    // the filtered result at all) — drop it rather than leave the batch
    // button armed against a ticket that isn't showing anymore.
    checkedRowKeys.value = [];
  } catch (err: any) {
    message.error(err.message || t('page.workflow.instances.loadFailed'));
  } finally {
    endLoading();
  }
}

function submitSearch() {
  pagination.page = 1;
  loadInstances();
}

function resetSearch() {
  searchForm.workflow_key = 'all';
  searchForm.status = 'all';
  searchForm.requester_name = '';
  submitSearch();
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return;
  try {
    await fetchBatchDeleteWorkflowInstances(checkedRowKeys.value);
    message.success(t('page.workflow.instances.deleteSuccess'));
    checkedRowKeys.value = [];
    loadInstances();
  } catch (err: any) {
    message.error(err.message || t('page.workflow.instances.deleteFailed'));
  }
}

const instanceDrawerVisible = ref(false);
const selectedInstance = ref<Api.Telegram.WorkflowInstance | null>(null);

function viewInstanceDetail(row: Api.Telegram.WorkflowInstance) {
  selectedInstance.value = row;
  instanceDrawerVisible.value = true;
}

async function deleteInstance(row: Api.Telegram.WorkflowInstance) {
  try {
    await fetchDeleteWorkflowInstance(row.id);
    message.success(t('page.workflow.instances.deleteSuccess'));
    loadInstances();
  } catch (err: any) {
    message.error(err.message || t('page.workflow.instances.deleteFailed'));
  }
}

onMounted(() => {
  initColumnConfig();
  loadWorkflows();
  loadInstances();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <!-- Top Search Card matching Zone pattern -->
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse compact-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="searchForm" label-placement="top" :show-feedback="false">
            <div class="list-search-row">
              <NFormItem class="list-search-item list-search-main" :label="t('page.workflow.instances.searchWorkflow')">
                <NSelect
                  v-model:value="searchForm.workflow_key"
                  :placeholder="t('common.selectField', { field: t('page.workflow.instances.searchWorkflow') })"
                  :options="[
                    { label: t('page.workflow.instances.allWorkflows'), value: 'all' },
                    ...workflows.map(w => ({ label: `${w.name} (${w.workflow_key})`, value: w.workflow_key }))
                  ]"
                  @update:value="submitSearch"
                />
              </NFormItem>
              <NFormItem class="list-search-item list-search-short-field" :label="t('common.status')">
                <NSelect
                  v-model:value="searchForm.status"
                  :placeholder="t('common.selectField', { field: t('common.status') })"
                  :options="statusOptions"
                  @update:value="submitSearch"
                />
              </NFormItem>
              <NFormItem
                class="list-search-item list-search-short-field"
                :label="t('page.workflow.instances.columns.requesterName')"
              >
                <NInput
                  v-model:value="searchForm.requester_name"
                  :placeholder="t('page.workflow.instances.searchRequesterPlaceholder')"
                  clearable
                  @keyup.enter="submitSearch"
                  @clear="submitSearch"
                />
              </NFormItem>
              <div class="list-search-actions">
                <NSpace>
                  <NButton type="primary" @click="submitSearch">
                    {{ t('common.search') }}
                  </NButton>
                  <NButton @click="resetSearch">
                    {{ t('common.reset') }}
                  </NButton>
                </NSpace>
              </div>
            </div>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>

    <!-- Main Table Card matching Zone pattern -->
    <NCard :bordered="false" size="small" class="flex-1 rounded-16px shadow-sm overflow-hidden">
      <div class="h-full flex-col">
        <TableHeaderOperation
          v-model:columns="columnChecks"
          v-model:density="density"
          class="pb-12px"
          :loading="loading"
          :show-add="false"
          :show-delete="true"
          :disabled-delete="checkedRowKeys.length === 0"
          @delete="handleBatchDelete"
          @refresh="loadInstances"
        />
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="instances"
            :pagination="pagination"
            :row-key="row => row.id"
            :checked-row-keys="checkedRowKeys"
            :size="density"
            :scroll-x="900"
            class="h-full"
            flex-height
            @update:checked-row-keys="keys => (checkedRowKeys = keys as number[])"
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <WorkflowInstanceDrawer
      v-model:show="instanceDrawerVisible"
      :instance="selectedInstance"
      :workflows="workflows"
      @action-executed="loadInstances"
    />
  </div>
</template>
