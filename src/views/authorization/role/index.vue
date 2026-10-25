<script setup lang="ts">
import { h, reactive, ref, computed } from 'vue';
import { formatDateTime } from '@/utils/date';
import type { VNodeChild } from 'vue';
import { useRoute } from 'vue-router';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
import {
  NButton,
  NPopconfirm,
  NSpace,
  NSwitch,
  NTag,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NTree,
  NCard,
  NGrid,
  NFormItemGi,
  NSelect,
  NCollapse,
  NCollapseItem,
  NGi,
  NAlert
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchRoleList, deleteRole, batchDeleteRole, updateRole, createRole, fetchAllPermissions } from '@/service/api';
import { useBoolean, useLoading } from '@sa/hooks';
import { onMounted } from 'vue';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

const { t } = useI18n();
const route = useRoute();
const { loading, startLoading, endLoading } = useLoading(false);
const { bool: visible, setTrue: openDrawer, setFalse: closeDrawer } = useBoolean();

interface SearchParams {
  roleName: string;
  roleCode: string;
  status: boolean | null;
}

const searchParams = reactive<SearchParams>({
  roleName: '',
  roleCode: '',
  status: null
});

const statusFilterOptions: NaiveUI.SelectOptionOf<boolean | null>[] = [
  { label: t('common.allStatuses'), value: null },
  { label: t('page.manage.role.status.active'), value: true },
  { label: t('page.manage.role.status.inactive'), value: false }
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

const tableData = ref<Api.System.Role[]>([]);
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
  const { data } = await fetchRoleList({
    page: pagination.page,
    page_size: pagination.pageSize,
    role_name: searchParams.roleName || undefined,
    role_code: searchParams.roleCode || undefined,
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

const columnMap: Record<string, Partial<DataTableColumns<Api.System.Role>[number]>> = {
  __selection__: {
    type: 'selection',
    align: 'center',
    width: 48,
    resizable: true
  },
  id: {
    key: 'id',
    title: t('common.id'),
    align: 'center',
    width: 80,
    resizable: true
  },
  name: {
    key: 'name',
    title: t('page.manage.role.roleName'),
    align: 'center',
    width: 150,
    resizable: true
  },
  code: {
    key: 'code',
    title: t('page.manage.role.roleCode'),
    align: 'center',
    width: 150,
    resizable: true
  },
  status: {
    key: 'status',
    title: t('page.manage.role.roleStatus'),
    align: 'center',
    width: 80,
    resizable: true,
    render: row => {
      return row.status
        ? h(NTag, { type: 'success', bordered: false }, { default: () => t('common.enabled') })
        : h(NTag, { type: 'error', bordered: false }, { default: () => t('common.disabled') });
    }
  },
  createdAt: {
    key: 'createdAt',
    title: t('common.createTime'),
    align: 'center',
    width: 180,
    resizable: true,
    render: row => formatDateTime(row.createdAt, '')
  },
  updatedAt: {
    key: 'updatedAt',
    title: t('common.updateTime'),
    align: 'center',
    width: 180,
    resizable: true,
    render: row => formatDateTime(row.updatedAt, '')
  },
  remark: {
    key: 'remark',
    title: t('common.remark'),
    align: 'center',
    width: 200,
    resizable: true,
    ellipsis: { tooltip: true }
  },
  operate: {
    key: 'operate',
    title: t('common.operate'),
    align: 'center',
    width: 320,
    fixed: 'right',
    resizable: true,
    render: row => {
      const actions: VNodeChild[] = [];
      const rowButtons = getButtonsByPosition('row');

      for (const btn of rowButtons) {
        if (btn.code === 'authorization:role:edit') {
          actions.push(
            h(
              NButton,
              {
                size: 'small',
                type: (btn.btnType as any) || 'primary',
                onClick: () => handleEdit(row)
              },
              { default: () => t('common.edit') }
            )
          );
          actions.push(
            h(
              NButton,
              {
                size: 'small',
                type: 'primary',
                ghost: true,
                onClick: () => handleSetPermissions(row)
              },
              { default: () => t('page.manage.role.setPermissions') }
            )
          );
          actions.push(
            h(
              NPopconfirm,
              {
                onPositiveClick: async () => {
                  const { error } = await updateRole(row.id, { status: !row.status });
                  if (!error) {
                    window.$message?.success(t('common.updateSuccess'));
                    getTableData();
                  }
                }
              },
              {
                default: () => (row.status ? t('common.confirmDisable') : t('common.confirmEnable')),
                trigger: () =>
                  h(
                    NButton,
                    { size: 'small', type: row.status ? 'warning' : 'success', ghost: true },
                    { default: () => (row.status ? t('common.disable') : t('common.enable')) }
                  )
              }
            )
          );
        } else if (btn.code === 'authorization:role:delete') {
          actions.push(
            h(
              NPopconfirm,
              {
                onPositiveClick: async () => {
                  const { error } = await deleteRole(row.id);
                  if (!error) {
                    window.$message?.success(t('common.deleteSuccess'));
                    getTableData();
                  }
                }
              },
              {
                default: () => t('common.confirmDelete'),
                trigger: () =>
                  h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => t('common.delete') })
              }
            )
          );
        }
      }

      return h(NSpace, { justify: 'center', size: 6 }, { default: () => actions });
    }
  }
};

const defaultKeys = ['__selection__', 'name', 'code', 'status', 'createdAt', 'updatedAt', 'operate'];

const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  handleColumnUpdate,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({
  pageCode: 'role_manage',
  columnMap,
  defaultKeys
});

function handleCheck(rowKeys: any[]) {
  checkedRowKeys.value = rowKeys as number[];
}

const roleForm = reactive({
  id: 0,
  name: '',
  code: '',
  status: true,
  remark: ''
});

const isEdit = ref(false);
function handleAdd() {
  isEdit.value = false;
  Object.assign(roleForm, { id: 0, name: '', code: '', status: true, remark: '' });
  openDrawer();
}

function handleEdit(row: Api.System.Role) {
  isEdit.value = true;
  Object.assign(roleForm, {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    remark: row.remark || ''
  });
  openDrawer();
}

async function handleSubmit() {
  const { error } = isEdit.value ? await updateRole(roleForm.id, roleForm) : await createRole(roleForm);
  if (!error) {
    window.$message?.success(isEdit.value ? t('common.updateSuccess') : t('common.addSuccess'));
    closeDrawer();
    getTableData();
  }
}

// Permission Tree Logic
const { bool: permissionVisible, setTrue: openPermissionDrawer, setFalse: closePermissionDrawer } = useBoolean();
const permissionTree = ref<Api.System.Menu[]>([]);
const selectedRole = ref<Api.System.Role | null>(null);
const checkedPermissions = ref<number[]>([]);
const isCascade = ref(false);
const treeExpandedKeys = ref<number[]>([]);

type PermissionTreeNode = Api.System.Menu & {
  label: string;
  parent_id?: number;
  parentId?: number;
  name?: string;
  code?: string;
  children?: PermissionTreeNode[];
};

function getPermissionParentId(item: PermissionTreeNode) {
  return Number(item.parent_id ?? item.parentId ?? item.pid ?? 0);
}

function getPermissionLabel(item: PermissionTreeNode) {
  const baseName = item.name || item.routeName || item.code || item.routeCode || String(item.id);
  if (item.type === 'MENU') {
    return `${baseName}${t('page.manage.role.permissionMenuSuffix')}`;
  }
  if (item.type === 'BUTTON') {
    return `${baseName}${t('page.manage.role.permissionButtonSuffix')}`;
  }
  return baseName;
}

function getAllTreeKeys(nodes: PermissionTreeNode[]): number[] {
  const keys: number[] = [];
  function traverse(items: PermissionTreeNode[]) {
    items.forEach(item => {
      keys.push(Number(item.id));
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    });
  }
  traverse(nodes);
  return keys;
}

function expandAllTree() {
  treeExpandedKeys.value = getAllTreeKeys(permissionTree.value as PermissionTreeNode[]);
}

function collapseAllTree() {
  treeExpandedKeys.value = [];
}

function selectAllPermissions() {
  checkedPermissions.value = getAllTreeKeys(permissionTree.value as PermissionTreeNode[]);
}

function deselectAllPermissions() {
  checkedPermissions.value = [];
}

function buildPermissionTree(items: Api.System.Menu[]) {
  const flatItems: PermissionTreeNode[] = [];

  function collect(nodes: Api.System.Menu[], parentId = 0) {
    nodes.forEach(item => {
      const node = item as PermissionTreeNode;
      const children = Array.isArray(node.children) ? node.children : [];
      flatItems.push({
        ...node,
        parentId: getPermissionParentId(node) || parentId,
        children: []
      });
      collect(children, Number(node.id));
    });
  }

  collect(items);

  const nodeMap = new Map<number, PermissionTreeNode>();
  const roots: PermissionTreeNode[] = [];

  flatItems.forEach(node => {
    nodeMap.set(Number(node.id), {
      ...node,
      label: getPermissionLabel(node),
      children: []
    });
  });

  nodeMap.forEach(node => {
    const parentId = getPermissionParentId(node);
    const parent = parentId ? nodeMap.get(parentId) : null;
    if (parent) {
      parent.children ||= [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

async function initPermissionTree() {
  const { data } = await fetchAllPermissions();
  if (data) {
    permissionTree.value = buildPermissionTree(data);
  }
}

function handleSetPermissions(row: Api.System.Role) {
  selectedRole.value = row;
  checkedPermissions.value = row.permissions?.map(p => Number(p.id)) || [];
  isCascade.value = false;
  treeExpandedKeys.value = getAllTreeKeys(permissionTree.value as PermissionTreeNode[]);
  openPermissionDrawer();
}

async function handlePermissionSubmit() {
  if (!selectedRole.value) return;
  const { error } = await updateRole(selectedRole.value.id, { permissions: checkedPermissions.value });
  if (!error) {
    window.$message?.success(t('common.updateSuccess'));
    closePermissionDrawer();
    getTableData();
  }
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return;
  const { error } = await batchDeleteRole(checkedRowKeys.value);
  if (!error) {
    window.$message?.success(t('common.deleteSuccess'));
    checkedRowKeys.value = [];
    getTableData();
  }
}

function resetSearchParams() {
  searchParams.roleName = '';
  searchParams.roleCode = '';
  searchParams.status = null;
  getTableData();
}

onMounted(() => {
  getTableData();
  initPermissionTree();
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
              <NFormItemGi :span="6" :label="t('page.manage.role.roleName')" path="roleName">
                <NInput
                  v-model:value="searchParams.roleName"
                  :placeholder="t('page.manage.role.form.roleName')"
                  @keyup.enter="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi :span="6" :label="t('page.manage.role.roleCode')" path="roleCode">
                <NInput
                  v-model:value="searchParams.roleCode"
                  :placeholder="t('page.manage.role.form.roleCode')"
                  @keyup.enter="getTableData"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="6"
                :label="t('page.manage.role.roleStatus')"
                path="status"
              >
                <NSelect
                  v-model:value="statusFilterValue"
                  :placeholder="t('page.manage.role.form.roleStatus')"
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
              v-if="btn.label && btn.code !== 'authorization:role:add' && btn.code !== 'authorization:role:batchDelete'"
              :type="(btn.btnType as any) || 'default'"
            >
              {{ btn.label }}
            </NButton>
          </template>
        </template>
      </TableHeaderOperation>
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
    </NCard>

    <NDrawer v-model:show="visible" :width="500">
      <NDrawerContent :title="isEdit ? t('common.edit') : t('common.add')" closable>
        <NForm :model="roleForm" label-placement="top">
          <NFormItem :label="t('page.manage.role.roleName')" path="name">
            <NInput v-model:value="roleForm.name" :placeholder="t('page.manage.role.form.roleName')" />
          </NFormItem>
          <NFormItem :label="t('page.manage.role.roleCode')" path="code">
            <NInput v-model:value="roleForm.code" :placeholder="t('page.manage.role.form.roleCode')" />
          </NFormItem>
          <NFormItem :label="t('page.manage.role.roleStatus')" path="status">
            <NSwitch v-model:value="roleForm.status" />
          </NFormItem>
          <NFormItem :label="t('common.remark')" path="remark">
            <NInput v-model:value="roleForm.remark" type="textarea" :placeholder="t('common.remark')" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="closeDrawer">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" @click="handleSubmit">{{ t('common.confirm') }}</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="permissionVisible" :width="540">
      <NDrawerContent :title="t('page.manage.role.setPermissions')" closable>
        <div class="flex flex-col h-full space-y-3">
          <NAlert type="info" :show-icon="true" class="rounded-lg text-12px">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <span v-html="t('page.manage.role.permissionHint')" />
          </NAlert>
          <div class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">{{ t('page.manage.role.cascadeSelection') }}</span>
              <NSwitch v-model:value="isCascade" size="small" />
            </div>
            <NSpace size="small">
              <NButton size="tiny" secondary type="info" @click="expandAllTree">
                {{ t('page.manage.role.expandAll') }}
              </NButton>
              <NButton size="tiny" secondary type="warning" @click="collapseAllTree">
                {{ t('page.manage.role.collapseAll') }}
              </NButton>
              <NButton size="tiny" secondary type="primary" @click="selectAllPermissions">
                {{ t('page.manage.role.selectAll') }}
              </NButton>
              <NButton size="tiny" secondary @click="deselectAllPermissions">
                {{ t('page.manage.role.deselectAll') }}
              </NButton>
            </NSpace>
          </div>

          <div class="flex-1 overflow-auto pr-1">
            <NTree
              v-model:checked-keys="checkedPermissions"
              v-model:expanded-keys="treeExpandedKeys"
              block-line
              :cascade="isCascade"
              checkable
              :data="permissionTree"
              key-field="id"
              label-field="label"
              children-field="children"
            />
          </div>
        </div>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="closePermissionDrawer">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" @click="handlePermissionSubmit">{{ t('common.confirm') }}</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped></style>
