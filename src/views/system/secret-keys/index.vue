<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
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
import HelpLabel from '@/components/common/help-label.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import CopyText from '@/components/common/copy-text.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchCreateSecretKey,
  fetchDeleteSecretKey,
  fetchGetSecretKeys,
  fetchUpdateSecretKey
} from '@/service/api/system';
import { fetchAllPermissions } from '@/service/api/permission';
import { copyText } from '@/utils/copy';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

const PAGE_CODE = 'system_secret_keys';
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const loading = ref(false);
const rows = ref<any[]>([]);
const checkedRowKeys = ref<number[]>([]);
const visible = ref(false);
const editing = ref<number>();
const credentialVisible = ref(false);
const credential = reactive({ accessKey: '', accessSecret: '' });
/**
 * What a credential is for: the cluster component that calls the platform with it. Each purpose is one API permission, so a
 * credential can do nothing but that (the operator reads decisions and reports, Kyverno reads admission recommendations).
 */
const PURPOSES = [
  { value: 'forecast:operator:use', key: 'operator' },
  { value: 'forecast:admission:read', key: 'admission' }
];
const purposeOptions = computed(() =>
  PURPOSES.map(item => ({ label: t(`page.system.secretKeys.purpose_${item.key}`), value: item.value }))
);
const permissionIds = ref<Record<string, number>>({});
const form = reactive({ name: '', status: true, remark: '', purposes: [] as string[] });

async function loadPermissionIds() {
  const { data } = await fetchAllPermissions();
  const walk = (items: any[]) => {
    for (const item of items || []) {
      permissionIds.value[item.code] = item.id;
      walk(item.children);
    }
  };
  walk((data as any) || []);
}

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
    const { data } = await fetchGetSecretKeys({
      page: pagination.page,
      page_size: pagination.pageSize,
      key_type: 'developer_access'
    });
    rows.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
  } finally {
    loading.value = false;
  }
}

function open(row?: any) {
  editing.value = row?.id;
  form.name = row?.name || '';
  form.status = row?.status ?? true;
  form.remark = row?.remark || '';
  form.purposes = PURPOSES.filter(item => (row?.permission_ids || []).includes(permissionIds.value[item.value])).map(
    item => item.value
  );
  visible.value = true;
}

async function save() {
  if (!form.name.trim()) {
    message.warning(t('page.system.secretKeys.nameRequired'));
    return;
  }
  const payload = {
    name: form.name.trim(),
    key_type: 'developer_access',
    server_enabled: true,
    permission_ids: form.purposes.map(code => permissionIds.value[code]).filter(Boolean),
    status: form.status,
    remark: form.remark
  };
  const result = editing.value
    ? await fetchUpdateSecretKey(editing.value, payload)
    : await fetchCreateSecretKey(payload);
  if (!result.error) {
    visible.value = false;
    if (!editing.value && result.data?.access_secret) {
      credential.accessKey = result.data.access_key;
      credential.accessSecret = result.data.access_secret;
      credentialVisible.value = true;
    }
    message.success(editing.value ? t('common.modifySuccess') : t('common.addSuccess'));
    await load();
  }
}

async function remove(id: number) {
  const { error } = await fetchDeleteSecretKey(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
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
      const results = await Promise.all(checkedRowKeys.value.map(id => fetchDeleteSecretKey(id)));
      if (results.some(result => result.error)) return;
      checkedRowKeys.value = [];
      message.success(t('common.deleteSuccess'));
      await load();
    }
  });
}

async function rotate(row: any) {
  const { data, error } = await fetchUpdateSecretKey(row.id, { rotate_secret: true });
  if (!error && data) {
    credential.accessKey = data.access_key;
    credential.accessSecret = data.access_secret;
    credentialVisible.value = true;
  }
}

async function copyValue(value: string) {
  if (await copyText(value)) message.success(t('common.copied'));
  else message.error(t('common.copyFailed'));
}

function renderCopyable(value?: string) {
  return value ? h(CopyText, { text: value }) : '-';
}

const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: {
    title: t('common.id'),
    key: 'id',
    width: 80,
    align: 'center',
    render: (row: any) => renderCopyable(String(row.id))
  },
  name: { title: t('page.system.secretKeys.name'), key: 'name', width: 180, resizable: true },
  access_key: {
    title: t('page.system.secretKeys.accessKey'),
    key: 'access_key',
    width: 220,
    resizable: true,
    render: (row: any) => renderCopyable(row.access_key)
  },
  purpose: {
    title: t('page.system.secretKeys.purpose'),
    key: 'purpose',
    width: 200,
    render: (row: any) =>
      h(NSpace, { size: 4 }, () =>
        PURPOSES.filter(item => (row.permission_ids || []).includes(permissionIds.value[item.value])).map(item =>
          h(NTag, { size: 'small', bordered: false, type: 'info' }, () =>
            t(`page.system.secretKeys.purpose_${item.key}`)
          )
        )
      )
  },
  masked_value: { title: t('page.system.secretKeys.maskedValue'), key: 'masked_value', width: 180, resizable: true },
  status: {
    title: t('common.status'),
    key: 'status',
    width: 100,
    align: 'center',
    render: (row: any) =>
      h(
        NTag,
        { type: row.status ? 'success' : 'default', bordered: false },
        { default: () => (row.status ? t('common.enable') : t('common.disable')) }
      )
  },
  remark: { title: t('page.system.secretKeys.remark'), key: 'remark', width: 200, resizable: true },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: any) => formatDateTime(row.created_at)
  },
  updated_at: {
    title: t('common.updateTime'),
    key: 'updated_at',
    width: 170,
    align: 'center',
    render: (row: any) => formatDateTime(row.updated_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: 156,
    fixed: 'right',
    align: 'center',
    render: (row: any) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(NButton, { size: 'tiny', onClick: () => rotate(row) }, () => t('page.system.secretKeys.rotate')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error', ghost: true }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
};

const defaultColumnKeys = [
  '__selection__',
  'name',
  'purpose',
  'access_key',
  'masked_value',
  'status',
  'remark',
  'created_at',
  'updated_at',
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
  editing.value ? t('page.system.secretKeys.editTitle') : t('page.system.secretKeys.addTitle')
);

onMounted(async () => {
  initColumnConfig();
  await loadPermissionIds();
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
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
        >
          <template #prefix>
            <HelpLabel
              class="text-12px opacity-80"
              :label="t('page.system.secretKeys.kindTitle')"
              :help="t('page.system.secretKeys.kindHelp')"
            />
          </template>
        </TableHeaderOperation>
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

    <NModal v-model:show="visible" preset="card" :title="modalTitle" class="w-520px max-w-90vw">
      <NForm :model="form" label-placement="top">
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.system.secretKeys.name')" :help="t('page.formHelp.keyName')" />
          </template>
          <NInput
            v-model:value="form.name"
            :placeholder="t('common.inputField', { field: t('page.system.secretKeys.name') })"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.system.secretKeys.purpose') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.system.secretKeys.purposeHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect v-model:value="form.purposes" multiple :options="purposeOptions" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('common.status')" :help="t('page.formHelp.keyStatus')" />
          </template>
          <StatusSelect v-model:value="form.status" />
        </NFormItem>
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.system.secretKeys.remark')" :help="t('page.formHelp.keyRemark')" />
          </template>
          <NInput
            v-model:value="form.remark"
            :placeholder="t('common.inputField', { field: t('page.system.secretKeys.remark') })"
            type="textarea"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal
      v-model:show="credentialVisible"
      preset="card"
      :title="t('page.system.secretKeys.saveNow')"
      class="w-600px max-w-90vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="Access Key">
          <div class="w-full flex gap-8px">
            <NInput :value="credential.accessKey" readonly />
            <NButton @click="copyValue(credential.accessKey)">{{ t('common.copy') }}</NButton>
          </div>
        </NFormItem>
        <NFormItem label="Access Secret">
          <div class="w-full flex gap-8px">
            <NInput :value="credential.accessSecret" readonly />
            <NButton @click="copyValue(credential.accessSecret)">{{ t('common.copy') }}</NButton>
          </div>
        </NFormItem>
        <NFormItem :label="t('page.system.secretKeys.clusterUse')">
          <div class="w-full flex gap-8px">
            <NInput :value="`${credential.accessKey}:${credential.accessSecret}`" readonly />
            <NButton @click="copyValue(`${credential.accessKey}:${credential.accessSecret}`)">
              {{ t('common.copy') }}
            </NButton>
          </div>
        </NFormItem>
      </NForm>
    </NModal>
  </div>
</template>

<style scoped></style>
