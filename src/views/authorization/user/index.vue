<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue';
import StatusSelect from '@/components/business/status-select.vue';
import HelpLabel from '@/components/common/help-label.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import { formatDateTime } from '@/utils/date';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import type { VNodeChild } from 'vue';
import { useRoute } from 'vue-router';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
import {
  NAvatar,
  NButton,
  NPopconfirm,
  NPopover,
  NSpace,
  NTag,
  NCard,
  NForm,
  NGrid,
  NFormItemGi,
  NInput,
  NSelect,
  NCollapse,
  NCollapseItem,
  NGi,
  NModal,
  NFormItem,
  NCheckbox,
  NDynamicInput,
  NCheckboxGroup
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchUserList,
  deleteUser,
  batchDeleteUser,
  updateUser,
  createUser,
  resetUserOTP,
  fetchAllRoles
} from '@/service/api';
import { useBoolean, useLoading } from '@sa/hooks';
import { onMounted } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const { loading, startLoading, endLoading } = useLoading(false);
const { bool: visible, setTrue: openModal, setFalse: closeModal } = useBoolean();

interface SearchParams {
  username: string;
  nickName: string;
  source: string | null;
  status: boolean | null;
}

const searchParams = reactive<SearchParams>({
  username: '',
  nickName: '',
  source: null,
  status: null
});

const sourceOptions = computed(() => [
  { label: t('page.manage.user.source_local'), value: 'local' },
  { label: t('page.manage.user.source_ldap'), value: 'ldap' }
]);

const statusFilterOptions: NaiveUI.SelectOptionOf<boolean | null>[] = [
  { label: t('common.allStatuses'), value: null },
  { label: t('page.manage.user.status.active'), value: true },
  { label: t('page.manage.user.status.inactive'), value: false }
];

// NSelect's value type doesn't line up cleanly with the boolean|null status
// filter; keep the cast here instead of inline in the template, since a
// union type with `|` inside a template expression trips vue/no-deprecated-filter.
const statusFilterValue = computed({
  get: () => searchParams.status as unknown as string | number | null,
  set: (value: string | number | null) => {
    searchParams.status = value as unknown as boolean | null;
  }
});

/** The usual kinds of contact, offered in the form; any other name can be typed, and it is stored as typed. */
const CONTACT_TYPES = [
  'email',
  'phone',
  'whatsapp',
  'telegram',
  'wechat',
  'wecom',
  'dingtalk',
  'feishu',
  'slack',
  'teams'
];
const contactLabel = (type: string) =>
  CONTACT_TYPES.includes(type) ? t(`page.manage.user.contactType_${type}`) : type;
const contactTypeOptions = computed(() => CONTACT_TYPES.map(value => ({ label: contactLabel(value), value })));

const tableData = ref<Api.System.User[]>([]);
const checkedRowKeys = ref<any[]>([]);

const pagination = reactive<PaginationProps>({
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

async function getTableData() {
  startLoading();
  const { data } = await fetchUserList({
    page: pagination.page,
    page_size: pagination.pageSize,
    username: searchParams.username || undefined,
    nick_name: searchParams.nickName || undefined,
    source: searchParams.source || undefined,
    status: searchParams.status === null ? undefined : searchParams.status
  });
  if (data) {
    tableData.value = data.list;
    pagination.itemCount = data.total;
  }
  endLoading();
}

const getButtonsByPosition = (pos: 'header' | 'row') => {
  return route.meta.buttons?.filter((b: any) => (b.position || 'row') === pos) ?? [];
};

// Column definitions aligned with backend camelCase JSON tags
const columnMap: Record<string, Partial<DataTableColumns<Api.System.User>[number]>> = {
  __selection__: {
    type: 'selection',
    resizable: true,
    align: 'center',
    width: 48
  },
  username: {
    title: t('page.manage.user.userName'),
    resizable: true,
    align: 'center',
    minWidth: 100
  },
  nickName: {
    title: t('page.manage.user.nickName'),
    resizable: true,
    align: 'center',
    minWidth: 100,
    // an account without a nickname shows its username, not an empty cell
    render: row => row.nickName || row.username
  },
  avatar: {
    title: t('common.fields.avatar'),
    resizable: true,
    align: 'center',
    width: 80,
    render: row =>
      h(
        NAvatar,
        { size: 28, round: true, src: row.avatar || undefined },
        { default: () => (row.nickName || row.username || '?').slice(0, 1).toUpperCase() }
      )
  },
  email: {
    title: t('common.fields.email'),
    resizable: true,
    align: 'center',
    minWidth: 160,
    ellipsis: { tooltip: true },
    render: row => row.email || '-'
  },
  phone: {
    title: t('common.fields.phone'),
    resizable: true,
    align: 'center',
    width: 130,
    render: row => row.phone || '-'
  },
  language: {
    title: t('common.fields.language'),
    resizable: true,
    align: 'center',
    width: 110,
    render: row => ({ 'zh-CN': '简体中文', 'en-US': 'English' })[row.language || ''] || row.language || '-'
  },
  updatedAt: {
    title: t('common.updateTime'),
    resizable: true,
    align: 'center',
    width: 180,
    render: row => formatDateTime(row.updatedAt, '')
  },
  status: {
    title: t('page.manage.user.userStatus'),
    resizable: true,
    align: 'center',
    width: 80,
    render: row => {
      return row.status
        ? h(NTag, { type: 'success', bordered: false }, { default: () => t('page.manage.user.status.active') })
        : h(NTag, { type: 'error', bordered: false }, { default: () => t('page.manage.user.status.inactive') });
    }
  },
  source: {
    title: t('page.manage.user.source'),
    resizable: true,
    align: 'center',
    width: 90,
    render: row =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.source === 'ldap' ? 'info' : 'default' },
        { default: () => t(`page.manage.user.source_${row.source === 'ldap' ? 'ldap' : 'local'}`) }
      )
  },
  contacts: {
    title: t('page.manage.user.contacts'),
    resizable: true,
    minWidth: 200,
    render: row => {
      const list = row.contacts || [];
      if (!list.length) return '-';
      return h(
        'div',
        { class: 'flex flex-wrap gap-4px' },
        list.map(item =>
          h(NTag, { size: 'small', bordered: false }, { default: () => `${contactLabel(item.type)} ${item.value}` })
        )
      );
    }
  },
  roles: {
    title: t('page.manage.role.roleName'),
    resizable: true,
    align: 'center',
    minWidth: 120,
    render: row => {
      if (!row.roles || row.roles.length === 0) return '-';
      return h(
        NSpace,
        { size: 4, justify: 'center' },
        {
          default: () =>
            row.roles?.map(r =>
              h(NButton, { size: 'small', tertiary: true, type: 'primary', round: true }, { default: () => r.name })
            )
        }
      );
    }
  },
  otpEnabled: {
    title: t('page.manage.user.otpStatus'),
    resizable: true,
    align: 'center',
    width: 100,
    render: row => {
      return h(
        NButton,
        { size: 'small', tertiary: true, type: row.otpEnabled ? 'success' : 'default', round: true },
        {
          default: () => (row.otpEnabled ? t('page.manage.user.otpEnabled') : t('page.manage.user.otpDisabled'))
        }
      );
    }
  },
  isOnline: {
    title: t('page.manage.user.isOnline'),
    resizable: true,
    align: 'center',
    width: 150,
    render: row => {
      const dot = h(
        NTag,
        { size: 'small', round: true, type: row.isOnline ? 'success' : 'default', bordered: false },
        { default: () => (row.isOnline ? t('page.manage.user.online') : t('page.manage.user.offline')) }
      );
      if (!row.activeSessions?.length) return dot;
      return h(
        NPopover,
        { trigger: 'hover', placement: 'bottom' },
        {
          trigger: () => dot,
          default: () =>
            h(
              'div',
              { class: 'flex-col gap-6px max-w-360px' },
              row.activeSessions.map(session =>
                h('div', { class: 'text-12px' }, [
                  h('div', {}, `${t('page.manage.user.sessionIp')}: ${session.clientIp || '-'}`),
                  h('div', { class: 'text-gray-400' }, session.userAgent || '-'),
                  h(
                    'div',
                    { class: 'text-gray-400' },
                    `${t('page.manage.user.sessionLastActive')}: ${formatDateTime(session.lastUsedAt)}`
                  )
                ])
              )
            )
        }
      );
    }
  },
  lastLoginAt: {
    title: t('page.manage.user.lastLoginAt'),
    resizable: true,
    align: 'center',
    width: 170,
    render: row => formatDateTime(row.lastLoginAt)
  },
  createdAt: {
    title: t('common.createTime'),
    resizable: true,
    align: 'center',
    width: 180,
    render: row => formatDateTime(row.createdAt, '')
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    align: 'center',
    width: 190,
    fixed: 'right',
    resizable: true,
    render: row => {
      const actions: VNodeChild[] = [];
      const rowButtons = getButtonsByPosition('row');

      for (const btn of rowButtons) {
        if (btn.code === 'authorization:user:edit') {
          actions.push(
            h(
              NButton,
              {
                size: 'tiny',
                type: (btn.btnType as any) || 'primary',
                onClick: () => handleEdit(row)
              },
              { default: () => t('common.edit') }
            )
          );
        } else if (btn.code === 'authorization:user:resetOtp') {
          actions.push(
            h(
              NPopconfirm,
              {
                onPositiveClick: () => handleResetOTP(row)
              },
              {
                default: () => t('page.manage.user.resetOtpConfirm'),
                trigger: () =>
                  h(NButton, { size: 'tiny', type: 'warning' }, { default: () => t('page.manage.user.resetOtp') })
              }
            )
          );
        } else if (btn.code === 'authorization:user:delete') {
          actions.push(
            h(
              NPopconfirm,
              {
                onPositiveClick: async () => {
                  const { error } = await deleteUser(row.id);
                  if (!error) {
                    window.$message?.success(t('common.deleteSuccess'));
                    getTableData();
                  }
                }
              },
              {
                default: () => t('common.confirmDelete'),
                trigger: () => h(NButton, { size: 'tiny', type: 'error' }, { default: () => t('common.delete') })
              }
            )
          );
        }
      }

      const isSelf = String(row.id) === String(authStore.userInfo.userId);
      actions.push(
        h(
          NPopconfirm,
          { disabled: isSelf, onPositiveClick: () => handleToggleUserStatus(row) },
          {
            trigger: () =>
              h(
                NButton,
                { size: 'tiny', type: row.status ? 'warning' : 'success', disabled: isSelf },
                { default: () => (row.status ? t('common.disable') : t('common.enable')) }
              ),
            default: () => (row.status ? t('common.confirmDisable') : t('common.confirmEnable'))
          }
        )
      );

      return h(NSpace, { justify: 'center', size: 6 }, { default: () => actions });
    }
  }
};

async function handleToggleUserStatus(row: any) {
  const { error } = await updateUser(row.id, { status: !row.status });
  if (!error) {
    window.$message?.success(t('common.updateSuccess'));
    getTableData();
  }
}

const defaultKeys = [
  '__selection__',
  'username',
  'nickName',
  'source',
  'roles',
  'contacts',
  'isOnline',
  'lastLoginAt',
  'otpEnabled',
  'status',
  'createdAt',
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
  pageCode: 'user_manage',
  columnMap,
  defaultKeys
});

function handleCheck(rowKeys: any[]) {
  checkedRowKeys.value = rowKeys as number[];
}

const userForm = reactive({
  id: 0,
  username: '',
  password: '',
  nickName: '',
  contacts: [] as Array<{ type: string; value: string }>,
  status: true,
  role_ids: [] as number[]
});

const isEdit = ref(false);
const isEditingSelf = computed(() => isEdit.value && String(userForm.id) === String(authStore.userInfo.userId));
const allRoles = ref<Api.System.Role[]>([]);

async function initRoles() {
  const { data } = await fetchAllRoles();
  if (data) {
    allRoles.value = data;
  }
}

function handleAdd() {
  isEdit.value = false;
  Object.assign(userForm, {
    id: 0,
    username: '',
    password: '',
    nickName: '',
    contacts: [],
    status: true,
    role_ids: []
  });
  openModal();
}

function handleEdit(row: Api.System.User) {
  isEdit.value = true;
  Object.assign(userForm, {
    id: row.id,
    username: row.username,
    password: '',
    nickName: row.nickName || '',
    contacts: (row.contacts || []).map(item => ({ ...item })),
    status: row.status,
    role_ids: row.roles?.map(r => r.id) || []
  });
  openModal();
}

async function handleSubmit() {
  const { error } = isEdit.value ? await updateUser(userForm.id, userForm) : await createUser(userForm);
  if (!error) {
    window.$message?.success(isEdit.value ? t('common.updateSuccess') : t('common.addSuccess'));
    closeModal();
    getTableData();
  }
}

async function handleResetOTP(row: Api.System.User) {
  const { error } = await resetUserOTP(row.id);
  if (!error) {
    window.$message?.success(t('page.manage.user.resetOtpSuccess'));
    getTableData();
  }
}

/** The batch menu of every list: enable, disable and delete the checked rows. */
const batchActions = computed(() => [
  { key: 'enable', label: t('common.enable') },
  { key: 'disable', label: t('common.disable') },
  { key: 'delete', label: t('common.delete'), danger: true }
]);

async function runBatch(key: string) {
  if (key === 'delete') return handleBatchDelete();
  if (checkedRowKeys.value.length === 0) return;
  const status = key === 'enable';
  let done = 0;
  for (const id of checkedRowKeys.value) {
    const { error } = await updateUser(id, { status });
    if (!error) done += 1;
  }
  window.$message?.success(t('common.batchDone', { done }));
  checkedRowKeys.value = [];
  getTableData();
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return;
  const { error } = await batchDeleteUser(checkedRowKeys.value);
  if (!error) {
    window.$message?.success(t('common.deleteSuccess'));
    checkedRowKeys.value = [];
    getTableData();
  }
}

function resetSearchParams() {
  searchParams.username = '';
  searchParams.nickName = '';
  searchParams.source = null;
  searchParams.status = null;
  getTableData();
}

onMounted(() => {
  getTableData();
  initRoles();
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
              <NFormItemGi :span="6" :label="t('page.manage.user.userName')" path="username">
                <NInput
                  v-model:value="searchParams.username"
                  :placeholder="t('page.manage.user.form.userName')"
                  @keyup.enter="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi :span="6" :label="t('page.manage.user.nickName')" path="nickName">
                <NInput
                  v-model:value="searchParams.nickName"
                  :placeholder="t('page.manage.user.form.nickName')"
                  @keyup.enter="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="3"
                :label="t('page.manage.user.source')"
                path="source"
              >
                <NSelect
                  v-model:value="searchParams.source"
                  clearable
                  :placeholder="t('page.manage.user.source')"
                  :options="sourceOptions"
                  @update:value="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="3"
                :label="t('page.manage.user.userStatus')"
                path="status"
              >
                <NSelect
                  v-model:value="statusFilterValue"
                  :placeholder="t('page.manage.user.form.userStatus')"
                  :options="statusFilterOptions"
                  @update:value="getTableData"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="6">
                <NSpace justify="end" class="w-full">
                  <NButton @click="resetSearchParams">
                    <template #icon>
                      <icon-ic-round-refresh />
                    </template>
                    {{ t('common.reset') }}
                  </NButton>
                  <NButton type="primary" @click="getTableData">
                    <template #icon>
                      <icon-ic-round-search />
                    </template>
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
          :show-delete="false"
          :loading="loading"
          @add="handleAdd"
          @delete="handleBatchDelete"
          @refresh="getTableData"
        >
          <template #suffix>
            <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
          </template>
          <template #prefix>
            <template v-for="btn in getButtonsByPosition('header')" :key="btn.code">
              <NButton
                v-if="
                  btn.label && btn.code !== 'authorization:user:add' && btn.code !== 'authorization:user:batchDelete'
                "
                :type="(btn.btnType as any) || 'default'"
              >
                {{ btn.label }}
              </NButton>
            </template>
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
            :size="density"
            :scroll-x="1500"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @update:checked-row-keys="handleCheck"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NModal v-model:show="visible" preset="card" :title="isEdit ? t('common.edit') : t('common.add')" class="w-500px">
      <NForm :model="userForm" label-placement="top">
        <NFormItem path="username">
          <template #label>
            <HelpLabel :label="t('page.manage.user.userName')" :help="t('page.formHelp.userName')" />
          </template>
          <NInput
            v-model:value="userForm.username"
            :placeholder="t('page.manage.user.form.userName')"
            :disabled="isEdit"
          />
        </NFormItem>
        <NFormItem path="password">
          <template #label>
            <HelpLabel :label="t('page.manage.user.userPassword')" :help="t('page.formHelp.userPassword')" />
          </template>
          <NInput
            v-model:value="userForm.password"
            type="password"
            show-password-on="click"
            :placeholder="isEdit ? t('page.manage.user.form.editPassword') : t('page.manage.user.form.userPassword')"
          />
        </NFormItem>
        <NFormItem path="nickName">
          <template #label>
            <HelpLabel :label="t('page.manage.user.nickName')" :help="t('page.formHelp.userNick')" />
          </template>
          <NInput v-model:value="userForm.nickName" :placeholder="t('page.manage.user.form.nickName')" />
        </NFormItem>
        <NFormItem path="contacts">
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.manage.user.contacts') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.manage.user.contactsHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NDynamicInput v-model:value="userForm.contacts" :on-create="() => ({ type: 'email', value: '' })">
            <template #default="{ value }">
              <div class="w-full flex gap-8px">
                <NSelect
                  v-model:value="value.type"
                  filterable
                  tag
                  :options="contactTypeOptions"
                  class="w-150px flex-shrink-0"
                />
                <NInput v-model:value="value.value" />
              </div>
            </template>
          </NDynamicInput>
        </NFormItem>
        <NFormItem path="status">
          <template #label>
            <HelpLabel :label="t('page.manage.user.userStatus')" :help="t('page.formHelp.userStatus')" />
          </template>
          <StatusSelect v-model:value="userForm.status" :disabled="isEditingSelf" />
        </NFormItem>
        <NFormItem path="role_ids">
          <template #label>
            <HelpLabel :label="t('page.manage.role.roleName')" :help="t('page.formHelp.userRoles')" />
          </template>
          <NCard :bordered="true" size="small" class="bg-[#f9fafb] dark:bg-[#18181c] rounded-8px w-full">
            <NCheckboxGroup v-model:value="userForm.role_ids">
              <NGrid :cols="2" :y-gap="8">
                <NGi v-for="role in allRoles" :key="role.id">
                  <NCheckbox :value="role.id" :label="role.name" />
                </NGi>
              </NGrid>
            </NCheckboxGroup>
          </NCard>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="closeModal">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="handleSubmit">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped></style>
