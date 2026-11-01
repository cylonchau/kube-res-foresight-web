<script setup lang="ts">
import { ref, onMounted, h, reactive, computed, watch } from 'vue';
import StatusSelect from '@/components/business/status-select.vue';
import HelpLabel from '@/components/common/help-label.vue';
import { fetchGetConfig, fetchGetConfigs, fetchUpdateConfig } from '@/service/api/system';
import { formatDateTime } from '@/utils/date';
import {
  NButton,
  useMessage,
  NSpace,
  NCard,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NCollapse,
  NCollapseItem,
  NTag
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { CONFIG_CATEGORIES, categoryOf, noteOf } from './config-catalogue';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { useLoading } from '@sa/hooks';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { refreshDefaultVisibleColumnCount, useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { operateWidth } from '@/utils/operate-width';

const message = useMessage();
const { t, locale } = useI18n();
const { loading, startLoading, endLoading } = useLoading(false);

const PAGE_CODE = 'system_config_manage';

const configs = ref<Api.System.Config[]>([]);
const saving = ref(false);

const searchForm = reactive({
  keyword: '',
  module: 'all'
});

const categoryLabel = (code: string) => t(`page.system.categories.${code}`);
// Only the groups that have a parameter are offered; the bookkeeping rows that code keeps (migration markers and the like) are not parameters.
const moduleOptions = computed(() => [
  { label: t('page.system.search.allModules', '全部分类'), value: 'all' },
  ...CONFIG_CATEGORIES.filter(code => configs.value.some(item => categoryOf(item.config_key) === code)).map(code => ({
    label: categoryLabel(code),
    value: code
  }))
]);

/** The name and the purpose of a parameter in the language of the page (the database holds the English ones). */
const isChinese = computed(() => locale.value.startsWith('zh'));
const nameOf = (row: Api.System.Config) =>
  (isChinese.value ? noteOf(row.config_key)?.name : undefined) || row.config_name;
const purposeOf = (row: Api.System.Config) =>
  (isChinese.value ? noteOf(row.config_key)?.purpose : undefined) || row.remark;

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
  config_key: '',
  config_name: '',
  config_value: '',
  remark: ''
});

const rules = {
  // most LDAP parameters may stay empty (bind account, phone attribute, group search ...): the server validates the whole; so may the
  // model and the key of the assistant (clearing the key switches it off)
  config_value: {
    validator: () =>
      editForm.config_key.startsWith('ldap.') ||
      ['assistant.model', 'assistant.api_key'].includes(editForm.config_key) ||
      editForm.config_value.trim() !== '',
    message: t('form.required'),
    trigger: 'blur'
  }
};

function getModuleTagType(key: string): 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
    auth: 'default',
    ldap: 'info',
    forecast: 'success',
    operator: 'success',
    assistant: 'info',
    ui: 'primary',
    notify: 'warning'
  };
  return types[categoryOf(key)] || 'default';
}

function getModuleLabel(key: string): string {
  return categoryLabel(categoryOf(key));
}

/** a parameter that holds a credential, by its name: "token" and "key" alone are not enough (a token lifetime, a reply length in tokens) */
function isSecretKey(key: string): boolean {
  return /(password|secret|api_key|private_key|access_key)$/i.test(key.trim());
}

function isMultilineKey(key: string): boolean {
  return key === 'ldap.ca_cert' || key === 'ldap.group_role_mappings';
}

function isBooleanKey(key: string, value: string): boolean {
  return (
    value === 'true' ||
    value === 'false' ||
    key.endsWith('.enabled') ||
    key.endsWith('_enabled') ||
    key.endsWith('.notify_expired')
  );
}

function isNumberKey(key: string, value: string): boolean {
  return !Number.isNaN(Number(value)) && /^\d+$/.test(value.trim()) && !key.includes('chat_id');
}

const columnMap: Record<string, any> = {
  id: {
    title: t('common.id'),
    key: 'id',
    width: 70,
    resizable: true,
    align: 'center'
  },
  config_name: {
    title: t('page.system.columns.configName', '参数名称'),
    key: 'config_name',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render(row: Api.System.Config) {
      return h(
        NSpace,
        { align: 'center', size: 6 },
        {
          default: () => [
            h(
              NTag,
              { size: 'tiny', type: getModuleTagType(row.config_key), bordered: false, round: true },
              { default: () => getModuleLabel(row.config_key) }
            ),
            h('span', { class: 'font-medium' }, nameOf(row))
          ]
        }
      );
    }
  },
  config_key: {
    title: t('page.system.columns.configKey', '参数键名'),
    key: 'config_key',
    width: 260,
    resizable: true,
    ellipsis: { tooltip: true },
    render(row: Api.System.Config) {
      return h(NTag, { size: 'small', bordered: false, class: 'font-mono text-xs' }, { default: () => row.config_key });
    }
  },
  config_value: {
    title: t('page.system.columns.configValue', '参数值'),
    key: 'config_value',
    width: 220,
    resizable: true,
    ellipsis: { tooltip: true },
    render(row: Api.System.Config) {
      if (isSecretKey(row.config_key) && row.config_value) {
        return h(NTag, { size: 'tiny', type: 'warning', bordered: false }, { default: () => '••••••••' });
      }
      if (row.config_value === 'true') {
        return h(NTag, { size: 'tiny', type: 'success', bordered: false }, { default: () => 'true' });
      }
      if (row.config_value === 'false') {
        return h(NTag, { size: 'tiny', type: 'default', bordered: false }, { default: () => 'false' });
      }
      return h('span', { class: 'font-mono text-xs font-semibold text-primary' }, row.config_value || '-');
    }
  },
  remark: {
    title: t('page.system.columns.remark', '备注说明'),
    key: 'remark',
    width: 320,
    resizable: true,
    ellipsis: { tooltip: true },
    render(row: Api.System.Config) {
      return purposeOf(row) || '-';
    }
  },
  created_at: {
    title: t('common.createTime', '创建时间'),
    key: 'created_at',
    width: 170,
    resizable: true,
    align: 'center',
    render(row: any) {
      return formatDateTime(row.created_at || row.createdAt);
    }
  },
  updated_at: {
    title: t('common.updateTime', '更新时间'),
    key: 'updated_at',
    width: 170,
    resizable: true,
    align: 'center',
    render(row: any) {
      return formatDateTime(row.updated_at || row.updatedAt);
    }
  },
  operate: {
    title: t('common.operate', '操作'),
    key: 'operate',
    width: operateWidth([t('common.edit')]),
    resizable: true,
    align: 'center',
    fixed: 'right',
    render(row: Api.System.Config) {
      return h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          onClick: () => handleEdit(row)
        },
        { default: () => t('common.edit', '编辑') }
      );
    }
  }
};

const defaultColumnKeys = ['config_name', 'config_key', 'config_value', 'remark', 'updated_at', 'operate'];

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

const filteredConfigs = computed(() => {
  const kw = searchForm.keyword.trim().toLowerCase();
  const mod = searchForm.module;

  return configs.value.filter(item => {
    if (mod !== 'all' && categoryOf(item.config_key) !== mod) return false;
    if (!kw) return true;
    return [nameOf(item), item.config_name, item.config_key, item.config_value, purposeOf(item)].some(val =>
      String(val || '')
        .toLowerCase()
        .includes(kw)
    );
  });
});

watch(
  filteredConfigs,
  list => {
    pagination.itemCount = list.length;
  },
  { immediate: true }
);

const pagedConfigs = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredConfigs.value.slice(start, start + pagination.pageSize);
});

async function loadConfigs() {
  startLoading();
  try {
    const { data } = await fetchGetConfigs();
    if (data) {
      configs.value = data;
    }
  } finally {
    endLoading();
  }
}

function submitSearch() {
  pagination.page = 1;
}

function resetSearchParams() {
  searchForm.keyword = '';
  searchForm.module = 'all';
  pagination.page = 1;
}

function handleEdit(row: Api.System.Config) {
  editForm.config_key = row.config_key;
  editForm.config_name = nameOf(row);
  editForm.config_value = row.config_value;
  editForm.remark = purposeOf(row);
  showModal.value = true;
}

// a secret is read back as a mask, never as the text that was sent
function sameAsSent(persisted: string) {
  if (isSecretKey(editForm.config_key) || editForm.config_key === 'ldap.ca_cert') return persisted !== '';
  return persisted === editForm.config_value;
}

async function handleSubmit() {
  formRef.value?.validate(async (errors: any) => {
    if (!errors) {
      saving.value = true;
      try {
        const { error } = await fetchUpdateConfig(editForm.config_key, editForm.config_value);
        if (!error) {
          const { data: persisted, error: readError } = await fetchGetConfig(editForm.config_key);
          if (readError || !sameAsSent(String(persisted?.config_value ?? ''))) {
            message.error(t('page.system.readbackMismatch'));
            return;
          }
          if (editForm.config_key === 'ui.table.default_visible_columns') {
            await refreshDefaultVisibleColumnCount();
          }
          message.success(t('common.modifySuccess'));
          showModal.value = false;
          loadConfigs();
        }
      } finally {
        saving.value = false;
      }
    }
  });
}

onMounted(() => {
  initColumnConfig();
  loadConfigs();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden">
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm mb-12px">
      <NCollapse class="list-search-collapse compact-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="searchForm" label-placement="top" :show-feedback="false">
            <div class="list-search-row">
              <NFormItem
                class="list-search-item list-search-main"
                :label="t('page.system.columns.configName')"
                path="keyword"
              >
                <NInput
                  v-model:value="searchForm.keyword"
                  clearable
                  :placeholder="t('page.system.search.placeholderKeyword')"
                  @keyup.enter="submitSearch"
                />
              </NFormItem>

              <NFormItem
                class="list-search-item list-search-medium-field"
                :label="t('page.system.search.module')"
                path="module"
              >
                <NSelect
                  v-model:value="searchForm.module"
                  :placeholder="t('common.selectField', { field: t('page.system.search.module') })"
                  :options="moduleOptions"
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
          @refresh="loadConfigs"
        />
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="pagedConfigs"
            :pagination="pagination"
            :row-key="row => row.config_key"
            :size="density"
            :scroll-x="1200"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>

    <NModal v-model:show="showModal" preset="card" :title="t('page.system.editValue')" class="w-560px">
      <NForm ref="formRef" :model="editForm" :rules="rules" label-placement="top">
        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.system.columns.configName')" :help="t('page.formHelp.configName')" />
          </template>
          <NInput
            v-model:value="editForm.config_name"
            :placeholder="t('common.inputField', { field: t('page.system.columns.configName') })"
            disabled
          />
        </NFormItem>

        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.system.columns.configKey')" :help="t('page.formHelp.configKey')" />
          </template>
          <NInput
            v-model:value="editForm.config_key"
            :placeholder="t('common.inputField', { field: t('page.system.columns.configKey') })"
            disabled
            class="font-mono"
          />
        </NFormItem>

        <NFormItem path="config_value">
          <template #label>
            <HelpLabel :label="t('page.system.columns.configValue')" :help="t('page.formHelp.configValue')" />
          </template>
          <!-- Boolean Switch / Select -->
          <div
            v-if="isBooleanKey(editForm.config_key, editForm.config_value)"
            class="flex items-center gap-12px w-full"
          >
            <StatusSelect
              :value="editForm.config_value === 'true'"
              @update:value="(val: boolean) => (editForm.config_value = String(val))"
            />
          </div>

          <!-- Integer Number Input -->
          <NInputNumber
            v-else-if="isNumberKey(editForm.config_key, editForm.config_value)"
            :value="Number(editForm.config_value)"
            :min="0"
            :precision="0"
            class="w-full"
            @update:value="(val: number | null) => (editForm.config_value = String(val ?? 0))"
          />

          <!-- Secret / Password Input -->
          <NInput
            v-else-if="isSecretKey(editForm.config_key)"
            v-model:value="editForm.config_value"
            type="password"
            show-password-on="click"
            :placeholder="t('page.system.columns.configValue')"
          />

          <!-- Multi-line values: certificate, group to role lines -->
          <NInput
            v-else-if="isMultilineKey(editForm.config_key)"
            v-model:value="editForm.config_value"
            type="textarea"
            :rows="6"
            class="font-mono"
            :placeholder="t('page.system.columns.configValue')"
          />

          <!-- General Text / List Input -->
          <NInput v-else v-model:value="editForm.config_value" :placeholder="t('page.system.columns.configValue')" />
        </NFormItem>

        <NFormItem>
          <template #label>
            <HelpLabel :label="t('page.system.columns.remark')" :help="t('page.formHelp.configRemark')" />
          </template>
          <NInput
            v-model:value="editForm.remark"
            :placeholder="t('common.inputField', { field: t('page.system.columns.remark') })"
            type="textarea"
            :rows="3"
            disabled
          />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="handleSubmit">
            {{ t('common.confirm') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped></style>
