<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue';
import { formatDateTime } from '@/utils/date';
import type { VNodeChild } from 'vue';
import { useRoute } from 'vue-router';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
import {
  NButton,
  NPopconfirm,
  NPopover,
  NSpace,
  NSwitch,
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
  NCheckboxGroup
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
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
  status: boolean | null;
}

const searchParams = reactive<SearchParams>({
  username: '',
  nickName: '',
  status: null
});

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
    minWidth: 100
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
  phone: {
    title: t('page.manage.user.userPhone'),
    resizable: true,
    align: 'center',
    minWidth: 120
  },
  roles: {
    title: t('page.manage.role.roleName'),
    resizable: true,
    align: 'center',
    minWidth: 120,
    render: row => {
      if (!row.roles || row.roles.length === 0) return '';
      return h(
        NSpace,
        { size: 4, justify: 'center' },
        {
          default: () =>
            row.roles?.map(r =>
              h(NButton, { size: 'tiny', tertiary: true, type: 'primary', round: true }, { default: () => r.name })
            )
        }
      );
    }
  },
  email: {
    title: t('page.manage.user.email'),
    resizable: true,
    align: 'center',
    width: 150
  },
  otpEnabled: {
    title: t('page.manage.user.otpStatus'),
    resizable: true,
    align: 'center',
    width: 100,
    render: row => {
      return h(
        NButton,
        { size: 'tiny', tertiary: true, type: row.otpEnabled ? 'success' : 'default', round: true },
        {
          default: () => (row.otpEnabled ? t('page.manage.user.otpEnabled') : t('page.manage.user.otpDisabled'))
        }
      );
    }
  },
  telegramBinding: {
    title: t('page.manage.user.telegramBinding', 'Telegram 绑定'),
    resizable: true,
    align: 'center',
    width: 140,
    render: row => {
      const tb = (row as any).telegramBinding;
      if (tb && tb.status) {
        const label = tb.telegramUsername ? `@${tb.telegramUsername}` : `ID: ${tb.telegramUserId}`;
        return h(NButton, { size: 'tiny', tertiary: true, type: 'info', round: true }, { default: () => label });
      }
      return h(
        NButton,
        { size: 'tiny', tertiary: true, type: 'default', round: true },
        { default: () => t('page.manage.user.unbound', '未绑定') }
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
  lastLoginIp: {
    title: t('page.manage.user.lastLoginIp'),
    resizable: true,
    align: 'center',
    width: 140,
    render: row => row.lastLoginIp || '-'
  },
  id: {
    title: t('common.id'),
    resizable: true,
    align: 'center',
    width: 70
  },
  avatar: {
    title: t('page.manage.user.avatar'),
    resizable: true,
    align: 'center',
    width: 80
  },
  createdAt: {
    title: t('common.createTime'),
    resizable: true,
    align: 'center',
    width: 180,
    render: row => formatDateTime(row.createdAt, '')
  },
  updatedAt: {
    title: t('common.updateTime'),
    resizable: true,
    align: 'center',
    width: 180,
    render: row => formatDateTime(row.updatedAt, '')
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    align: 'center',
    width: 320,
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
                  h(
                    NButton,
                    { size: 'tiny', type: 'warning', ghost: true },
                    { default: () => t('page.manage.user.resetOtp') }
                  )
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
                trigger: () =>
                  h(NButton, { size: 'tiny', type: 'error', ghost: true }, { default: () => t('common.delete') })
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
                { size: 'tiny', type: row.status ? 'warning' : 'success', ghost: true, disabled: isSelf },
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
  'isOnline',
  'telegramBinding',
  'lastLoginAt',
  'lastLoginIp',
  'roles',
  'phone',
  'email',
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
  phone: '',
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
    phone: '',
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
    phone: (row as any).phone || '',
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
                :span="6"
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
          :disabled-delete="checkedRowKeys.length === 0"
          :loading="loading"
          @add="handleAdd"
          @delete="handleBatchDelete"
          @refresh="getTableData"
        >
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
            :scroll-x="2000"
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
        <NFormItem :label="t('page.manage.user.userName')" path="username">
          <NInput
            v-model:value="userForm.username"
            :placeholder="t('page.manage.user.form.userName')"
            :disabled="isEdit"
          />
        </NFormItem>
        <NFormItem :label="t('page.manage.user.userPassword')" path="password">
          <NInput
            v-model:value="userForm.password"
            type="password"
            show-password-on="click"
            :placeholder="isEdit ? t('page.manage.user.form.editPassword') : t('page.manage.user.form.userPassword')"
          />
        </NFormItem>
        <NFormItem :label="t('page.manage.user.nickName')" path="nickName">
          <NInput v-model:value="userForm.nickName" :placeholder="t('page.manage.user.form.nickName')" />
        </NFormItem>
        <NFormItem :label="t('page.manage.user.userPhone')" path="phone">
          <NInput v-model:value="userForm.phone" :placeholder="t('page.manage.user.form.userPhone')" />
        </NFormItem>
        <NFormItem :label="t('page.manage.user.userStatus')" path="status">
          <NSwitch v-model:value="userForm.status" :disabled="isEditingSelf">
            <template #checked>
              {{ t('page.manage.user.status.active') }}
            </template>
            <template #unchecked>
              {{ t('page.manage.user.status.inactive') }}
            </template>
          </NSwitch>
        </NFormItem>
        <NFormItem :label="t('page.manage.role.roleName')" path="role_ids">
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
