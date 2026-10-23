<script setup lang="ts">
import { ref, onMounted, computed, h, reactive, watch } from 'vue';
import {
  NButton,
  NSpace,
  NCard,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
  NTag,
  NTreeSelect,
  NDataTable,
  NPopconfirm,
  NTabs,
  NTabPane,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import SvgIcon from '@/components/custom/svg-icon.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetMenus, fetchCreateMenu, fetchUpdateMenu, fetchDeleteMenu } from '@/service/api/menu';

const { t } = useI18n();
const message = useMessage();

const loading = ref(false);
const rawData = ref<any[]>([]);
const expandedRowKeys = ref<number[]>([]);

const showModal = ref(false);
const isEdit = ref(false);
const submitting = ref(false);

const formRef = ref<any>(null);

const defaultForm = () => ({
  id: undefined as number | undefined,
  name: '',
  code: '',
  type: 'DIRECTORY' as 'DIRECTORY' | 'MENU' | 'BUTTON',
  parent_id: 0,
  fe_route: '',
  fe_component: 'layout.base',
  sort: 0,
  icon: '',
  is_link: false,
  is_cache: true,
  visible: true,
  status: true,
  be_apis: ''
});

const formModel = reactive(defaultForm());

const rules = computed(() => {
  const r: Record<string, any> = {
    name: [{ required: true, message: t('page.authorization.nodeName') + ' ' + t('form.required'), trigger: 'blur' }],
    code: [
      { required: true, message: t('page.authorization.permissionCode') + ' ' + t('form.required'), trigger: 'blur' }
    ],
    type: [{ required: true, message: t('page.authorization.type') + ' ' + t('form.required'), trigger: 'change' }]
  };

  if (formModel.type !== 'BUTTON') {
    r.fe_route = [
      { required: true, message: t('page.authorization.routePath') + ' ' + t('form.required'), trigger: 'blur' }
    ];
  }

  return r;
});

// Build a structured tree from flat list
const treeData = computed(() => {
  if (!rawData.value || !rawData.value.length) return [];
  const map = new Map<number, any>();
  const roots: any[] = [];

  rawData.value.forEach(item => {
    map.set(item.id, { ...item, key: item.id, children: [] });
  });

  rawData.value.forEach(item => {
    const parentId = Number(item.parent_id || 0);
    const node = map.get(item.id);
    if (!node) return;

    if (parentId > 0 && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort recursively
  function sortTree(nodes: any[]) {
    nodes.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortTree(node.children);
      } else {
        delete node.children;
      }
    });
  }
  sortTree(roots);
  return roots;
});

function getAllParentKeys(nodes: any[]): number[] {
  const keys: number[] = [];
  function traverse(items: any[]) {
    items.forEach(item => {
      if (item.children && item.children.length > 0) {
        keys.push(item.id);
        traverse(item.children);
      }
    });
  }
  traverse(nodes);
  return keys;
}

function getNodeAndDescendantKeys(node: any): number[] {
  const keys: number[] = [];
  if (node.children && node.children.length > 0) {
    keys.push(node.id);
    node.children.forEach((child: any) => {
      keys.push(...getNodeAndDescendantKeys(child));
    });
  }
  return keys;
}

function expandAll() {
  expandedRowKeys.value = getAllParentKeys(treeData.value);
}

function collapseAll() {
  expandedRowKeys.value = [];
}

function expandBranch(row: any) {
  const branchKeys = getNodeAndDescendantKeys(row);
  expandedRowKeys.value = Array.from(new Set([...expandedRowKeys.value, ...branchKeys]));
}

function collapseBranch(row: any) {
  const branchKeys = new Set(getNodeAndDescendantKeys(row));
  expandedRowKeys.value = expandedRowKeys.value.filter(k => !branchKeys.has(k));
}

// Dropdown options for TreeSelect (excludes current node and descendants when editing)
const parentOptions = computed(() => {
  const currentId = isEdit.value ? formModel.id : undefined;

  function filterTree(nodes: any[]): any[] {
    if (!nodes || !nodes.length) return [];
    return nodes
      .filter(n => {
        if (currentId !== undefined && n.id === currentId) return false;
        if (n.type === 'BUTTON') return false;
        return true;
      })
      .map(n => {
        const filteredChildren = n.children ? filterTree(n.children) : [];
        return {
          label: n.name,
          key: n.id,
          children: filteredChildren.length > 0 ? filteredChildren : undefined
        };
      });
  }

  return [{ label: t('page.authorization.parentRoot'), key: 0 }, ...filterTree(treeData.value)];
});

function handleTypeChange(val: 'DIRECTORY' | 'MENU' | 'BUTTON') {
  if (val === 'DIRECTORY') {
    if (!formModel.fe_component || formModel.fe_component === 'view.') {
      formModel.fe_component = 'layout.base';
    }
  } else if (val === 'MENU') {
    if (!formModel.fe_component || formModel.fe_component === 'layout.base') {
      formModel.fe_component = 'view.';
    }
  } else {
    formModel.fe_component = '';
    formModel.fe_route = '';
  }
}

const columns = computed(() => [
  {
    title: t('page.authorization.nodeName'),
    key: 'name',
    minWidth: 220,
    render(row: any) {
      const items = [];
      if (row.icon) {
        items.push(h(SvgIcon, { icon: row.icon, class: 'mr-2 text-16px inline-block align-middle' }));
      }
      items.push(h('span', { class: 'align-middle' }, row.name));
      return h('div', { class: 'inline-flex items-center' }, items);
    }
  },
  {
    title: t('page.authorization.routePath'),
    key: 'fe_route',
    minWidth: 150,
    render(row: any) {
      return row.fe_route || '-';
    }
  },
  {
    title: t('page.authorization.componentPath'),
    key: 'fe_component',
    minWidth: 160,
    render(row: any) {
      return row.fe_component || '-';
    }
  },
  {
    title: t('page.authorization.permissionCode'),
    key: 'code',
    minWidth: 160,
    render(row: any) {
      return row.code ? h(NTag, { size: 'small', bordered: false }, { default: () => row.code }) : '-';
    }
  },
  {
    title: t('page.authorization.beApis'),
    key: 'be_apis',
    minWidth: 200,
    render(row: any) {
      const apisVal = row.be_apis || row.beApis;
      if (!apisVal) return '-';
      try {
        const list = typeof apisVal === 'string' ? JSON.parse(apisVal) : apisVal;
        if (Array.isArray(list) && list.length > 0) {
          return h(
            'div',
            { class: 'flex flex-wrap gap-1' },
            list.map((api: string) => {
              const method = api.split(' ')[0] || '';
              const type =
                method === 'GET' ? 'success' : method === 'POST' ? 'info' : method === 'PUT' ? 'warning' : 'error';
              return h(NTag, { size: 'tiny', type }, { default: () => api });
            })
          );
        }
      } catch {}
      return String(apisVal);
    }
  },
  {
    title: t('page.authorization.sort'),
    key: 'sort',
    width: 70,
    align: 'center' as const
  },
  {
    title: t('page.authorization.type'),
    key: 'type',
    width: 85,
    align: 'center' as const,
    render(row: any) {
      const typeMap: Record<string, { label: string; type: 'info' | 'primary' | 'warning' }> = {
        DIRECTORY: { label: t('page.authorization.directory'), type: 'info' },
        MENU: { label: t('page.authorization.menu'), type: 'primary' },
        BUTTON: { label: t('page.authorization.button'), type: 'warning' }
      };
      const info = typeMap[row.type] || { label: row.type, type: 'default' };
      return h(NTag, { type: info.type, size: 'small' }, { default: () => info.label });
    }
  },
  {
    title: t('page.authorization.isLink'),
    key: 'is_link',
    width: 75,
    align: 'center' as const,
    render(row: any) {
      if (row.type === 'BUTTON') return '-';
      return h(
        NTag,
        { type: row.is_link ? 'success' : 'default', size: 'small' },
        { default: () => (row.is_link ? t('page.authorization.yes') : t('page.authorization.no')) }
      );
    }
  },
  {
    title: t('page.authorization.cache'),
    key: 'is_cache',
    width: 75,
    align: 'center' as const,
    render(row: any) {
      if (row.type !== 'MENU') return '-';
      return h(
        NTag,
        { type: row.is_cache ? 'success' : 'default', size: 'small' },
        { default: () => (row.is_cache ? t('page.authorization.yes') : t('page.authorization.no')) }
      );
    }
  },
  {
    title: t('page.authorization.visible'),
    key: 'visible',
    width: 75,
    align: 'center' as const,
    render(row: any) {
      if (row.type === 'BUTTON') return '-';
      return h(
        NTag,
        { type: row.visible ? 'success' : 'error', size: 'small' },
        { default: () => (row.visible ? t('page.authorization.show') : t('page.authorization.hide')) }
      );
    }
  },
  {
    title: t('page.authorization.status'),
    key: 'status',
    width: 80,
    align: 'center' as const,
    render(row: any) {
      return h(
        NTag,
        { type: row.status ? 'success' : 'error', size: 'small' },
        { default: () => (row.status ? t('page.authorization.enable') : t('page.authorization.disable')) }
      );
    }
  },
  {
    title: t('page.authorization.actions'),
    key: 'actions',
    width: 280,
    align: 'center' as const,
    fixed: 'right' as const,
    render(row: any) {
      const btns: any[] = [];
      if (row.children && row.children.length > 0) {
        btns.push(
          h(
            NButton,
            {
              size: 'tiny',
              type: 'info',
              ghost: true,
              onClick: () => expandBranch(row)
            },
            { default: () => t('page.authorization.expand') }
          ),
          h(
            NButton,
            {
              size: 'tiny',
              type: 'warning',
              ghost: true,
              onClick: () => collapseBranch(row)
            },
            { default: () => t('page.authorization.collapse') }
          )
        );
      }
      if (row.type !== 'BUTTON') {
        btns.push(
          h(
            NButton,
            {
              size: 'tiny',
              type: 'primary',
              ghost: true,
              onClick: () => openAdd(row.id, row.type === 'DIRECTORY' ? 'MENU' : 'BUTTON')
            },
            { default: () => t('page.authorization.addChild') }
          )
        );
      }
      btns.push(
        h(
          NButton,
          {
            size: 'tiny',
            type: 'primary',
            ghost: true,
            onClick: () => openEdit(row)
          },
          { default: () => t('page.authorization.edit') }
        )
      );
      btns.push(
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row.id)
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'tiny',
                  type: 'error',
                  ghost: true
                },
                { default: () => t('page.authorization.delete') }
              ),
            default: () => t('page.authorization.deleteWarning')
          }
        )
      );
      return h(NSpace, { size: 6, justify: 'center', wrap: false }, { default: () => btns });
    }
  }
]);

const columnMap = Object.fromEntries(columns.value.map(column => [String(column.key), column]));
const defaultKeys = columns.value.map(column => String(column.key));
const {
  columnChecks,
  tableColumns,
  density,
  initColumnConfig,
  updateTableColumns,
  handleColumnWidthUpdate,
  saveColumnConfig
} = useTableColumnConfig({
  pageCode: 'authorization_menu',
  columnMap,
  defaultKeys
});

watch(columns, nextColumns => {
  nextColumns.forEach(column => {
    const key = String(column.key);
    Object.assign(columnMap[key], column);
    const check = columnChecks.value.find(item => String(item.key) === key);
    if (check) check.title = column.title;
  });
  updateTableColumns();
});

async function loadData() {
  loading.value = true;
  try {
    const response = await (fetchGetMenus as any)();
    const items = response?.data || [];
    rawData.value = Array.isArray(items) ? items : items.data || [];
  } catch (err: any) {
    message.error(err.message || 'Error loading permissions');
  } finally {
    loading.value = false;
  }
}

function openAdd(parentId = 0, defaultType: 'DIRECTORY' | 'MENU' | 'BUTTON' = 'DIRECTORY') {
  Object.assign(formModel, defaultForm());
  formModel.parent_id = Number(parentId || 0);
  formModel.type = defaultType;
  handleTypeChange(defaultType);
  isEdit.value = false;
  showModal.value = true;
}

function openEdit(row: any) {
  const apisVal = row.be_apis || row.beApis;
  let beApisStr = '';
  if (apisVal) {
    beApisStr = typeof apisVal === 'object' ? JSON.stringify(apisVal) : String(apisVal);
  }
  Object.assign(formModel, {
    id: row.id,
    name: row.name || '',
    code: row.code || '',
    type: row.type || 'DIRECTORY',
    parent_id: Number(row.parent_id || 0),
    fe_route: row.fe_route || '',
    fe_component: row.fe_component || '',
    sort: Number(row.sort ?? 0),
    icon: row.icon || '',
    is_link: Boolean(row.is_link),
    is_cache: row.is_cache !== false,
    visible: row.visible !== false,
    status: row.status !== false,
    be_apis: beApisStr
  });
  isEdit.value = true;
  showModal.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      name: formModel.name.trim(),
      code: formModel.code.trim(),
      type: formModel.type,
      parent_id: Number(formModel.parent_id || 0),
      fe_route: formModel.type === 'BUTTON' ? '' : formModel.fe_route.trim(),
      fe_component: formModel.type === 'BUTTON' ? '' : formModel.fe_component.trim(),
      sort: Number(formModel.sort || 0),
      icon: formModel.type === 'BUTTON' ? '' : (formModel.icon || '').trim(),
      is_link: formModel.type === 'BUTTON' ? false : Boolean(formModel.is_link),
      is_cache: formModel.type === 'MENU' ? Boolean(formModel.is_cache) : false,
      visible: formModel.type === 'BUTTON' ? true : Boolean(formModel.visible),
      status: Boolean(formModel.status),
      be_apis: formModel.be_apis.trim()
    };

    let res: any;
    if (isEdit.value && formModel.id) {
      res = await (fetchUpdateMenu as any)(formModel.id, payload);
    } else {
      res = await (fetchCreateMenu as any)(payload);
    }

    if (!res.error) {
      message.success(isEdit.value ? t('page.authorization.editSuccess') : t('page.authorization.addSuccess'));
      showModal.value = false;
      await loadData();
    } else {
      message.error(res.error.message || t('common.error'));
    }
  } catch (err: any) {
    message.error(`${t('common.error')}: ${err.message}`);
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(id: number) {
  try {
    const { error } = await (fetchDeleteMenu as any)(id);
    if (!error) {
      message.success(t('page.authorization.deleteSuccess'));
      await loadData();
    } else {
      message.error(error.message || t('common.error'));
    }
  } catch (err: any) {
    message.error(`${t('common.error')}: ${err.message}`);
  }
}

onMounted(async () => {
  await initColumnConfig();
  await loadData();
});
</script>

<template>
  <NSpace vertical :size="16" class="h-full">
    <NCard :title="t('page.authorization.menuManagement')" class="card-wrapper flex-1">
      <TableHeaderOperation
        v-model:columns="columnChecks"
        v-model:density="density"
        class="mb-4"
        :loading="loading"
        :show-add="false"
        :show-delete="false"
        @refresh="loadData"
      >
        <template #default>
          <NButton type="primary" @click="() => openAdd(0, 'DIRECTORY')">
            {{ t('page.authorization.addMenu') }}
          </NButton>
          <NButton type="info" ghost @click="expandAll">
            {{ t('page.authorization.expandAll') }}
          </NButton>
          <NButton type="warning" ghost @click="collapseAll">
            {{ t('page.authorization.collapseAll') }}
          </NButton>
        </template>
      </TableHeaderOperation>

      <NDataTable
        :size="density"
        :loading="loading"
        :columns="tableColumns"
        :data="treeData"
        :row-key="row => row.id"
        :expanded-row-keys="expandedRowKeys"
        :scroll-x="1200"
        @update:expanded-row-keys="(keys: any) => (expandedRowKeys = keys)"
        @unstable-column-resize="
          (_: number, width: number, column: any) => handleColumnWidthUpdate(String(column.key), width)
        "
        @mouseup="saveColumnConfig"
      />
    </NCard>

    <NModal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? t('page.authorization.editMenu') : t('page.authorization.addMenu')"
      style="width: 720px; max-width: 95vw"
    >
      <NTabs
        type="segment"
        :value="formModel.type"
        class="mb-4"
        @update:value="
          (val: any) => {
            formModel.type = val;
            handleTypeChange(val);
          }
        "
      >
        <NTabPane name="DIRECTORY" :tab="t('page.authorization.directory')" />
        <NTabPane name="MENU" :tab="t('page.authorization.menu')" />
        <NTabPane name="BUTTON" :tab="t('page.authorization.button')" />
      </NTabs>

      <NForm
        ref="formRef"
        :model="formModel"
        :rules="rules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <NFormItem :label="t('page.authorization.nodeName')" path="name">
          <NInput v-model:value="formModel.name" :placeholder="t('page.authorization.nodeName')" />
        </NFormItem>

        <NFormItem :label="t('page.authorization.parentNode')" path="parent_id">
          <NTreeSelect
            v-model:value="formModel.parent_id"
            :options="parentOptions"
            default-expand-all
            :placeholder="t('page.authorization.parentNode')"
          />
        </NFormItem>

        <NFormItem :label="t('page.authorization.permissionCode')" path="code">
          <NInput
            v-model:value="formModel.code"
            :placeholder="
              formModel.type === 'BUTTON' ? 'dns:zone:add' : formModel.type === 'DIRECTORY' ? 'dns' : 'dns_zones'
            "
          />
        </NFormItem>

        <NFormItem v-if="formModel.type !== 'BUTTON'" :label="t('page.authorization.routePath')" path="fe_route">
          <NInput v-model:value="formModel.fe_route" placeholder="/dns/zones" />
        </NFormItem>

        <NFormItem
          v-if="formModel.type !== 'BUTTON'"
          :label="t('page.authorization.componentPath')"
          path="fe_component"
        >
          <NInput
            v-model:value="formModel.fe_component"
            :placeholder="formModel.type === 'DIRECTORY' ? 'layout.base' : 'view.dns_zones'"
          />
        </NFormItem>

        <NFormItem v-if="formModel.type !== 'BUTTON'" :label="t('page.authorization.icon')" path="icon">
          <NInput v-model:value="formModel.icon" placeholder="ant-design:global-outlined" />
        </NFormItem>

        <NFormItem :label="t('page.authorization.beApisLabel')" path="be_apis">
          <NInput
            v-model:value="formModel.be_apis"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :placeholder="t('page.authorization.beApisPlaceholder')"
          />
        </NFormItem>

        <NFormItem :label="t('page.authorization.sort')" path="sort">
          <NInputNumber
            v-model:value="formModel.sort"
            :placeholder="t('common.inputField', { field: t('page.authorization.sort') })"
            :min="0"
            style="width: 100%"
          />
        </NFormItem>

        <NFormItem v-if="formModel.type !== 'BUTTON'" :label="t('page.authorization.isLink')" path="is_link">
          <NSwitch v-model:value="formModel.is_link" />
        </NFormItem>

        <NFormItem v-if="formModel.type === 'MENU'" :label="t('page.authorization.cache')" path="is_cache">
          <NSwitch v-model:value="formModel.is_cache" />
        </NFormItem>

        <NFormItem v-if="formModel.type !== 'BUTTON'" :label="t('page.authorization.visible')" path="visible">
          <NSwitch v-model:value="formModel.visible" />
        </NFormItem>

        <NFormItem :label="t('page.authorization.status')" path="status">
          <NSwitch v-model:value="formModel.status" />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>
