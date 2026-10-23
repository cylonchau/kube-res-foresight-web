<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useLoading } from '@sa/hooks';
import {
  fetchBatchDeleteWorkflowDefs,
  fetchCreateWorkflowDef,
  fetchDeleteWorkflowDef,
  fetchGetWorkflowDefs,
  fetchUpdateWorkflowDef
} from '@/service/api';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { guardRoleLabel } from '@/utils/workflow';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import PipelineFlowchart from '@/views/workflow/components/pipeline-flowchart.vue';

const { t } = useI18n();
const message = useMessage();

const PAGE_CODE = 'workflow_pipeline_manage';
const { loading, startLoading, endLoading } = useLoading(false);

const rawWorkflows = ref<Api.Telegram.WorkflowDef[]>([]);
const checkedRowKeys = ref<string[]>([]);
const searchForm = reactive({
  keyword: '',
  driver: 'all',
  status: 'all' as 'all' | '1' | '0'
});

const driverOptions = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('page.workflow.pipelines.driverOptions.telegram'), value: 'telegram' },
  { label: t('page.workflow.pipelines.driverOptions.msteams'), value: 'msteams' },
  { label: t('page.workflow.pipelines.driverOptions.slack'), value: 'slack' },
  { label: t('page.workflow.pipelines.driverOptions.generic'), value: 'generic' }
]);

const statusOptions = computed(() => [
  { label: t('common.allStatuses'), value: 'all' },
  { label: t('common.enable'), value: '1' },
  { label: t('common.disable'), value: '0' }
]);

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  itemCount: 0,
  onChange: (page: number) => {
    pagination.page = page;
    loadWorkflows();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    loadWorkflows();
  }
});

const filteredWorkflows = computed(() => {
  return rawWorkflows.value.filter(item => {
    if (searchForm.keyword.trim()) {
      const kw = searchForm.keyword.trim().toLowerCase();
      const matchKey = item.workflow_key?.toLowerCase().includes(kw);
      const matchName = item.name?.toLowerCase().includes(kw);
      const matchDesc = item.description?.toLowerCase().includes(kw);
      if (!matchKey && !matchName && !matchDesc) return false;
    }
    if (searchForm.driver !== 'all' && (item.driver || 'telegram') !== searchForm.driver) {
      return false;
    }
    if (searchForm.status !== 'all') {
      const isEnabled = searchForm.status === '1';
      if (Boolean(item.enabled) !== isEnabled) return false;
    }
    return true;
  });
});

const paginatedWorkflows = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredWorkflows.value.slice(start, start + pagination.pageSize);
});

function driverTagInfo(driver?: string) {
  switch (driver) {
    case 'telegram':
      return { label: 'Telegram', type: 'info' as const };
    case 'msteams':
      return { label: 'MS Teams', type: 'primary' as const };
    case 'slack':
      return { label: 'Slack', type: 'warning' as const };
    case 'generic':
      return { label: t('page.workflow.pipelines.driverGeneric'), type: 'default' as const };
    default:
      return { label: driver || 'Telegram', type: 'info' as const };
  }
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    message.success(t('page.workflow.pipelines.copiedToClipboard'));
  }
}

// Quick toggle status
async function handleToggleStatus(row: Api.Telegram.WorkflowDef, value: boolean) {
  const prev = row.enabled;
  row.enabled = value;
  try {
    const { error } = await fetchUpdateWorkflowDef(row.workflow_key, {
      workflow_key: row.workflow_key,
      name: row.name,
      driver: row.driver || 'telegram',
      description: row.description,
      initial_state: row.initial_state,
      pipeline_json: row.pipeline_json,
      enabled: value
    });
    if (error) {
      row.enabled = prev;
      message.error(error.message || t('page.workflow.pipelines.updateStatusFailed'));
    } else {
      message.success(
        value ? t('page.workflow.pipelines.workflowEnabled') : t('page.workflow.pipelines.workflowDisabled')
      );
    }
  } catch (err: any) {
    row.enabled = prev;
    message.error(err.message || t('page.workflow.pipelines.updateStatusFailed'));
  }
}

// Table columns mapping
const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: {
    title: t('common.id'),
    key: 'id',
    width: 70,
    align: 'center',
    resizable: true
  },
  workflow_key: {
    title: t('page.workflow.pipelines.columns.workflowKey'),
    key: 'workflow_key',
    width: 220,
    resizable: true,
    render(row: Api.Telegram.WorkflowDef) {
      return h('div', { class: 'flex items-center gap-6px' }, [
        h(
          NTag,
          { type: 'primary', size: 'small', bordered: false, class: 'font-mono' },
          { default: () => row.workflow_key }
        ),
        h(
          NButton,
          {
            text: true,
            size: 'tiny',
            title: t('common.copy'),
            onClick: () => copyToClipboard(row.workflow_key)
          },
          { default: () => h('span', { class: 'i-carbon-copy text-12px text-gray-400 hover:text-blue-500' }) }
        )
      ]);
    }
  },
  name: {
    title: t('page.workflow.pipelines.columns.name'),
    key: 'name',
    width: 200,
    resizable: true,
    render(row: Api.Telegram.WorkflowDef) {
      return h('div', { class: 'flex-col gap-2px' }, [
        h('span', { class: 'font-semibold text-13px text-gray-800 dark:text-gray-100' }, row.name),
        row.description ? h('span', { class: 'text-11px text-gray-400 truncate max-w-220px' }, row.description) : null
      ]);
    }
  },
  driver: {
    title: t('page.workflow.pipelines.columns.driver'),
    key: 'driver',
    width: 140,
    align: 'center',
    resizable: true,
    render(row: Api.Telegram.WorkflowDef) {
      const info = driverTagInfo(row.driver);
      return h(NTag, { type: info.type, size: 'small', round: true, bordered: false }, { default: () => info.label });
    }
  },
  initial_state: {
    title: t('page.workflow.pipelines.columns.initialState'),
    key: 'initial_state',
    width: 140,
    align: 'center',
    resizable: true,
    render(row: Api.Telegram.WorkflowDef) {
      return h(
        NTag,
        { type: 'success', size: 'small', bordered: false, class: 'font-mono' },
        { default: () => row.initial_state || 'initiated' }
      );
    }
  },
  enabled: {
    title: t('common.status'),
    key: 'enabled',
    width: 100,
    align: 'center',
    resizable: true,
    render(row: Api.Telegram.WorkflowDef) {
      return row.enabled
        ? h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => t('common.enabled') })
        : h(NTag, { size: 'small', type: 'error', bordered: false }, { default: () => t('common.disabled') });
    }
  },
  updated_at: {
    title: t('page.workflow.pipelines.columns.updatedAt'),
    key: 'updated_at',
    width: 165,
    align: 'center',
    resizable: true,
    render: (row: Api.Telegram.WorkflowDef) => formatDateTime(row.updated_at)
  },
  created_at: {
    title: t('page.workflow.pipelines.columns.createdAt'),
    key: 'created_at',
    width: 165,
    align: 'center',
    resizable: true,
    render: (row: any) => formatDateTime(row.created_at)
  },
  description: {
    title: t('page.workflow.pipelines.descriptionLabel'),
    key: 'description',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Telegram.WorkflowDef) => row.description || '-'
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: 300,
    align: 'center',
    fixed: 'right',
    render(row: Api.Telegram.WorkflowDef) {
      return h(
        NSpace,
        { justify: 'center', size: 6 },
        {
          default: () => [
            h(
              NButton,
              {
                size: 'tiny',
                type: 'primary',
                ghost: true,
                onClick: () => handleOpenEdit(row)
              },
              { default: () => t('common.edit') }
            ),
            h(
              NButton,
              {
                size: 'tiny',
                type: 'info',
                ghost: true,
                onClick: () => handleOpenDetail(row)
              },
              {
                default: () => [
                  h('span', { class: 'i-carbon-flow-data mr-2px text-11px' }),
                  t('page.workflow.pipelines.viewFlow')
                ]
              }
            ),
            h(
              NPopconfirm,
              { onPositiveClick: () => handleToggleStatus(row, !row.enabled) },
              {
                trigger: () =>
                  h(
                    NButton,
                    { size: 'tiny', type: row.enabled ? 'warning' : 'success', ghost: true },
                    { default: () => (row.enabled ? t('common.disable') : t('common.enable')) }
                  ),
                default: () => (row.enabled ? t('common.confirmDisable') : t('common.confirmEnable'))
              }
            ),
            h(
              NPopconfirm,
              { onPositiveClick: () => handleDeleteWorkflow(row.workflow_key) },
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
  'workflow_key',
  'name',
  'driver',
  'initial_state',
  'enabled',
  'updated_at',
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
  startLoading();
  try {
    const res = await fetchGetWorkflowDefs({ page: 1, page_size: 100 });
    if (res.data) {
      rawWorkflows.value = res.data.list || [];
      pagination.itemCount = filteredWorkflows.value.length;
    }
  } catch (err: any) {
    message.error(err.message || t('page.workflow.pipelines.loadListFailed'));
  } finally {
    endLoading();
  }
}

function handleSearch() {
  pagination.page = 1;
  pagination.itemCount = filteredWorkflows.value.length;
}

function handleResetSearch() {
  searchForm.keyword = '';
  searchForm.driver = 'all';
  searchForm.status = 'all';
  handleSearch();
}

async function handleDeleteWorkflow(key: string) {
  try {
    const { error } = await fetchDeleteWorkflowDef(key);
    if (!error) {
      message.success(t('page.workflow.pipelines.deleteSuccess'));
      loadWorkflows();
    } else {
      message.error(error.message || t('page.workflow.pipelines.deleteFailed'));
    }
  } catch (err: any) {
    message.error(err.message || t('page.workflow.pipelines.deleteFailed'));
  }
}

async function handleBatchDeleteWorkflows() {
  if (checkedRowKeys.value.length === 0) return;
  const keys = rawWorkflows.value
    .filter(item => checkedRowKeys.value.includes(item.id as any))
    .map(item => item.workflow_key);
  if (keys.length === 0) return;
  try {
    const { error } = await fetchBatchDeleteWorkflowDefs(keys);
    if (!error) {
      message.success(t('page.workflow.pipelines.deleteSuccess'));
      checkedRowKeys.value = [];
      loadWorkflows();
    } else {
      message.error(error.message || t('page.workflow.pipelines.deleteFailed'));
    }
  } catch (err: any) {
    message.error(err.message || t('page.workflow.pipelines.deleteFailed'));
  }
}

// ==========================================
// 1. 查看流程详情 Modal (Flowchart & States)
// ==========================================
const detailVisible = ref(false);
const detailActiveTab = ref<'diagram' | 'config'>('diagram');
const viewingWorkflow = ref<Api.Telegram.WorkflowDef | null>(null);

const parsedDetailPipeline = computed(() => {
  if (!viewingWorkflow.value?.pipeline_json) return null;
  try {
    return typeof viewingWorkflow.value.pipeline_json === 'string'
      ? JSON.parse(viewingWorkflow.value.pipeline_json)
      : viewingWorkflow.value.pipeline_json;
  } catch {
    return null;
  }
});

function handleOpenDetail(row: Api.Telegram.WorkflowDef) {
  viewingWorkflow.value = row;
  detailActiveTab.value = 'diagram';
  detailVisible.value = true;
}

// ==========================================
// 2. 新建 / 编辑 Pipeline Modal (Raw JSON)
// ==========================================
const editModalVisible = ref(false);
const isEditing = ref(false);
const editingKey = ref<string>('');

const editForm = reactive({
  workflow_key: '',
  name: '',
  driver: 'telegram',
  initial_state: 'initiated',
  // Named to match the API's own field (model.WorkflowDef.Enabled). This form
  // used to call it `status`, which the backend's JSON binding ignored — so
  // every save silently wrote the zero value instead.
  enabled: true,
  description: '',
  pipeline_json: ''
});

const jsonSyntaxError = ref<string | null>(null);

function validateJsonLive() {
  if (!editForm.pipeline_json.trim()) {
    jsonSyntaxError.value = t('page.workflow.pipelines.jsonEmpty');
    return false;
  }
  try {
    JSON.parse(editForm.pipeline_json);
    jsonSyntaxError.value = null;
    return true;
  } catch (e: any) {
    jsonSyntaxError.value = e.message || t('page.workflow.pipelines.jsonSyntaxErrorGeneric');
    return false;
  }
}

// Format JSON with 2-spaces indentation
function formatJsonContent() {
  try {
    const parsed = JSON.parse(editForm.pipeline_json);
    editForm.pipeline_json = JSON.stringify(parsed, null, 2);
    jsonSyntaxError.value = null;
    message.success(t('page.workflow.pipelines.jsonFormatted'));
  } catch (e: any) {
    message.error(t('page.workflow.pipelines.jsonFormatFailed', { error: e.message }));
  }
}

function defaultPipelineTemplate() {
  return {
    driver: 'telegram',
    initial_state: 'initiated',
    states: {
      initiated: {
        name: t('page.workflow.pipelines.sampleFlow.initiated'),
        entry_actions: [
          {
            type: 'notify_channel',
            template_key: 'purchase_intent_ack',
            target: '$.requester'
          },
          {
            type: 'notify_channel',
            template_key: 'purchase_request_leader',
            target: 'role:APPROVER'
          }
        ],
        transitions: {
          leader_approve: {
            target_state: 'ops_procuring',
            guard_role: 'APPROVER',
            comment: t('page.workflow.pipelines.sampleFlow.leaderApproveComment')
          },
          leader_reject: {
            target_state: 'rejected',
            guard_role: 'APPROVER',
            comment: t('page.workflow.pipelines.sampleFlow.leaderRejectComment')
          }
        }
      },
      ops_procuring: {
        name: t('page.workflow.pipelines.sampleFlow.opsProcuring'),
        entry_actions: [
          {
            type: 'notify_channel',
            template_key: 'purchase_request_ops',
            target: 'role:OPS'
          }
        ],
        transitions: {
          ops_complete: {
            target_state: 'completed',
            guard_role: 'OPS',
            comment: t('page.workflow.pipelines.sampleFlow.opsCompleteComment')
          },
          ops_fail: {
            target_state: 'failed',
            guard_role: 'OPS',
            comment: t('page.workflow.pipelines.sampleFlow.opsFailComment')
          }
        }
      },
      completed: {
        name: t('page.workflow.pipelines.sampleFlow.completed'),
        is_terminal: true,
        entry_actions: [
          {
            type: 'notify_channel',
            template_key: 'purchase_result_requester',
            target: '$.requester'
          }
        ]
      },
      rejected: {
        name: t('page.workflow.pipelines.sampleFlow.rejected'),
        is_terminal: true,
        entry_actions: [
          {
            type: 'notify_channel',
            template_key: 'purchase_result_requester',
            target: '$.requester'
          }
        ]
      },
      failed: {
        name: t('page.workflow.pipelines.sampleFlow.failed'),
        is_terminal: true,
        entry_actions: [
          {
            type: 'notify_channel',
            template_key: 'purchase_result_requester',
            target: '$.requester'
          }
        ]
      }
    },
    output_actions: {
      ops_complete: {
        name: t('page.workflow.pipelines.sampleFlow.opsCompleteEntry'),
        execution_mode: 'manual',
        manual_fields: [
          {
            key: 'provider_id',
            label: t('page.workflow.pipelines.sampleFlow.providerLabel'),
            type: 'select',
            required: true,
            placeholder: t('page.workflow.pipelines.sampleFlow.providerPlaceholder')
          },
          {
            key: 'annual_price_cents',
            label: t('page.workflow.pipelines.sampleFlow.priceLabel'),
            type: 'number',
            required: true,
            placeholder: t('page.workflow.pipelines.sampleFlow.pricePlaceholder')
          },
          {
            key: 'ops_note',
            label: t('page.workflow.pipelines.sampleFlow.noteLabel'),
            type: 'text',
            required: false,
            placeholder: t('page.workflow.pipelines.sampleFlow.notePlaceholder')
          }
        ],
        auto_actions: ['provision_zone']
      }
    }
  };
}

function insertDefaultTemplate() {
  editForm.pipeline_json = JSON.stringify(defaultPipelineTemplate(), null, 2);
  jsonSyntaxError.value = null;
  message.success(t('page.workflow.pipelines.templateInserted'));
}

function handleOpenCreateModal() {
  isEditing.value = false;
  editingKey.value = '';
  editForm.workflow_key = '';
  editForm.name = '';
  editForm.driver = 'telegram';
  editForm.initial_state = 'initiated';
  editForm.enabled = true;
  editForm.description = '';
  editForm.pipeline_json = JSON.stringify(defaultPipelineTemplate(), null, 2);
  jsonSyntaxError.value = null;
  editModalVisible.value = true;
}

function handleOpenEdit(row: Api.Telegram.WorkflowDef) {
  isEditing.value = true;
  editingKey.value = row.workflow_key;
  editForm.workflow_key = row.workflow_key;
  editForm.name = row.name;
  editForm.driver = row.driver || 'telegram';
  editForm.initial_state = row.initial_state || 'initiated';
  editForm.enabled = Boolean(row.enabled);
  editForm.description = row.description || '';

  // Format raw JSON from backend with 2 spaces indentation
  try {
    const parsed = typeof row.pipeline_json === 'string' ? JSON.parse(row.pipeline_json) : row.pipeline_json;
    editForm.pipeline_json = JSON.stringify(parsed, null, 2);
    jsonSyntaxError.value = null;
  } catch {
    editForm.pipeline_json = row.pipeline_json || '';
    jsonSyntaxError.value = t('page.workflow.pipelines.rawJsonSyntaxError');
  }

  editModalVisible.value = true;
}

async function handleSaveWorkflow() {
  if (!editForm.workflow_key.trim()) {
    message.error(t('page.workflow.pipelines.workflowKeyRequired'));
    return;
  }
  if (!editForm.name.trim()) {
    message.error(t('page.workflow.pipelines.workflowNameRequired'));
    return;
  }
  if (!validateJsonLive()) {
    message.error(t('page.workflow.pipelines.jsonCheckBeforeSave'));
    return;
  }

  // Parse and sync initial_state & driver from JSON if defined
  let minifiedJson = editForm.pipeline_json;
  try {
    const parsed = JSON.parse(editForm.pipeline_json);
    if (parsed.driver && !editForm.driver) {
      editForm.driver = parsed.driver;
    }
    if (parsed.initial_state && !editForm.initial_state) {
      editForm.initial_state = parsed.initial_state;
    }
    // Save formatted JSON back for neat database records
    minifiedJson = JSON.stringify(parsed, null, 2);
  } catch (e: any) {
    message.error(t('page.workflow.pipelines.jsonParseFailed', { error: e.message }));
    return;
  }

  try {
    if (isEditing.value && editingKey.value) {
      const { error } = await fetchUpdateWorkflowDef(editingKey.value, {
        workflow_key: editForm.workflow_key,
        name: editForm.name,
        driver: editForm.driver,
        description: editForm.description,
        initial_state: editForm.initial_state,
        pipeline_json: minifiedJson,
        enabled: editForm.enabled
      });
      if (error) {
        message.error(error.message || t('page.workflow.pipelines.updateFailed'));
        return;
      }
      message.success(t('page.workflow.pipelines.updateSuccess'));
    } else {
      const { error } = await fetchCreateWorkflowDef({
        workflow_key: editForm.workflow_key,
        name: editForm.name,
        driver: editForm.driver,
        description: editForm.description,
        initial_state: editForm.initial_state,
        pipeline_json: minifiedJson,
        enabled: editForm.enabled
      });
      if (error) {
        message.error(error.message || t('page.workflow.pipelines.createFailed'));
        return;
      }
      message.success(t('page.workflow.pipelines.createSuccess'));
    }
    editModalVisible.value = false;
    loadWorkflows();
  } catch (err: any) {
    message.error(err.message || t('page.workflow.pipelines.saveFailed'));
  }
}

onMounted(() => {
  initColumnConfig();
  loadWorkflows();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <!-- 顶部搜索卡片 -->
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse compact-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="searchForm" label-placement="top" :show-feedback="false">
            <div class="list-search-row">
              <NFormItem class="list-search-item list-search-main" :label="t('page.workflow.pipelines.columns.name')">
                <NInput
                  v-model:value="searchForm.keyword"
                  clearable
                  :placeholder="t('page.workflow.pipelines.searchPlaceholder')"
                  @keyup.enter="handleSearch"
                />
              </NFormItem>
              <NFormItem
                class="list-search-item list-search-short-field"
                :label="t('page.workflow.pipelines.columns.driver')"
              >
                <NSelect
                  v-model:value="searchForm.driver"
                  :placeholder="t('common.selectField', { field: t('page.workflow.pipelines.columns.driver') })"
                  :options="driverOptions"
                  @update:value="handleSearch"
                />
              </NFormItem>
              <NFormItem class="list-search-item list-search-short-field" :label="t('common.status')">
                <NSelect
                  v-model:value="searchForm.status"
                  :placeholder="t('common.selectField', { field: t('common.status') })"
                  :options="statusOptions"
                  @update:value="handleSearch"
                />
              </NFormItem>
              <div class="list-search-actions">
                <NSpace>
                  <NButton type="primary" @click="handleSearch">
                    {{ t('common.search') }}
                  </NButton>
                  <NButton @click="handleResetSearch">
                    {{ t('common.reset') }}
                  </NButton>
                </NSpace>
              </div>
            </div>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>

    <!-- 列表卡片 -->
    <NCard :bordered="false" size="small" class="flex-1 rounded-16px shadow-sm overflow-hidden">
      <div class="h-full flex-col">
        <TableHeaderOperation
          v-model:columns="columnChecks"
          v-model:density="density"
          class="pb-12px"
          :loading="loading"
          :show-delete="true"
          :disabled-delete="checkedRowKeys.length === 0"
          @add="handleOpenCreateModal"
          @delete="handleBatchDeleteWorkflows"
          @refresh="loadWorkflows"
        />
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="paginatedWorkflows"
            :pagination="pagination"
            :row-key="row => row.id"
            :checked-row-keys="checkedRowKeys"
            :size="density"
            :scroll-x="1200"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @update:checked-row-keys="val => (checkedRowKeys = val as string[])"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <!-- 1. 查看流程详情 Modal (可视化状态机流程图 / 状态与动作详情) -->
    <NModal
      v-model:show="detailVisible"
      preset="card"
      :title="`${t('page.workflow.pipelines.viewFlowTitle')} - ${viewingWorkflow?.name || ''} (${viewingWorkflow?.workflow_key || ''})`"
      style="width: 1000px; max-width: 95vw"
      class="rounded-16px"
      size="small"
    >
      <div v-if="viewingWorkflow" class="flex-col gap-12px">
        <!-- 摘要头部 -->
        <div
          class="flex items-center justify-between p-12px rounded-8px bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60"
        >
          <div class="flex items-center gap-12px flex-wrap">
            <div class="flex items-center gap-6px">
              <span class="text-gray-400 text-12px">{{ t('page.workflow.pipelines.columns.driver') }}:</span>
              <NTag size="small" :type="driverTagInfo(viewingWorkflow.driver).type" round :bordered="false">
                {{ driverTagInfo(viewingWorkflow.driver).label }}
              </NTag>
            </div>
            <div class="flex items-center gap-6px">
              <span class="text-gray-400 text-12px">{{ t('page.workflow.pipelines.columns.initialState') }}:</span>
              <NTag size="small" type="success" :bordered="false" class="font-mono">
                {{ viewingWorkflow.initial_state || 'initiated' }}
              </NTag>
            </div>
            <div class="flex items-center gap-6px">
              <span class="text-gray-400 text-12px">{{ t('common.status') }}:</span>
              <NTag size="small" :type="viewingWorkflow.enabled ? 'success' : 'default'" :bordered="false">
                {{ viewingWorkflow.enabled ? t('common.enable') : t('common.disable') }}
              </NTag>
            </div>
          </div>
          <div class="text-12px text-gray-400">
            {{ formatDateTime(viewingWorkflow.updated_at) }}
          </div>
        </div>

        <p v-if="viewingWorkflow.description" class="text-12px text-gray-500 my-0">
          {{ viewingWorkflow.description }}
        </p>

        <!-- Tabs 切换 -->
        <NTabs v-model:value="detailActiveTab" type="segment" class="mt-4px">
          <NTabPane name="diagram" :tab="t('page.workflow.pipelines.flowchartTab')">
            <div class="mt-12px">
              <PipelineFlowchart :pipeline-json="viewingWorkflow.pipeline_json" />
            </div>
          </NTabPane>

          <NTabPane name="config" :tab="t('page.workflow.pipelines.statesTab')">
            <div v-if="parsedDetailPipeline" class="flex-col gap-12px mt-12px">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-12px">
                <div
                  v-for="(stateDef, stateKey) in parsedDetailPipeline.states"
                  :key="stateKey"
                  class="rounded-12px border border-gray-200 dark:border-gray-800 p-14px bg-white dark:bg-gray-900/60 shadow-xs"
                >
                  <div class="flex items-center justify-between mb-8px">
                    <div class="flex items-center gap-6px">
                      <span class="font-bold text-14px text-gray-800 dark:text-gray-100">
                        {{ stateDef.name || stateKey }}
                      </span>
                      <span class="text-11px font-mono text-gray-400">({{ stateKey }})</span>
                    </div>
                    <NTag
                      size="tiny"
                      :type="
                        stateKey === parsedDetailPipeline.initial_state
                          ? 'info'
                          : stateDef.is_terminal
                            ? 'success'
                            : 'warning'
                      "
                      :bordered="false"
                    >
                      {{
                        stateKey === parsedDetailPipeline.initial_state
                          ? t('page.workflow.pipelines.flowchart.initialNode')
                          : stateDef.is_terminal
                            ? t('page.workflow.pipelines.flowchart.completedNode')
                            : t('page.workflow.pipelines.flowchart.transitNode')
                      }}
                    </NTag>
                  </div>

                  <!-- Entry Actions -->
                  <div class="mb-8px">
                    <div class="text-11px font-semibold text-gray-400 mb-4px">
                      {{ t('page.workflow.pipelines.entryActionsLabel') }}
                    </div>
                    <div v-if="stateDef.entry_actions?.length" class="flex-col gap-4px">
                      <div
                        v-for="(act, aIdx) in stateDef.entry_actions"
                        :key="aIdx"
                        class="text-11px flex items-center gap-6px px-8px py-3px rounded bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono"
                      >
                        <span class="i-carbon-notification" />
                        <span>{{ act.template_key }}</span>
                        <span class="text-gray-400">➔</span>
                        <span class="text-gray-600 dark:text-gray-300">{{ act.target }}</span>
                      </div>
                    </div>
                    <span v-else class="text-11px text-gray-400">{{ t('page.workflow.pipelines.none') }}</span>
                  </div>

                  <!-- Transitions -->
                  <div>
                    <div class="text-11px font-semibold text-gray-400 mb-4px">
                      {{ t('page.workflow.pipelines.transitionsLabel2') }}
                    </div>
                    <div
                      v-if="stateDef.transitions && Object.keys(stateDef.transitions).length"
                      class="flex-col gap-4px"
                    >
                      <div
                        v-for="(tDef, eventKey) in stateDef.transitions"
                        :key="eventKey"
                        class="text-11px flex items-center justify-between px-8px py-4px rounded bg-slate-50 dark:bg-slate-800/60 font-mono"
                      >
                        <div class="flex items-center gap-4px">
                          <span class="font-bold text-amber-600 dark:text-amber-400">{{ eventKey }}</span>
                          <span class="text-gray-400">➔</span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {{ tDef.target_state }}
                          </span>
                        </div>
                        <NTag v-if="tDef.guard_role" size="tiny" type="warning" :bordered="false">
                          {{ guardRoleLabel(tDef.guard_role) }}
                        </NTag>
                      </div>
                    </div>
                    <span v-else class="text-11px text-gray-400">{{ t('page.workflow.pipelines.noTransitions') }}</span>
                  </div>
                </div>
              </div>

              <!-- Output Actions -->
              <div
                v-if="parsedDetailPipeline.output_actions && Object.keys(parsedDetailPipeline.output_actions).length"
                class="mt-8px"
              >
                <div class="font-bold text-14px mb-8px flex items-center gap-6px text-gray-800 dark:text-gray-100">
                  <span class="i-carbon-flash text-amber-500" />
                  <span>{{ t('page.workflow.pipelines.outputActionsDefTitle') }}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-12px">
                  <div
                    v-for="(outDef, outKey) in parsedDetailPipeline.output_actions"
                    :key="outKey"
                    class="rounded-12px border border-dashed border-gray-300 dark:border-gray-700 p-12px bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <div class="flex items-center justify-between mb-6px">
                      <span class="font-semibold text-13px">{{ outDef.name || outKey }}</span>
                      <NTag
                        size="tiny"
                        :type="outDef.execution_mode === 'manual' ? 'warning' : 'info'"
                        :bordered="false"
                      >
                        {{
                          outDef.execution_mode === 'manual'
                            ? t('page.workflow.pipelines.manualDelivery')
                            : t('page.workflow.pipelines.fullyAutomatic')
                        }}
                      </NTag>
                    </div>
                    <div v-if="outDef.manual_fields?.length" class="text-11px flex-col gap-3px">
                      <div class="text-gray-400 mb-2px">{{ t('page.workflow.pipelines.manualFieldsLabel') }}</div>
                      <div
                        v-for="f in outDef.manual_fields"
                        :key="f.key"
                        class="flex items-center gap-6px font-mono text-gray-600 dark:text-gray-300"
                      >
                        <span class="text-amber-500 font-bold">•</span>
                        <span>{{ f.label }} ({{ f.key }})</span>
                        <span v-if="f.required" class="text-red-500">
                          {{ t('page.workflow.pipelines.requiredMark') }}
                        </span>
                      </div>
                    </div>
                    <div v-if="outDef.auto_actions?.length" class="text-11px mt-4px">
                      <span class="text-gray-400">{{ t('page.workflow.pipelines.autoActionsLabel') }}</span>
                      <span class="font-mono text-emerald-600 dark:text-emerald-400">
                        {{ outDef.auto_actions.join(', ') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-20px text-gray-400">
              {{ t('page.workflow.pipelines.noConfigData') }}
            </div>
          </NTabPane>
        </NTabs>
      </div>
      <template #footer>
        <div class="flex justify-end">
          <NButton @click="detailVisible = false">{{ t('common.close') }}</NButton>
        </div>
      </template>
    </NModal>

    <!-- 2. 新建 / 编辑 Pipeline Modal (Raw JSON) -->
    <NModal
      v-model:show="editModalVisible"
      preset="card"
      :title="
        isEditing
          ? `${t('page.workflow.pipelines.editPipeline')} - ${editForm.name}`
          : t('page.workflow.pipelines.addPipeline')
      "
      style="width: 860px; max-width: 95vw"
      class="rounded-16px"
      size="small"
      :segmented="{ content: 'soft', footer: 'soft' }"
    >
      <NForm label-placement="top" :model="editForm" :show-feedback="false">
        <NGrid :cols="24" :x-gap="12" :y-gap="12">
          <NFormItemGi :span="12" :label="t('page.workflow.pipelines.workflowKey')" path="workflow_key">
            <NInput
              v-model:value="editForm.workflow_key"
              :disabled="isEditing"
              :placeholder="t('page.workflow.pipelines.workflowKeyPlaceholder')"
            />
          </NFormItemGi>
          <NFormItemGi :span="12" :label="t('page.workflow.pipelines.workflowName')" path="name">
            <NInput v-model:value="editForm.name" :placeholder="t('page.workflow.pipelines.namePlaceholder')" />
          </NFormItemGi>
          <NFormItemGi :span="8" :label="t('page.workflow.pipelines.driver')">
            <NSelect
              v-model:value="editForm.driver"
              :placeholder="t('common.selectField', { field: t('page.workflow.pipelines.driver') })"
              :options="driverOptions.slice(1)"
            />
          </NFormItemGi>
          <NFormItemGi :span="8" :label="t('page.workflow.pipelines.initialState')">
            <NInput
              v-model:value="editForm.initial_state"
              :placeholder="t('page.workflow.pipelines.initialStatePlaceholder')"
            />
          </NFormItemGi>
          <NFormItemGi :span="8" :label="t('common.status')">
            <div class="pt-6px">
              <NSwitch v-model:value="editForm.enabled" />
              <span class="ml-8px text-12px text-gray-500">
                {{ editForm.enabled ? t('common.enable') : t('common.disable') }}
              </span>
            </div>
          </NFormItemGi>
          <NFormItemGi :span="24" :label="t('page.workflow.pipelines.descriptionLabel')">
            <NInput
              v-model:value="editForm.description"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 3 }"
              :placeholder="t('page.workflow.pipelines.descriptionPlaceholder')"
            />
          </NFormItemGi>
          <NFormItemGi :span="24" :label="t('page.workflow.pipelines.rawJson')" required>
            <!--
 The toolbar belongs in the form item's CONTENT, not its label:
                 Naive's .n-form-item-label shrink-wraps its content, so a
                 `w-full` + `justify-between` row inside it had no free space to
                 distribute and the status tag ended up flush against the
                 buttons with no gap at all. Content is genuinely full width.
-->
            <div class="w-full flex-col gap-8px">
              <div class="flex items-center justify-between w-full gap-12px">
                <!--
 size="medium", not "small": NTag's scale sits one step
                     below the shared one (tag medium -> heightSmall = 28px),
                     so a "small" tag is 22px against a 28px "small" button —
                     which is why the two didn't line up.
-->
                <NTag size="medium" :type="jsonSyntaxError ? 'error' : 'success'" :bordered="false">
                  {{
                    jsonSyntaxError
                      ? t('page.workflow.pipelines.syntaxInvalid')
                      : t('page.workflow.pipelines.syntaxValid')
                  }}
                </NTag>
                <!--
 ghost, not filled `secondary`: these sit right next to the
                     syntax-status NTag, and a filled pale pill gave them the
                     same visual weight as that label, so nothing in the row
                     read as clickable.
-->
                <NSpace :size="8" align="center" :wrap="false">
                  <NButton size="small" type="primary" ghost @click="formatJsonContent">
                    {{ t('page.workflow.pipelines.formatJson') }}
                  </NButton>
                  <NButton v-if="!isEditing" size="small" type="primary" ghost @click="insertDefaultTemplate">
                    {{ t('page.workflow.pipelines.insertTemplate') }}
                  </NButton>
                  <NButton size="small" type="primary" ghost @click="copyToClipboard(editForm.pipeline_json)">
                    {{ t('page.workflow.pipelines.copyJson') }}
                  </NButton>
                </NSpace>
              </div>

              <NInput
                v-model:value="editForm.pipeline_json"
                type="textarea"
                :autosize="{ minRows: 16, maxRows: 26 }"
                class="font-mono text-12px leading-relaxed bg-[#f8fafc] dark:bg-[#0f172a]"
                :placeholder="t('page.workflow.pipelines.jsonPlaceholder')"
                @input="validateJsonLive"
              />
              <p v-if="jsonSyntaxError" class="text-12px text-red-500 my-0 font-mono">
                {{ jsonSyntaxError }}
              </p>
            </div>
          </NFormItemGi>
        </NGrid>
      </NForm>

      <template #footer>
        <div class="flex justify-end gap-12px">
          <NButton @click="editModalVisible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleSaveWorkflow">
            {{ isEditing ? t('common.confirm') : t('common.confirm') }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
:deep(.font-mono textarea) {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
  tab-size: 2;
}
</style>
