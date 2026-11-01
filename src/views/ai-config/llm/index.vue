<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSpace,
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
  fetchBatchDeleteAssistantConnections,
  fetchCreateAssistantConnection,
  fetchDeleteAssistantConnection,
  fetchGetAssistantConnections,
  fetchTestAssistantConnection,
  fetchUpdateAssistantConnection
} from '@/service/api';
import { copyCell } from '@/utils/copy-cell';
import { formatDateTime } from '@/utils/date';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'AiConfigLlm' });

/**
 * LLM management: the language models the AI assistant may use. Several may be enabled; the default one answers the questions and the
 * skills that name no model of their own. The assistant itself (the window at the top right of the header) is switched on and off by the
 * system parameter assistant.enabled.
 */
const PAGE_CODE = 'ai_config_llm';
const MASK = '********';
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
const advanced = ref<string[]>([]);

const searchParams = reactive<{ keyword: string; enabled: 'true' | 'false' | null }>({ keyword: '', enabled: null });
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);
const providerOptions = computed(() => [{ label: t('page.assistant.provider_openai'), value: 'openai' }]);

interface Form {
  name: string;
  description: string;
  provider: 'openai';
  endpoint: string;
  model: string;
  api_key: string;
  enabled: boolean;
  is_default: boolean;
  timeout_seconds: number;
  skip_tls_verify: boolean;
  proxy_url: string;
  headers: Api.Assistant.Header[];
  custom_params: string;
  temperature: number | null;
  max_tokens: number | null;
  context_length: number | null;
  max_tool_rounds: number;
}

function emptyForm(): Form {
  return {
    name: '',
    description: '',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: '',
    api_key: '',
    enabled: true,
    is_default: false,
    timeout_seconds: 90,
    skip_tls_verify: false,
    proxy_url: '',
    headers: [],
    custom_params: '',
    temperature: null,
    max_tokens: null,
    context_length: null,
    max_tool_rounds: 6
  };
}
const form = reactive<Form>(emptyForm());

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
  advanced.value = [];
  if (row) {
    Object.assign(form, {
      name: row.name,
      description: row.description,
      provider: row.provider || 'openai',
      endpoint: row.endpoint,
      model: row.model,
      enabled: row.enabled,
      is_default: row.is_default,
      timeout_seconds: row.timeout_seconds,
      skip_tls_verify: row.skip_tls_verify,
      proxy_url: row.proxy_url,
      headers: row.headers.map(header => ({ ...header })),
      custom_params: row.custom_params,
      temperature: row.temperature,
      max_tokens: row.max_tokens || null,
      context_length: row.context_length || null,
      max_tool_rounds: row.max_tool_rounds
    });
    // what was set is shown, not folded away
    if (row.skip_tls_verify || row.proxy_url || row.headers.length || row.custom_params || row.temperature !== null) {
      advanced.value = ['advanced'];
    }
  }
  visible.value = true;
}

function addHeader() {
  form.headers.push({ key: '', value: '' });
}

/** the default model is an enabled one: switching it on in the form enables the connection, switching the connection off drops it */
function onEnabled(value: boolean) {
  form.enabled = value;
  if (!value) form.is_default = false;
}
function onDefault(value: boolean) {
  form.is_default = value;
  if (value) form.enabled = true;
}

/** the form as the server takes it; the id lets the stored key and header values stand where the form leaves them out */
function payload(): Api.Assistant.ConnectionPayload {
  return {
    ...form,
    id: editing.value?.id,
    name: form.name.trim(),
    description: form.description.trim(),
    endpoint: form.endpoint.trim(),
    model: form.model.trim(),
    proxy_url: form.proxy_url.trim(),
    custom_params: form.custom_params.trim(),
    headers: form.headers.filter(header => header.key.trim() || header.value),
    max_tokens: form.max_tokens ?? 0,
    context_length: form.context_length ?? 0
  };
}

function check() {
  if (!form.name.trim()) return t('page.assistant.nameRequired');
  if (!form.model.trim()) return t('page.assistant.modelRequired');
  if (!form.endpoint.trim()) return t('page.assistant.endpointRequired');
  if (!form.api_key.trim() && !editing.value?.has_api_key) return t('page.assistant.keyRequired');
  const params = form.custom_params.trim();
  if (params) {
    try {
      const parsed = JSON.parse(params);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    } catch {
      return t('page.assistant.paramsInvalid');
    }
  }
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

/** asks the model the form holds right now: what is tested is what is on the screen */
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
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: {
    title: t('page.assistant.name'),
    key: 'name',
    width: 200,
    resizable: true,
    render: (row: Api.Assistant.Connection) =>
      h('span', { class: 'inline-flex items-center gap-6px' }, [
        row.name,
        row.is_default
          ? h(NTag, { size: 'small', round: true, bordered: true, type: 'primary' }, () => t('page.assistant.default'))
          : null
      ])
  },
  description: {
    title: t('page.assistant.description'),
    key: 'description',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Assistant.Connection) => row.description || '-'
  },
  provider: {
    title: t('page.assistant.provider'),
    key: 'provider',
    width: 130,
    render: (row: Api.Assistant.Connection) => t(`page.assistant.provider_${row.provider}`, row.provider)
  },
  model: { title: t('page.assistant.model'), key: 'model', width: 220, resizable: true },
  endpoint: {
    title: t('page.assistant.endpoint'),
    key: 'endpoint',
    width: 300,
    resizable: true,
    render: (row: Api.Assistant.Connection) => copyCell(row.endpoint)
  },
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
  max_tokens: {
    title: t('page.assistant.maxTokens'),
    key: 'max_tokens',
    width: 110,
    align: 'center',
    render: (row: Api.Assistant.Connection) => (row.max_tokens ? String(row.max_tokens) : '-')
  },
  context_length: {
    title: t('page.assistant.contextLength'),
    key: 'context_length',
    width: 110,
    align: 'center',
    render: (row: Api.Assistant.Connection) => (row.context_length ? String(row.context_length) : '-')
  },
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
  defaultKeys: ['__selection__', 'id', 'name', 'description', 'provider', 'model', 'enabled', 'actions']
});

const drawerTitle = computed(() => (editing.value ? t('page.assistant.editTitle') : t('page.assistant.addTitle')));

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

    <NDrawer v-model:show="visible" :width="560" placement="right">
      <NDrawerContent :title="drawerTitle" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top">
          <div class="llm-name-row">
            <NFormItem class="flex-1" :label="t('page.assistant.name')" required>
              <NInput
                v-model:value="form.name"
                :placeholder="t('common.inputField', { field: t('page.assistant.name') })"
              />
            </NFormItem>
            <NFormItem :label="t('page.assistant.enabled')">
              <NSwitch :value="form.enabled" @update:value="onEnabled" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.assistant.default') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.assistant.defaultHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSwitch :value="form.is_default" @update:value="onDefault" />
            </NFormItem>
          </div>
          <NFormItem :label="t('page.assistant.description')">
            <NInput
              v-model:value="form.description"
              type="textarea"
              :rows="2"
              :placeholder="t('common.inputField', { field: t('page.assistant.description') })"
            />
          </NFormItem>
          <NGrid :cols="2" :x-gap="16">
            <NFormItemGi :label="t('page.assistant.provider')" required>
              <NSelect v-model:value="form.provider" :options="providerOptions" />
            </NFormItemGi>
            <NFormItemGi required>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.assistant.model') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.assistant.modelHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInput v-model:value="form.model" placeholder="gpt-4o-mini" />
            </NFormItemGi>
          </NGrid>
          <NFormItem required>
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
          <NFormItem :required="!editing?.has_api_key">
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

          <NCollapse v-model:expanded-names="advanced" class="llm-advanced">
            <NCollapseItem :title="t('page.assistant.advanced')" name="advanced">
              <NGrid :cols="2" :x-gap="16">
                <NFormItemGi>
                  <template #label>
                    <span class="inline-flex items-center gap-4px">
                      {{ t('page.assistant.timeoutSeconds') }}
                      <IconTooltip icon="mdi-help-circle" placement="top">
                        <div class="max-w-320px leading-22px">{{ t('page.assistant.timeoutHint') }}</div>
                      </IconTooltip>
                    </span>
                  </template>
                  <NInputNumber
                    v-model:value="form.timeout_seconds"
                    :min="5"
                    :max="600"
                    :precision="0"
                    class="w-full"
                  />
                </NFormItemGi>
                <NFormItemGi>
                  <template #label>
                    <span class="inline-flex items-center gap-4px">
                      {{ t('page.assistant.skipTls') }}
                      <IconTooltip icon="mdi-help-circle" placement="top">
                        <div class="max-w-320px leading-22px">{{ t('page.assistant.skipTlsHint') }}</div>
                      </IconTooltip>
                    </span>
                  </template>
                  <NSwitch v-model:value="form.skip_tls_verify" />
                </NFormItemGi>
              </NGrid>
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.assistant.proxy') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-320px leading-22px">{{ t('page.assistant.proxyHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NInput v-model:value="form.proxy_url" placeholder="http://proxy:8080" />
              </NFormItem>
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.assistant.headers') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-320px leading-22px">{{ t('page.assistant.headersHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <div class="w-full flex-col gap-8px">
                  <div v-for="(header, i) in form.headers" :key="i" class="flex items-center gap-8px">
                    <div class="w-40% min-w-0">
                      <NInput v-model:value="header.key" placeholder="Header" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <NInput
                        v-model:value="header.value"
                        type="password"
                        show-password-on="click"
                        :placeholder="header.value === MASK ? t('page.assistant.keyKeep') : 'Value'"
                      />
                    </div>
                    <NButton size="small" quaternary type="error" @click="form.headers.splice(i, 1)">
                      {{ t('common.delete') }}
                    </NButton>
                  </div>
                  <NButton dashed block @click="addHeader">+ {{ t('page.assistant.addHeader') }}</NButton>
                </div>
              </NFormItem>
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.assistant.customParams') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-320px leading-22px">{{ t('page.assistant.customParamsHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NInput v-model:value="form.custom_params" type="textarea" :rows="4" placeholder='{"key": "value"}' />
              </NFormItem>
              <NGrid :cols="3" :x-gap="16">
                <NFormItemGi>
                  <template #label>
                    <span class="inline-flex items-center gap-4px">
                      {{ t('page.assistant.temperature') }}
                      <IconTooltip icon="mdi-help-circle" placement="top">
                        <div class="max-w-320px leading-22px">{{ t('page.assistant.temperatureHint') }}</div>
                      </IconTooltip>
                    </span>
                  </template>
                  <NInputNumber
                    v-model:value="form.temperature"
                    :min="0"
                    :max="2"
                    :step="0.1"
                    clearable
                    placeholder="0.7"
                    class="w-full"
                  />
                </NFormItemGi>
                <NFormItemGi>
                  <template #label>
                    <span class="inline-flex items-center gap-4px">
                      {{ t('page.assistant.maxTokens') }}
                      <IconTooltip icon="mdi-help-circle" placement="top">
                        <div class="max-w-320px leading-22px">{{ t('page.assistant.maxTokensHint') }}</div>
                      </IconTooltip>
                    </span>
                  </template>
                  <NInputNumber
                    v-model:value="form.max_tokens"
                    :min="128"
                    :max="65536"
                    :precision="0"
                    clearable
                    placeholder="4096"
                    class="w-full"
                  />
                </NFormItemGi>
                <NFormItemGi>
                  <template #label>
                    <span class="inline-flex items-center gap-4px">
                      {{ t('page.assistant.contextLength') }}
                      <IconTooltip icon="mdi-help-circle" placement="top">
                        <div class="max-w-320px leading-22px">{{ t('page.assistant.contextLengthHint') }}</div>
                      </IconTooltip>
                    </span>
                  </template>
                  <NInputNumber
                    v-model:value="form.context_length"
                    :min="1024"
                    :max="2000000"
                    :precision="0"
                    clearable
                    placeholder="128000"
                    class="w-full"
                  />
                </NFormItemGi>
              </NGrid>
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.assistant.maxToolRounds') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-320px leading-22px">{{ t('page.assistant.maxToolRoundsHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NInputNumber v-model:value="form.max_tool_rounds" :min="1" :max="12" :precision="0" class="w-full" />
              </NFormItem>
            </NCollapseItem>
          </NCollapse>
        </NForm>
        <template #footer>
          <NSpace justify="space-between" class="w-full">
            <NButton secondary type="info" :loading="testing" @click="runTest">{{ t('page.assistant.test') }}</NButton>
            <NSpace justify="end">
              <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
              <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
            </NSpace>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.llm-name-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.llm-advanced :deep(.n-collapse-item__header) {
  padding-top: 0;
}
</style>
