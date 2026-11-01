<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItem,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useDialog,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import StatusSelect from '@/components/business/status-select.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchDeleteAssistantConnections,
  fetchCreateAssistantConnection,
  fetchDeleteAssistantConnection,
  fetchGetAssistantConnections,
  fetchTestAssistantConnection,
  fetchUpdateAssistantConnection
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { operateWidth } from '@/utils/operate-width';
import { copyCell } from '@/utils/copy-cell';

defineOptions({ name: 'Assistant' });

/**
 * The menu "AI assistant": the language models the assistant may talk to. The assistant itself (the window at the top right of the
 * header) is switched on and off by the system parameter assistant.enabled; which model it asks, with what key and what limits, is
 * set here. One connection is enabled at a time.
 */
const PAGE_CODE = 'assistant_connections';
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const rows = ref<Api.Assistant.Connection[]>([]);
const checkedRowKeys = ref<number[]>([]);
const visible = ref(false);
const editing = ref<Api.Assistant.Connection>();

const searchParams = reactive<{ keyword: string; enabled: 'true' | 'false' | null }>({ keyword: '', enabled: null });
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);

function emptyForm(): Api.Assistant.ConnectionPayload {
  return {
    name: '',
    endpoint: 'https://api.openai.com/v1',
    model: '',
    api_key: '',
    enabled: true,
    timeout_seconds: 60,
    max_tool_rounds: 6,
    max_reply_tokens: 1500,
    remark: ''
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
    const { data } = await fetchGetAssistantConnections({
      page: pagination.page,
      page_size: pagination.pageSize,
      keyword: searchParams.keyword.trim() || undefined,
      enabled: searchParams.enabled === null ? undefined : searchParams.enabled === 'true'
    });
    rows.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
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
  searchParams.enabled = null;
  search();
}

function open(row?: Api.Assistant.Connection) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      name: row.name,
      endpoint: row.endpoint,
      model: row.model,
      enabled: row.enabled,
      timeout_seconds: row.timeout_seconds,
      max_tool_rounds: row.max_tool_rounds,
      max_reply_tokens: row.max_reply_tokens,
      remark: row.remark
    });
  }
  visible.value = true;
}

/** the form as the server takes it; the id lets an empty key mean the stored one */
function payload(): Api.Assistant.ConnectionPayload {
  return {
    ...form,
    id: editing.value?.id,
    name: form.name.trim(),
    endpoint: form.endpoint.trim(),
    model: form.model.trim()
  };
}

function check() {
  if (!form.name.trim()) return t('page.assistant.nameRequired');
  if (!form.endpoint.trim()) return t('page.assistant.endpointRequired');
  if (!form.model.trim()) return t('page.assistant.modelRequired');
  if (!form.api_key.trim() && !editing.value?.has_api_key) return t('page.assistant.keyRequired');
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
    const { error } = id
      ? await fetchUpdateAssistantConnection(id, payload())
      : await fetchCreateAssistantConnection(payload());
    if (!error) {
      visible.value = false;
      message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      await load();
    }
  } finally {
    saving.value = false;
  }
}

/** asks the connection the form holds right now: what is tested is what is on the screen */
async function runTest() {
  const problem = check();
  if (problem) {
    message.warning(problem);
    return;
  }
  testing.value = true;
  try {
    const { data, error } = await fetchTestAssistantConnection(payload());
    if (error || !data) return;
    if (data.ok) message.success(t('page.assistant.testOk', { ms: data.latency_ms }));
    else message.error(`${t('page.assistant.testFailed')}: ${data.message}`, { duration: 8000, closable: true });
  } finally {
    testing.value = false;
  }
}

async function remove(id: number) {
  const { error } = await fetchDeleteAssistantConnection(id);
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
    content: t('common.confirmBatchDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    async onPositiveClick() {
      const { error } = await fetchBatchDeleteAssistantConnections(checkedRowKeys.value);
      if (error) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await load();
    }
  });
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  name: { title: t('page.assistant.name'), key: 'name', width: 160, resizable: true },
  endpoint: {
    title: t('page.assistant.endpoint'),
    key: 'endpoint',
    width: 300,
    resizable: true,
    render: (row: Api.Assistant.Connection) => copyCell(row.endpoint)
  },
  model: { title: t('page.assistant.model'), key: 'model', width: 180, resizable: true },
  enabled: {
    title: t('common.status'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.Assistant.Connection) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  has_api_key: {
    title: t('page.assistant.apiKey'),
    key: 'has_api_key',
    width: 110,
    align: 'center',
    render: (row: Api.Assistant.Connection) =>
      h(
        NTag,
        { type: row.has_api_key ? 'success' : 'warning', bordered: false },
        { default: () => (row.has_api_key ? t('page.assistant.keySaved') : t('page.assistant.keyMissing')) }
      )
  },
  timeout_seconds: { title: t('page.assistant.timeoutSeconds'), key: 'timeout_seconds', width: 110, align: 'center' },
  max_tool_rounds: { title: t('page.assistant.maxToolRounds'), key: 'max_tool_rounds', width: 110, align: 'center' },
  max_reply_tokens: { title: t('page.assistant.maxReplyTokens'), key: 'max_reply_tokens', width: 110, align: 'center' },
  remark: { title: t('common.remark'), key: 'remark', width: 200, resizable: true },
  updated_at: {
    title: t('common.updateTime'),
    key: 'updated_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.Connection) => formatDateTime(row.updated_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Assistant.Connection) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
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
  defaultKeys: ['__selection__', 'name', 'endpoint', 'model', 'enabled', 'has_api_key', 'updated_at', 'actions']
});

const modalTitle = computed(() => (editing.value ? t('page.assistant.editTitle') : t('page.assistant.addTitle')));

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
                  :placeholder="t('page.assistant.keywordPlaceholder')"
                  @keyup.enter="search"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="5"
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
              <NGi class="list-search-actions" :span="11">
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

    <NModal v-model:show="visible" preset="card" :title="modalTitle" class="edit-modal-wide">
      <NForm :model="form" label-placement="top">
        <NFormItem :label="t('page.assistant.name')">
          <NInput
            v-model:value="form.name"
            :placeholder="t('common.inputField', { field: t('page.assistant.name') })"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.assistant.endpoint') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.assistant.endpointHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.endpoint" placeholder="https://api.openai.com/v1" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.assistant.model') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.assistant.modelHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.model" placeholder="gpt-4o-mini" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.assistant.apiKey') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.assistant.apiKeyHint') }}</div>
              </IconTooltip>
              <NTag v-if="editing?.has_api_key" size="small" :bordered="false" type="success">
                {{ t('page.assistant.keySaved') }}
              </NTag>
            </span>
          </template>
          <NInput
            v-model:value="form.api_key"
            type="password"
            show-password-on="click"
            :placeholder="
              editing?.has_api_key
                ? t('page.assistant.keyKeep')
                : t('common.inputField', { field: t('page.assistant.apiKey') })
            "
          />
        </NFormItem>
        <NGrid :cols="3" :x-gap="16">
          <NFormItemGi>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.timeoutSeconds') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.assistant.timeoutHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.timeout_seconds" :min="5" :max="300" :precision="0" class="w-full" />
          </NFormItemGi>
          <NFormItemGi>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.maxToolRounds') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.assistant.maxToolRoundsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.max_tool_rounds" :min="1" :max="12" :precision="0" class="w-full" />
          </NFormItemGi>
          <NFormItemGi>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.maxReplyTokens') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.assistant.maxReplyTokensHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.max_reply_tokens" :min="128" :max="8192" :precision="0" class="w-full" />
          </NFormItemGi>
        </NGrid>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('common.status') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.assistant.enabledHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <StatusSelect v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem :label="t('common.remark')">
          <NInput
            v-model:value="form.remark"
            type="textarea"
            :placeholder="t('common.inputField', { field: t('common.remark') })"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="space-between">
          <NButton secondary type="info" :loading="testing" @click="runTest">{{ t('page.assistant.test') }}</NButton>
          <NSpace justify="end">
            <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
          </NSpace>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
