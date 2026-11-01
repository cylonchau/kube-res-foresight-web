<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDrawer,
  NDrawerContent,
  NDynamicTags,
  NEmpty,
  NForm,
  NFormItem,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NModal,
  NPagination,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  useDialog,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchDeleteAssistantTasks,
  fetchCreateAssistantTask,
  fetchDeleteAssistantTask,
  fetchGetAssistantConnectionOptions,
  fetchGetAssistantTaskRuns,
  fetchGetAssistantTasks,
  fetchPreviewAssistantSchedule,
  fetchRunAssistantTask,
  fetchUpdateAssistantTask
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'AiConfigTask' });

/**
 * AI scheduled tasks: a prompt and a schedule. At the time the platform asks the language model the prompt, keeps the answer as a run and
 * mails it. Users make them by asking the chat ("every Monday, mail me the usage of all modules"); here they are seen, edited, run at once
 * and their runs read.
 */
const PAGE_CODE = 'ai_config_task';
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const loading = ref(false);
const saving = ref(false);
const rows = ref<Api.Assistant.TaskRow[]>([]);
const models = ref<Api.Assistant.ConnectionOption[]>([]);
const checkedRowKeys = ref<number[]>([]);
const visible = ref(false);
const editing = ref<Api.Assistant.TaskRow>();

const searchParams = reactive<{ keyword: string; source: 'chat' | 'page' | null; enabled: 'true' | 'false' | null }>({
  keyword: '',
  source: null,
  enabled: null
});
const sourceOptions = computed(() => [
  { label: t('page.assistant.task.source_chat'), value: 'chat' },
  { label: t('page.assistant.task.source_page'), value: 'page' }
]);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);
const langOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' }
];
const modelOptions = computed(() => [
  { label: t('page.assistant.useDefaultModel'), value: 0 },
  ...models.value.map(item => ({ label: `${item.name} · ${item.model}`, value: item.id }))
]);

function emptyForm() {
  return {
    name: '',
    prompt: '',
    schedule: '',
    lang: 'zh' as Api.Assistant.TaskPayload['lang'],
    enabled: true,
    llm_id: 0,
    recipients: [] as string[]
  };
}
const form = reactive(emptyForm());

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
  itemCount: 0,
  onChange: (page: number) => {
    pagination.page = page;
    load();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    load();
  }
});

async function load() {
  loading.value = true;
  try {
    const [{ data }, options] = await Promise.all([
      fetchGetAssistantTasks({
        page: pagination.page,
        page_size: pagination.pageSize,
        keyword: searchParams.keyword.trim() || undefined,
        source: searchParams.source ?? undefined,
        enabled: searchParams.enabled === null ? undefined : searchParams.enabled === 'true'
      }),
      fetchGetAssistantConnectionOptions()
    ]);
    rows.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
    models.value = options.data || [];
  } finally {
    loading.value = false;
  }
}

function search() {
  pagination.page = 1;
  load();
}

function resetSearch() {
  searchParams.keyword = '';
  searchParams.source = null;
  searchParams.enabled = null;
  search();
}

/** the next times of the schedule being typed, or why it is refused (asked a moment after the typing stops) */
const preview = ref<Api.Assistant.SchedulePreview>();
let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [form.schedule, visible.value],
  () => {
    clearTimeout(previewTimer);
    preview.value = undefined;
    const schedule = form.schedule.trim();
    if (!visible.value || !schedule) return;
    previewTimer = setTimeout(async () => {
      const { data } = await fetchPreviewAssistantSchedule(schedule);
      if (schedule === form.schedule.trim()) preview.value = data ?? undefined;
    }, 400);
  }
);

function open(row?: Api.Assistant.TaskRow) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      name: row.name,
      prompt: row.prompt,
      schedule: row.schedule,
      lang: row.lang,
      enabled: row.enabled,
      llm_id: row.llm_id,
      recipients: [...row.recipients]
    });
  }
  visible.value = true;
}

function check() {
  if (!form.name.trim()) return t('page.assistant.task.nameRequired');
  if (!form.prompt.trim()) return t('page.assistant.task.promptRequired');
  if (!form.schedule.trim()) return t('page.assistant.task.scheduleRequired');
  const bad = form.recipients.find(address => !EMAIL.test(address));
  if (bad) return t('page.assistant.task.invalidEmail', { email: bad });
  return '';
}

async function save() {
  const problem = check();
  if (problem) {
    message.warning(problem);
    return;
  }
  saving.value = true;
  try {
    const id = editing.value?.id;
    const data: Api.Assistant.TaskPayload = {
      ...form,
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule: form.schedule.trim()
    };
    const { error } = id ? await fetchUpdateAssistantTask(id, data) : await fetchCreateAssistantTask(data);
    if (!error) {
      visible.value = false;
      message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  const { error } = await fetchDeleteAssistantTask(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    checkedRowKeys.value = checkedRowKeys.value.filter(key => key !== id);
    await load();
  }
}

function batchRemove() {
  if (!checkedRowKeys.value.length) return;
  dialog.warning({
    title: t('common.tip'),
    content: t('page.assistant.task.confirmBatchDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    async onPositiveClick() {
      const { error } = await fetchBatchDeleteAssistantTasks(checkedRowKeys.value);
      if (error) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await load();
    }
  });
}

async function runNow(row: Api.Assistant.TaskRow) {
  const { error } = await fetchRunAssistantTask(row.id);
  if (!error) message.success(t('page.assistant.task.runQueued'));
}

// ---- the runs of a task
const runsVisible = ref(false);
const runsTask = ref<Api.Assistant.TaskRow>();
const runs = ref<Api.Assistant.TaskRun[]>([]);
const runsLoading = ref(false);
const runsPage = reactive({ page: 1, pageSize: 10, total: 0 });

async function loadRuns() {
  if (!runsTask.value) return;
  runsLoading.value = true;
  try {
    const { data } = await fetchGetAssistantTaskRuns(runsTask.value.id, {
      page: runsPage.page,
      page_size: runsPage.pageSize
    });
    runs.value = data?.list || [];
    runsPage.total = data?.total || 0;
  } finally {
    runsLoading.value = false;
  }
}

function openRuns(row: Api.Assistant.TaskRow) {
  runsTask.value = row;
  runsPage.page = 1;
  runs.value = [];
  runsVisible.value = true;
  loadRuns();
}

const statusType = (status: string) => (status === 'success' ? 'success' : status === 'failed' ? 'error' : 'info');
const statusText = (status: string) => t(`page.assistant.task.status_${status || 'none'}`);
const when = (value: string | null) => (value ? formatDateTime(value) : '-');

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: { title: t('page.assistant.name'), key: 'name', width: 190, resizable: true, ellipsis: { tooltip: true } },
  owner_name: { title: t('page.assistant.task.owner'), key: 'owner_name', width: 120, resizable: true },
  schedule: {
    title: t('page.assistant.task.schedule'),
    key: 'schedule',
    width: 140,
    resizable: true,
    render: (row: Api.Assistant.TaskRow) => h('code', row.schedule)
  },
  prompt: {
    title: t('page.assistant.task.prompt'),
    key: 'prompt',
    width: 320,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  recipients: {
    title: t('page.assistant.task.recipients'),
    key: 'recipients',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Assistant.TaskRow) => row.recipients.join(', ') || '-'
  },
  source: {
    title: t('page.assistant.task.source'),
    key: 'source',
    width: 110,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) =>
      h(NTag, { size: 'small', bordered: false, type: row.source === 'chat' ? 'info' : 'default' }, () =>
        t(`page.assistant.task.source_${row.source}`)
      )
  },
  next_run_at: {
    title: t('page.assistant.task.nextRun'),
    key: 'next_run_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) => (row.enabled ? when(row.next_run_at) : '-')
  },
  last_run_at: {
    title: t('page.assistant.task.lastRun'),
    key: 'last_run_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) => when(row.last_run_at)
  },
  last_status: {
    title: t('page.assistant.task.lastResult'),
    key: 'last_status',
    width: 110,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) =>
      h(NTag, { size: 'small', bordered: false, type: row.last_status ? statusType(row.last_status) : 'default' }, () =>
        statusText(row.last_status)
      )
  },
  enabled: {
    title: t('common.status'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.TaskRow) => when(row.created_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([
      t('page.assistant.task.runNow'),
      t('page.assistant.task.runs'),
      t('common.edit'),
      t('common.delete')
    ]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Assistant.TaskRow) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'info', onClick: () => runNow(row) }, () => t('page.assistant.task.runNow')),
        h(NButton, { size: 'tiny', onClick: () => openRuns(row) }, () => t('page.assistant.task.runs')),
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
};

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
  defaultKeys: [
    '__selection__',
    'id',
    'name',
    'owner_name',
    'schedule',
    'recipients',
    'next_run_at',
    'last_status',
    'enabled',
    'actions'
  ]
});

const drawerTitle = computed(() => (editing.value ? t('page.assistant.task.edit') : t('page.assistant.task.add')));

onMounted(() => {
  initColumnConfig();
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="searchParams" label-placement="top" :show-feedback="false">
            <NGrid class="list-search-row" :cols="24" :x-gap="24">
              <NFormItemGi :span="8" :label="t('page.assistant.keyword')" path="keyword">
                <NInput
                  v-model:value="searchParams.keyword"
                  clearable
                  :placeholder="t('page.assistant.task.keywordPlaceholder')"
                  @keyup.enter="search"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="t('page.assistant.task.source')"
                path="source"
              >
                <NSelect
                  v-model:value="searchParams.source"
                  clearable
                  :placeholder="t('common.selectField', { field: t('page.assistant.task.source') })"
                  :options="sourceOptions"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="t('common.status')"
                path="enabled"
              >
                <NSelect
                  v-model:value="searchParams.enabled"
                  clearable
                  :placeholder="t('common.selectField', { field: t('common.status') })"
                  :options="enabledOptions"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="8">
                <NSpace justify="end" class="w-full">
                  <NButton @click="resetSearch">
                    <template #icon><icon-ic-round-refresh /></template>
                    {{ t('common.reset') }}
                  </NButton>
                  <NButton type="primary" @click="search">
                    <template #icon><icon-ic-round-search /></template>
                    {{ t('common.search') }}
                  </NButton>
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
          :disabled-delete="checkedRowKeys.length === 0"
          @add="open()"
          @delete="batchRemove"
          @refresh="load"
        />
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :data="rows"
            :loading="loading"
            :pagination="pagination"
            :checked-row-keys="checkedRowKeys"
            :row-key="row => row.id"
            :size="density"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @update:checked-row-keys="keys => (checkedRowKeys = keys as number[])"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NDrawer v-model:show="visible" :width="600" placement="right">
      <NDrawerContent :title="drawerTitle" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top">
          <div class="task-name-row">
            <NFormItem class="flex-1" :label="t('page.assistant.name')" required>
              <NInput
                v-model:value="form.name"
                maxlength="100"
                :placeholder="t('common.inputField', { field: t('page.assistant.name') })"
              />
            </NFormItem>
            <NFormItem :label="t('page.assistant.enabled')">
              <NSwitch v-model:value="form.enabled" />
            </NFormItem>
          </div>
          <NFormItem required>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.task.schedule') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.assistant.task.scheduleHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <div class="w-full">
              <NInput v-model:value="form.schedule" :placeholder="t('page.assistant.task.schedulePlaceholder')" />
              <div v-if="preview" class="mt-6px text-12px leading-20px">
                <span v-if="preview.error" class="text-error">{{ preview.error }}</span>
                <span v-else class="opacity-70">
                  {{ t('page.assistant.task.nextTimes') }} ({{ preview.time_zone }}):
                  {{ preview.next.map(item => formatDateTime(item)).join(' · ') }}
                </span>
              </div>
            </div>
          </NFormItem>
          <NFormItem required>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.task.prompt') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.assistant.task.promptHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInput
              v-model:value="form.prompt"
              type="textarea"
              :rows="7"
              maxlength="2000"
              show-count
              :placeholder="t('page.assistant.task.promptPlaceholder')"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.task.recipients') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.assistant.task.recipientsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NDynamicTags
              v-model:value="form.recipients"
              :max="10"
              :input-props="{ placeholder: t('page.assistant.task.recipientsPlaceholder') }"
            />
          </NFormItem>
          <NGrid :cols="2" :x-gap="16">
            <NFormItemGi :label="t('page.assistant.task.language')">
              <NSelect v-model:value="form.lang" :options="langOptions" />
            </NFormItemGi>
            <NFormItemGi>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.assistant.task.model') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.assistant.task.modelHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.llm_id" :options="modelOptions" />
            </NFormItemGi>
          </NGrid>
        </NForm>
        <template #footer>
          <NSpace justify="end" class="w-full">
            <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>

    <NModal
      v-model:show="runsVisible"
      preset="card"
      class="w-860px max-w-95vw"
      :title="t('page.assistant.task.runsTitle', { name: runsTask?.name ?? '' })"
    >
      <NSpin :show="runsLoading">
        <div class="runs-body">
          <NEmpty v-if="!runs.length && !runsLoading" :description="t('page.assistant.task.noRuns')" />
          <NCollapse v-else accordion>
            <NCollapseItem v-for="run in runs" :key="run.id" :name="run.id">
              <template #header>
                <NSpace align="center" :size="10">
                  <NTag size="small" :bordered="false" :type="statusType(run.status)">
                    {{ statusText(run.status) }}
                  </NTag>
                  <span>{{ when(run.started_at) }}</span>
                  <span class="opacity-60">{{ t(`page.assistant.task.trigger_${run.trigger}`) }}</span>
                </NSpace>
              </template>
              <div class="run-detail">
                <div v-if="run.error" class="text-error mb-8px">{{ run.error }}</div>
                <div class="mb-8px opacity-70">
                  {{ t('page.assistant.task.finishedAt') }}: {{ when(run.finished_at) }}
                  <template v-if="run.delivered.length">
                    · {{ t('page.assistant.task.deliveredTo') }}: {{ run.delivered.join(', ') }}
                  </template>
                  <template v-if="run.tools">· {{ t('page.assistant.task.tools') }}: {{ run.tools }}</template>
                </div>
                <pre class="run-output">{{ run.output || t('page.assistant.task.noOutput') }}</pre>
              </div>
            </NCollapseItem>
          </NCollapse>
        </div>
      </NSpin>
      <template #footer>
        <div class="flex justify-end">
          <NPagination
            v-model:page="runsPage.page"
            :page-size="runsPage.pageSize"
            :item-count="runsPage.total"
            @update:page="loadRuns"
          />
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.task-name-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.runs-body {
  min-height: 160px;
  max-height: 60vh;
  overflow: auto;
}

.run-output {
  margin: 0;
  padding: 12px;
  max-height: 340px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 8px;
  background: var(--n-color-embedded, rgb(128 128 128 / 0.1));
}
</style>
