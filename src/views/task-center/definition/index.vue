<script setup lang="ts">
import { ref, onMounted, h, reactive, computed, watch } from 'vue';
import StatusSelect from '@/components/business/status-select.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { fetchGetJobTypes, fetchGetTasks, fetchUpdateTask } from '@/service/api/system';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  useMessage,
  NSpace,
  NCard,
  NCollapse,
  NCollapseItem,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSwitch,
  NSelect,
  NTag
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { operateWidth } from '@/utils/operate-width';

const message = useMessage();
const { t } = useI18n();
const PAGE_CODE = 'task_center_definition';

const loading = ref(false);
const tasks = ref<Api.System.Task[]>([]);

const searchForm = reactive({
  keyword: '',
  task_type: 'all',
  enabled: 'all'
});

// The task types that really exist: the ones the platform can run plus the ones already in the table.
const taskTypes = ref<string[]>([]);
const taskTypeOptions = computed(() => [
  { label: t('common.all', '全部类型'), value: 'all' },
  ...taskTypes.value.map(value => ({ label: value, value }))
]);

const statusOptions = computed(() => [
  { label: t('common.allStatuses', '启用状态'), value: 'all' },
  { label: t('common.enable', '已启用'), value: '1' },
  { label: t('common.disable', '已禁用'), value: '0' }
]);

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  itemCount: 0,
  onChange: (page: number) => {
    pagination.page = page;
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
  }
});

const showModal = ref(false);
const formRef = ref<any>(null);
const editForm = reactive({
  id: 0,
  task_type: '',
  cron_expr: '',
  description: '',
  enabled: true,
  params: '',
  max_retry: 3,
  retry_forever: false,
  retry_initial_seconds: 60,
  retry_backoff_factor: 2,
  retry_max_seconds: 3600,
  execution_interval_seconds: 0,
  watch_interval_seconds: 0
});

const rules = {
  cron_expr: { required: true, message: t('form.required'), trigger: 'blur' }
};

function taskTypeTagType(_type: string): 'info' {
  return 'info';
}

const columnMap: Record<string, any> = {
  id: {
    title: t('common.id'),
    key: 'id',
    width: 80,
    align: 'center',
    resizable: true
  },
  task_type: {
    title: t('page.task.columns.taskType'),
    key: 'task_type',
    width: 180,
    align: 'center',
    resizable: true,
    render(row: Api.System.Task) {
      return h(NTag, { type: taskTypeTagType(row.task_type), bordered: false }, { default: () => row.task_type });
    }
  },
  cron_expr: {
    title: t('page.task.columns.cronExpr'),
    key: 'cron_expr',
    width: 150,
    align: 'center',
    resizable: true,
    render(row: Api.System.Task) {
      return h(NTag, { size: 'small', bordered: false, class: 'font-mono' }, { default: () => row.cron_expr });
    }
  },
  enabled: {
    title: t('page.task.columns.enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    resizable: true,
    render(row: Api.System.Task) {
      return row.enabled
        ? h(NTag, { type: 'success', bordered: false }, { default: () => t('common.enabled') })
        : h(NTag, { type: 'error', bordered: false }, { default: () => t('common.disabled') });
    }
  },
  last_run_time: {
    title: t('page.task.columns.lastRun'),
    key: 'last_run_time',
    width: 180,
    align: 'center',
    resizable: true,
    render(row: any) {
      return formatDateTime(row.last_run_time);
    }
  },
  next_run_time: {
    title: t('page.task.columns.nextRun'),
    key: 'next_run_time',
    width: 180,
    align: 'center',
    resizable: true,
    render(row: any) {
      return formatDateTime(row.next_run_time);
    }
  },
  description: {
    title: t('page.task.columns.description'),
    key: 'description',
    width: 240,
    resizable: true,
    ellipsis: { tooltip: true },
    render(row: any) {
      return row.description || '-';
    }
  },
  params: {
    title: t('page.task.columns.params'),
    key: 'params',
    width: 220,
    align: 'left',
    resizable: true,
    ellipsis: { tooltip: true }
  },
  max_retry: { title: t('page.task.maxRetry'), key: 'max_retry', width: 120, align: 'center', resizable: true },
  retry_forever: {
    title: t('page.task.retryForever'),
    key: 'retry_forever',
    width: 120,
    align: 'center',
    resizable: true,
    render: (r: any) => (r.retry_forever ? t('common.yesOrNo.yes') : t('common.yesOrNo.no'))
  },
  retry_initial_seconds: {
    title: t('page.task.retryInitial'),
    key: 'retry_initial_seconds',
    width: 150,
    align: 'center',
    resizable: true
  },
  retry_backoff_factor: {
    title: t('page.task.retryFactor'),
    key: 'retry_backoff_factor',
    width: 120,
    align: 'center',
    resizable: true
  },
  retry_max_seconds: {
    title: t('page.task.retryMax'),
    key: 'retry_max_seconds',
    width: 150,
    align: 'center',
    resizable: true
  },
  execution_interval_seconds: {
    title: t('page.task.executionInterval'),
    key: 'execution_interval_seconds',
    width: 160,
    align: 'center',
    resizable: true
  },
  watch_interval_seconds: {
    title: t('page.task.watchInterval'),
    key: 'watch_interval_seconds',
    width: 160,
    align: 'center',
    resizable: true
  },
  operate: {
    title: t('common.action'),
    key: 'operate',
    width: operateWidth([t('common.edit'), t('common.disable')]),
    align: 'center',
    fixed: 'right',
    resizable: true,
    render(row: Api.System.Task) {
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
                onClick: () => {
                  editForm.id = row.id;
                  editForm.task_type = row.task_type;
                  editForm.cron_expr = row.cron_expr;
                  editForm.description = row.description;
                  editForm.enabled = row.enabled;
                  editForm.params = row.params;
                  editForm.max_retry = row.max_retry;
                  editForm.retry_forever = row.retry_forever;
                  editForm.retry_initial_seconds = row.retry_initial_seconds;
                  editForm.retry_backoff_factor = row.retry_backoff_factor;
                  editForm.retry_max_seconds = row.retry_max_seconds;
                  editForm.execution_interval_seconds = row.execution_interval_seconds;
                  editForm.watch_interval_seconds = row.watch_interval_seconds;
                  showModal.value = true;
                }
              },
              { default: () => t('common.edit') }
            ),
            h(
              NPopconfirm,
              { onPositiveClick: () => handleToggleTaskEnabled(row) },
              {
                trigger: () =>
                  h(
                    NButton,
                    { size: 'tiny', type: row.enabled ? 'warning' : 'success' },
                    { default: () => (row.enabled ? t('common.disable') : t('common.enable')) }
                  ),
                default: () => (row.enabled ? t('common.confirmDisable') : t('common.confirmEnable'))
              }
            )
          ]
        }
      );
    }
  }
};

async function handleToggleTaskEnabled(row: Api.System.Task) {
  const { error } = await fetchUpdateTask(row.id, { enabled: !row.enabled });
  if (!error) {
    message.success(t('common.modifySuccess'));
    loadTasks();
  }
}

const defaultColumnKeys = [
  'task_type',
  'cron_expr',
  'enabled',
  'last_run_time',
  'next_run_time',
  'description',
  'operate'
];

const filteredTasks = computed(() => {
  const kw = searchForm.keyword.trim().toLowerCase();
  const typeFilter = searchForm.task_type;
  const enabledFilter = searchForm.enabled;

  return tasks.value.filter(task => {
    if (typeFilter !== 'all' && task.task_type !== typeFilter) return false;
    if (enabledFilter === '1' && !task.enabled) return false;
    if (enabledFilter === '0' && task.enabled) return false;
    if (!kw) return true;
    return [task.task_type, task.cron_expr, task.description, task.params].some(val =>
      String(val || '')
        .toLowerCase()
        .includes(kw)
    );
  });
});

watch(
  filteredTasks,
  list => {
    pagination.itemCount = list.length;
  },
  { immediate: true }
);

const pagedTasks = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredTasks.value.slice(start, start + pagination.pageSize);
});

const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({
  pageCode: PAGE_CODE,
  columnMap,
  defaultKeys: defaultColumnKeys
});

// This page fetches the whole task_definition table once and does
// filtering/pagination entirely client-side (see filteredTasks/pagedTasks
// above) — so this must ask the backend for every row, not rely on its
// page_size=10 default (ListOptions.PageSize in pkg/apis/type.go), or
// task types past the 10th (e.g. ns_mode_reconcile) silently never load.
async function loadTasks() {
  loading.value = true;
  try {
    const { data, error } = await fetchGetTasks({ page: 1, page_size: 1000 });
    if (!error && data) {
      tasks.value = data.list;
    }
  } finally {
    loading.value = false;
  }
}

function submitSearch() {
  pagination.page = 1;
}

function resetSearchParams() {
  searchForm.keyword = '';
  searchForm.task_type = 'all';
  searchForm.enabled = 'all';
  pagination.page = 1;
}

async function handleSubmit() {
  formRef.value?.validate(async (errors: any) => {
    if (!errors) {
      const { error } = await fetchUpdateTask(editForm.id, {
        cron_expr: editForm.cron_expr,
        description: editForm.description,
        params: editForm.params,
        max_retry: editForm.max_retry,
        retry_forever: editForm.retry_forever,
        retry_initial_seconds: editForm.retry_initial_seconds,
        retry_backoff_factor: editForm.retry_backoff_factor,
        retry_max_seconds: editForm.retry_max_seconds,
        execution_interval_seconds: editForm.execution_interval_seconds,
        watch_interval_seconds: editForm.watch_interval_seconds
      });
      if (!error) {
        message.success(t('common.modifySuccess'));
        showModal.value = false;
        loadTasks();
      }
    }
  });
}

onMounted(async () => {
  taskTypes.value = (await fetchGetJobTypes()).data || [];
  loadTasks();
  initColumnConfig();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse compact-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline label-placement="top" :model="searchForm" :show-feedback="false">
            <div class="list-search-row">
              <NFormItem
                class="list-search-item list-search-main"
                :label="t('common.keyword', '关键词')"
                path="keyword"
              >
                <NInput
                  v-model:value="searchForm.keyword"
                  clearable
                  :placeholder="t('page.task.columns.description')"
                  @keyup.enter="submitSearch"
                />
              </NFormItem>
              <NFormItem
                class="list-search-item list-search-select-field list-search-medium-field"
                :label="t('page.task.columns.taskType')"
                path="task_type"
              >
                <NSelect
                  v-model:value="searchForm.task_type"
                  :placeholder="t('common.selectField', { field: t('page.task.columns.taskType') })"
                  :options="taskTypeOptions"
                  @update:value="submitSearch"
                />
              </NFormItem>
              <NFormItem
                class="list-search-item list-search-select-field list-search-short-field"
                :label="t('page.task.columns.enabled')"
                path="enabled"
              >
                <NSelect
                  v-model:value="searchForm.enabled"
                  :placeholder="t('common.selectField', { field: t('page.task.columns.enabled') })"
                  :options="statusOptions"
                  @update:value="submitSearch"
                />
              </NFormItem>
              <div class="list-search-actions">
                <NButton @click="resetSearchParams">
                  <template #icon><icon-ic-round-refresh /></template>
                  {{ t('common.reset') }}
                </NButton>
                <NButton type="primary" @click="submitSearch">
                  <template #icon><icon-ic-round-search /></template>
                  {{ t('common.search') }}
                </NButton>
              </div>
            </div>
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
          @refresh="loadTasks"
        />
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="pagedTasks"
            :row-key="row => row.id"
            :pagination="pagination"
            hide-synthetic-id
            :size="density"
            :scroll-x="1400"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NModal v-model:show="showModal" preset="card" :title="t('page.task.editTask')" class="w-600px">
      <NForm ref="formRef" :model="editForm" :rules="rules" label-placement="top">
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.columns.taskType')" :help="t('page.formHelp.taskType')" />
          </template>
          <NInput
            v-model:value="editForm.task_type"
            :placeholder="t('common.inputField', { field: t('page.task.columns.taskType') })"
            disabled
          />
        </NFormItem>
        <NFormItem path="cron_expr">
          <template #label>
            <HelpLabel :label="t('page.task.columns.cronExpr')" :help="t('page.formHelp.taskCron')" />
          </template>
          <NInput v-model:value="editForm.cron_expr" placeholder="*/5 * * * *" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.columns.description')" :help="t('page.formHelp.taskDescription')" />
          </template>
          <NInput
            v-model:value="editForm.description"
            :placeholder="t('common.inputField', { field: t('page.task.columns.description') })"
            type="textarea"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.columns.params')" :help="t('page.formHelp.taskParams')" />
          </template>
          <NInput v-model:value="editForm.params" type="textarea" placeholder="{}" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.maxRetry')" :help="t('page.formHelp.taskMaxRetry')" />
          </template>
          <NInputNumber
            v-model:value="editForm.max_retry"
            :placeholder="t('common.inputField', { field: t('page.task.maxRetry') })"
            :min="0"
            :max="10"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.retryForever')" :help="t('page.formHelp.taskRetryForever')" />
          </template>
          <NSwitch v-model:value="editForm.retry_forever" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.retryInitial')" :help="t('page.formHelp.taskRetryInitial')" />
          </template>
          <NInputNumber
            v-model:value="editForm.retry_initial_seconds"
            :placeholder="t('common.inputField', { field: t('page.task.retryInitial') })"
            :min="1"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.retryFactor')" :help="t('page.formHelp.taskRetryFactor')" />
          </template>
          <NInputNumber
            v-model:value="editForm.retry_backoff_factor"
            :placeholder="t('common.inputField', { field: t('page.task.retryFactor') })"
            :min="1"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.retryMax')" :help="t('page.formHelp.taskRetryMax')" />
          </template>
          <NInputNumber
            v-model:value="editForm.retry_max_seconds"
            :placeholder="t('common.inputField', { field: t('page.task.retryMax') })"
            :min="1"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.executionInterval')" :help="t('page.formHelp.taskExecInterval')" />
          </template>
          <NInputNumber v-model:value="editForm.execution_interval_seconds" :min="0" placeholder="0" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.watchInterval')" :help="t('page.formHelp.taskWatchInterval')" />
          </template>
          <NInputNumber v-model:value="editForm.watch_interval_seconds" :min="0" placeholder="0" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.task.columns.enabled')" :help="t('page.formHelp.taskEnabled')" />
          </template>
          <StatusSelect v-model:value="editForm.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped></style>
