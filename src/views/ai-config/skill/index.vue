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
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useDialog,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import StatusSelect from '@/components/business/status-select.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchDeleteAssistantSkills,
  fetchCreateAssistantSkill,
  fetchDeleteAssistantSkill,
  fetchGetAssistantConnectionOptions,
  fetchGetAssistantSkills,
  fetchUpdateAssistantSkill
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'AiConfigSkill' });

/**
 * Skill management: the commands of the chat (/report, /export, ...). The built-in ones can be switched off and pointed at a model; an
 * administrator adds their own: a prompt put to the language model with the tools of the assistant, where "{{args}}" is what the user
 * types after the command.
 */
const PAGE_CODE = 'ai_config_skill';
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const loading = ref(false);
const saving = ref(false);
const rows = ref<Api.Assistant.SkillRow[]>([]);
const models = ref<Api.Assistant.ConnectionOption[]>([]);
const checkedRowKeys = ref<number[]>([]);
const visible = ref(false);
const editing = ref<Api.Assistant.SkillRow>();

const searchParams = reactive<{ keyword: string; kind: 'builtin' | 'custom' | null; enabled: 'true' | 'false' | null }>(
  {
    keyword: '',
    kind: null,
    enabled: null
  }
);
const kindOptions = computed(() => [
  { label: t('page.assistant.kind_builtin'), value: 'builtin' },
  { label: t('page.assistant.kind_custom'), value: 'custom' }
]);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);
const argOptions = computed(() =>
  (['none', 'required', 'optional'] as const).map(value => ({ label: t(`page.assistant.argMode_${value}`), value }))
);
const modelOptions = computed(() => [
  { label: t('page.assistant.useDefaultModel'), value: 0 },
  ...models.value.map(item => ({ label: `${item.name} · ${item.model}`, value: item.id }))
]);
const modelName = (id: number) =>
  models.value.find(item => item.id === id)?.name ?? t('page.assistant.useDefaultModel');

function emptyForm() {
  return {
    name: '',
    title: '',
    description: '',
    prompt: '',
    arg_mode: 'none' as Api.Assistant.SkillPayload['arg_mode'],
    arg_hint: '',
    llm_id: 0,
    enabled: true
  };
}
const form = reactive(emptyForm());

/** the words of a skill: a built-in one is worded by the interface, a custom one by whoever wrote it */
const titleOf = (row: Api.Assistant.SkillRow) =>
  row.builtin ? t(`page.assistant.skillTitle_${row.name}`, row.title || row.name) : row.title || row.name;
const descriptionOf = (row: Api.Assistant.SkillRow) =>
  row.builtin ? t(`page.assistant.skill_${row.name}`, row.description || '') : row.description || '';

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
      fetchGetAssistantSkills({
        page: pagination.page,
        page_size: pagination.pageSize,
        keyword: searchParams.keyword.trim() || undefined,
        kind: searchParams.kind ?? undefined,
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
  searchParams.kind = null;
  searchParams.enabled = null;
  search();
}

function open(row?: Api.Assistant.SkillRow) {
  editing.value = row;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      name: row.name,
      title: row.title ?? '',
      description: row.description ?? '',
      prompt: row.prompt,
      arg_mode: row.arg === 'module' || row.arg === 'text' ? 'required' : row.arg ? 'optional' : 'none',
      arg_hint: row.arg_hint ?? '',
      llm_id: row.llm_id,
      enabled: row.enabled
    });
  }
  visible.value = true;
}

const builtin = computed(() => editing.value?.builtin === true);
const direct = computed(() => editing.value?.direct === true);

function check() {
  if (builtin.value) return '';
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(form.name.trim())) return t('page.assistant.skillNameInvalid');
  if (!form.prompt.trim()) return t('page.assistant.promptRequired');
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
    const data: Api.Assistant.SkillPayload = {
      ...form,
      name: form.name.trim(),
      title: form.title.trim(),
      prompt: form.prompt.trim()
    };
    const { error } = id ? await fetchUpdateAssistantSkill(id, data) : await fetchCreateAssistantSkill(data);
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
  const { error } = await fetchDeleteAssistantSkill(id);
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
    content: t('page.assistant.confirmBatchDeleteSkills'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    async onPositiveClick() {
      const { error } = await fetchBatchDeleteAssistantSkills(checkedRowKeys.value);
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
    title: t('page.assistant.command'),
    key: 'name',
    width: 150,
    resizable: true,
    render: (row: Api.Assistant.SkillRow) => h('code', `/${row.name}`)
  },
  title: {
    title: t('page.assistant.skillTitle'),
    key: 'title',
    width: 170,
    resizable: true,
    render: (row: Api.Assistant.SkillRow) => titleOf(row)
  },
  description: {
    title: t('page.assistant.description'),
    key: 'description',
    width: 360,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: Api.Assistant.SkillRow) => descriptionOf(row) || '-'
  },
  builtin: {
    title: t('page.assistant.kind'),
    key: 'builtin',
    width: 100,
    align: 'center',
    render: (row: Api.Assistant.SkillRow) =>
      h(NTag, { size: 'small', bordered: false, type: row.builtin ? 'default' : 'info' }, () =>
        t(`page.assistant.kind_${row.builtin ? 'builtin' : 'custom'}`)
      )
  },
  direct: {
    title: t('page.assistant.runsOn'),
    key: 'direct',
    width: 130,
    align: 'center',
    render: (row: Api.Assistant.SkillRow) => (row.direct ? t('page.assistant.runsDirect') : modelName(row.llm_id))
  },
  enabled: {
    title: t('common.status'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.Assistant.SkillRow) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  updated_at: {
    title: t('common.updateTime'),
    key: 'updated_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.SkillRow) => (row.updated_at ? formatDateTime(row.updated_at) : '-')
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: operateWidth([t('common.edit'), t('common.delete')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Assistant.SkillRow) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        row.builtin
          ? null
          : h(
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
  defaultKeys: ['__selection__', 'id', 'name', 'title', 'description', 'builtin', 'enabled', 'actions']
});

const drawerTitle = computed(() => (editing.value ? t('page.assistant.editSkill') : t('page.assistant.addSkill')));

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
                  :placeholder="t('page.assistant.skillKeywordPlaceholder')"
                  @keyup.enter="search"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="t('page.assistant.kind')"
                path="kind"
              >
                <NSelect
                  v-model:value="searchParams.kind"
                  clearable
                  :placeholder="t('common.selectField', { field: t('page.assistant.kind') })"
                  :options="kindOptions"
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

    <NDrawer v-model:show="visible" :width="560" placement="right">
      <NDrawerContent :title="drawerTitle" closable :native-scrollbar="false">
        <NForm :model="form" label-placement="top">
          <div class="skill-name-row">
            <NFormItem class="flex-1" required>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.assistant.command') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.assistant.commandHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInput v-model:value="form.name" :disabled="builtin" placeholder="my-skill">
                <template #prefix>/</template>
              </NInput>
            </NFormItem>
            <NFormItem :label="t('page.assistant.enabled')">
              <StatusSelect v-model:value="form.enabled" />
            </NFormItem>
          </div>
          <template v-if="builtin && editing">
            <NFormItem :label="t('page.assistant.skillTitle')">
              <NInput :value="titleOf(editing)" disabled />
            </NFormItem>
            <NFormItem :label="t('page.assistant.description')">
              <NInput :value="descriptionOf(editing)" type="textarea" :rows="2" disabled />
            </NFormItem>
          </template>
          <template v-else>
            <NFormItem :label="t('page.assistant.skillTitle')">
              <NInput
                v-model:value="form.title"
                :placeholder="t('common.inputField', { field: t('page.assistant.skillTitle') })"
              />
            </NFormItem>
            <NFormItem :label="t('page.assistant.description')">
              <NInput
                v-model:value="form.description"
                type="textarea"
                :rows="2"
                :placeholder="t('common.inputField', { field: t('page.assistant.description') })"
              />
            </NFormItem>
          </template>
          <NFormItem v-if="!direct">
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.skillModel') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.assistant.skillModelHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.llm_id" :options="modelOptions" />
          </NFormItem>
          <NFormItem v-else>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.skillModel') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.assistant.directHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInput :value="t('page.assistant.runsDirect')" disabled />
          </NFormItem>
          <NGrid v-if="!builtin" :cols="2" :x-gap="16">
            <NFormItemGi>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.assistant.argMode') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.assistant.argModeHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.arg_mode" :options="argOptions" />
            </NFormItemGi>
            <NFormItemGi v-if="form.arg_mode !== 'none'" :label="t('page.assistant.argHint')">
              <NInput v-model:value="form.arg_hint" :placeholder="t('page.assistant.argHintExample')" />
            </NFormItemGi>
          </NGrid>
          <NFormItem v-if="!direct" :required="!builtin">
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.assistant.prompt') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">
                    {{ builtin ? t('page.assistant.builtinPromptHint') : t('page.assistant.promptHint') }}
                  </div>
                </IconTooltip>
              </span>
            </template>
            <NInput
              v-model:value="form.prompt"
              type="textarea"
              :rows="9"
              :disabled="builtin"
              :placeholder="t('page.assistant.promptPlaceholder')"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end" class="w-full">
            <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.skill-name-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
</style>
