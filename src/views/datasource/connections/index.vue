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
  NSwitch,
  NTag,
  NTooltip,
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
  fetchBatchDeleteDatasources,
  fetchCreateDatasource,
  fetchDeleteDatasource,
  fetchGetDatasources,
  fetchTestDatasource,
  fetchUpdateDatasource
} from '@/service/api/datasource';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { operateWidth } from '@/utils/operate-width';

const PAGE_CODE = 'datasource_manage';
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const loading = ref(false);
const saving = ref(false);
const testingId = ref<number>();
const rows = ref<Api.Datasource.Datasource[]>([]);
const checkedRowKeys = ref<number[]>([]);
const visible = ref(false);
const editing = ref<Api.Datasource.Datasource>();

const searchParams = reactive<{
  keyword: string;
  status: Api.Datasource.ProbeStatus | null;
  enabled: 'true' | 'false' | null;
}>({
  keyword: '',
  status: null,
  enabled: null
});

const statusOptions = computed(() =>
  (['ok', 'error', 'unknown'] as const).map(value => ({
    label: t(`page.datasource.connections.status_${value}`),
    value
  }))
);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);
const authOptions = computed(() =>
  (['none', 'basic', 'bearer'] as const).map(value => ({
    label: t(`page.datasource.connections.auth_${value}`),
    value
  }))
);

function emptyForm() {
  return {
    name: '',
    base_url: '',
    auth_type: 'none' as Api.Datasource.AuthType,
    username: '',
    password: '',
    bearer_token: '',
    tls_skip_verify: false,
    ca_cert: '',
    clear_ca_cert: false,
    timeout_seconds: 30,
    max_concurrency: 1,
    enabled: true,
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
    const { data } = await fetchGetDatasources({
      page: pagination.page,
      page_size: pagination.pageSize,
      keyword: searchParams.keyword.trim() || undefined,
      status: searchParams.status ?? undefined,
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
  searchParams.status = null;
  searchParams.enabled = null;
  search();
}

function open(row?: Api.Datasource.Datasource) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      name: row.name,
      base_url: row.base_url,
      auth_type: row.auth_type,
      username: row.username,
      tls_skip_verify: row.tls_skip_verify,
      timeout_seconds: row.timeout_seconds,
      max_concurrency: row.max_concurrency,
      enabled: row.enabled,
      remark: row.remark
    });
  }
  visible.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning(t('page.datasource.connections.nameRequired'));
    return;
  }
  if (!form.base_url.trim()) {
    message.warning(t('page.datasource.connections.baseUrlRequired'));
    return;
  }
  const payload: Api.Datasource.DatasourcePayload = {
    name: form.name.trim(),
    base_url: form.base_url.trim(),
    auth_type: form.auth_type,
    username: form.auth_type === 'basic' ? form.username.trim() : '',
    password: form.auth_type === 'basic' ? form.password : '',
    bearer_token: form.auth_type === 'bearer' ? form.bearer_token : '',
    tls_skip_verify: form.tls_skip_verify,
    ca_cert: form.ca_cert,
    clear_ca_cert: form.clear_ca_cert,
    timeout_seconds: form.timeout_seconds,
    max_concurrency: form.max_concurrency,
    enabled: form.enabled,
    remark: form.remark
  };
  saving.value = true;
  try {
    const id = editing.value?.id;
    const { error } = id ? await fetchUpdateDatasource(id, payload) : await fetchCreateDatasource(payload);
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
  const { error } = await fetchDeleteDatasource(id);
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
      const { error } = await fetchBatchDeleteDatasources(checkedRowKeys.value);
      if (error) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await load();
    }
  });
}

async function runTest(row: Api.Datasource.Datasource) {
  testingId.value = row.id;
  try {
    const { data, error } = await fetchTestDatasource(row.id);
    if (error || !data) return;
    if (data.status === 'ok') {
      message.success(t('page.datasource.connections.testOk', { ms: data.latency_ms }));
    } else {
      message.error(`${t('page.datasource.connections.testFailed')}: ${data.error}`);
    }
    await load();
  } finally {
    testingId.value = undefined;
  }
}

function renderStatus(row: Api.Datasource.Datasource) {
  const tag = h(
    NTag,
    { type: row.status === 'ok' ? 'success' : row.status === 'error' ? 'error' : 'default', bordered: false },
    { default: () => t(`page.datasource.connections.status_${row.status}`) }
  );
  if (row.status !== 'error' || !row.last_error) return tag;
  return h(NTooltip, null, { trigger: () => tag, default: () => row.last_error });
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: { title: t('page.datasource.connections.name'), key: 'name', width: 180, resizable: true },
  base_url: { title: t('page.datasource.connections.baseUrl'), key: 'base_url', width: 280, resizable: true },
  auth_type: {
    title: t('page.datasource.connections.authType'),
    key: 'auth_type',
    width: 110,
    align: 'center',
    render: (row: Api.Datasource.Datasource) => t(`page.datasource.connections.auth_${row.auth_type}`)
  },
  status: {
    title: t('common.status'),
    key: 'status',
    width: 110,
    align: 'center',
    render: renderStatus
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.Datasource.Datasource) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  server_version: { title: t('page.datasource.connections.serverVersion'), key: 'server_version', width: 120 },
  last_latency_ms: {
    title: t('page.datasource.connections.latency'),
    key: 'last_latency_ms',
    width: 110,
    align: 'center',
    render: (row: Api.Datasource.Datasource) => (row.last_checked_at ? `${row.last_latency_ms} ms` : '-')
  },
  last_checked_at: {
    title: t('page.datasource.connections.lastChecked'),
    key: 'last_checked_at',
    width: 170,
    align: 'center',
    render: (row: Api.Datasource.Datasource) => (row.last_checked_at ? formatDateTime(row.last_checked_at) : '-')
  },
  mapping_count: {
    title: t('page.datasource.connections.mappingCount'),
    key: 'mapping_count',
    width: 110,
    align: 'center'
  },
  timeout_seconds: {
    title: t('page.datasource.connections.timeoutSeconds'),
    key: 'timeout_seconds',
    width: 110,
    align: 'center'
  },
  max_concurrency: {
    title: t('page.datasource.connections.maxConcurrency'),
    key: 'max_concurrency',
    width: 110,
    align: 'center'
  },
  remark: { title: t('common.remark'), key: 'remark', width: 200, resizable: true },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.Datasource.Datasource) => formatDateTime(row.created_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([t('page.datasource.connections.test'), t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Datasource.Datasource) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(
          NButton,
          { size: 'tiny', type: 'info', loading: testingId.value === row.id, onClick: () => runTest(row) },
          () => t('page.datasource.connections.test')
        ),
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

const defaultColumnKeys = [
  '__selection__',
  'name',
  'base_url',
  'status',
  'enabled',
  'auth_type',
  'server_version',
  'last_latency_ms',
  'last_checked_at',
  'mapping_count',
  'actions'
];

const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({ pageCode: PAGE_CODE, columnMap, defaultKeys: defaultColumnKeys });

const modalTitle = computed(() =>
  editing.value ? t('page.datasource.connections.editTitle') : t('page.datasource.connections.addTitle')
);
const secretPlaceholder = computed(() => (editing.value ? t('page.datasource.connections.secretKeep') : ''));

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
              <NFormItemGi :span="8" :label="t('page.datasource.connections.keyword')" path="keyword">
                <NInput
                  v-model:value="searchParams.keyword"
                  clearable
                  :placeholder="t('page.datasource.connections.keywordPlaceholder')"
                  @keyup.enter="search"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="5"
                :label="t('common.status')"
                path="status"
              >
                <NSelect
                  v-model:value="searchParams.status"
                  clearable
                  :placeholder="t('common.selectField', { field: t('common.status') })"
                  :options="statusOptions"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="5"
                :label="t('page.datasource.connections.enabled')"
                path="enabled"
              >
                <NSelect
                  v-model:value="searchParams.enabled"
                  clearable
                  :placeholder="t('common.selectField', { field: t('page.datasource.connections.enabled') })"
                  :options="enabledOptions"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="6">
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
        <NFormItem :label="t('page.datasource.connections.name')">
          <NInput
            v-model:value="form.name"
            :placeholder="t('common.inputField', { field: t('page.datasource.connections.name') })"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.baseUrl') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.baseUrlHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInput v-model:value="form.base_url" placeholder="https://prometheus.example.com:9090" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.connections.authType')">
          <NSelect
            v-model:value="form.auth_type"
            :placeholder="t('common.selectField', { field: t('page.datasource.connections.authType') })"
            :options="authOptions"
          />
        </NFormItem>
        <NFormItem v-if="form.auth_type === 'basic'" :label="t('page.datasource.connections.username')">
          <NInput
            v-model:value="form.username"
            :placeholder="t('common.inputField', { field: t('page.datasource.connections.username') })"
          />
        </NFormItem>
        <NFormItem v-if="form.auth_type === 'basic'" :label="t('page.datasource.connections.password')">
          <NInput
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="
              secretPlaceholder || t('common.inputField', { field: t('page.datasource.connections.password') })
            "
          />
        </NFormItem>
        <NFormItem v-if="form.auth_type === 'bearer'" :label="t('page.datasource.connections.bearerToken')">
          <NInput
            v-model:value="form.bearer_token"
            type="password"
            show-password-on="click"
            :placeholder="
              secretPlaceholder || t('common.inputField', { field: t('page.datasource.connections.bearerToken') })
            "
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.tlsSkipVerify') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.tlsSkipVerifyHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSwitch v-model:value="form.tls_skip_verify" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.timeoutSeconds') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.timeoutHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInputNumber v-model:value="form.timeout_seconds" :min="1" :max="300" class="w-full" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.maxConcurrency') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.maxConcurrencyHint') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NInputNumber v-model:value="form.max_concurrency" :min="1" :precision="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.datasource.connections.enabled')">
          <StatusSelect v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.datasource.connections.caCert') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.datasource.connections.caCertHint') }}</div>
              </IconTooltip>
              <NTag v-if="editing?.has_ca_cert && !form.clear_ca_cert" size="small" :bordered="false" type="success">
                {{ t('page.datasource.connections.caCertSaved') }}
              </NTag>
            </span>
          </template>
          <NInput
            v-model:value="form.ca_cert"
            type="textarea"
            :rows="3"
            :placeholder="
              editing?.has_ca_cert ? t('page.datasource.connections.secretKeep') : '-----BEGIN CERTIFICATE-----'
            "
          />
        </NFormItem>
        <NFormItem v-if="editing?.has_ca_cert" :label="t('page.datasource.connections.clearCaCert')">
          <NSwitch v-model:value="form.clear_ca_cert" />
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
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped></style>
