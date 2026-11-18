<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDatePicker,
  NForm,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NSelect,
  NSpace,
  NTag
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetAssistantAudits } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

defineOptions({ name: 'AiConfigAudit' });

/**
 * The audit of the AI assistant: one record for each question put to a language model, with who asked, from which page, which model and mode
 * answered, which tools were read and which were refused, how long it took and the tokens it used. A record holds no question, answer or tool
 * result: an administrator sees how the assistant is used, never what a user said to it.
 */
const PAGE_CODE = 'ai_config_audit';
const { t } = useI18n();
const loading = ref(false);
const rows = ref<Api.Assistant.AuditRow[]>([]);

const searchParams = reactive<{
  keyword: string;
  status: 'success' | 'failed' | null;
  source: 'chat' | 'skill' | 'task' | null;
  refused: 'true' | null;
  range: [number, number] | null;
}>({ keyword: '', status: null, source: null, refused: null, range: null });

const statusOptions = computed(() => [
  { label: t('page.assistant.audit.status_success'), value: 'success' },
  { label: t('page.assistant.audit.status_failed'), value: 'failed' }
]);
const sourceOptions = computed(() => [
  { label: t('page.assistant.audit.source_chat'), value: 'chat' },
  { label: t('page.assistant.audit.source_skill'), value: 'skill' },
  { label: t('page.assistant.audit.source_task'), value: 'task' }
]);
const refusedOptions = computed(() => [{ label: t('page.assistant.audit.onlyRefused'), value: 'true' }]);

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
    const range = searchParams.range;
    const { data } = await fetchGetAssistantAudits({
      page: pagination.page,
      page_size: pagination.pageSize,
      keyword: searchParams.keyword.trim() || undefined,
      status: searchParams.status ?? undefined,
      source: searchParams.source ?? undefined,
      refused: searchParams.refused ?? undefined,
      from: range ? new Date(range[0]).toISOString() : undefined,
      to: range ? new Date(range[1]).toISOString() : undefined
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
  searchParams.source = null;
  searchParams.refused = null;
  searchParams.range = null;
  search();
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;

const columnMap: Record<string, any> = {
  id: { title: t('common.id'), key: 'id', width: 80, align: 'center' },
  created_at: {
    title: t('page.assistant.audit.time'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.Assistant.AuditRow) => formatDateTime(row.created_at)
  },
  user_name: {
    title: t('page.assistant.audit.user'),
    key: 'user_name',
    width: 130,
    render: (row: Api.Assistant.AuditRow) => row.user_name || '-'
  },
  source: {
    title: t('page.assistant.audit.source'),
    key: 'source',
    width: 90,
    align: 'center',
    render: (row: Api.Assistant.AuditRow) =>
      t(`page.assistant.audit.source_${row.source}` as App.I18n.I18nKey, row.source)
  },
  page: {
    title: t('page.assistant.audit.page'),
    key: 'page',
    width: 200,
    ellipsis: { tooltip: true },
    render: (row: Api.Assistant.AuditRow) => row.page || '-'
  },
  model: { title: t('page.assistant.model'), key: 'model', width: 170, ellipsis: { tooltip: true } },
  tool_mode: {
    title: t('page.assistant.toolMode'),
    key: 'tool_mode',
    width: 100,
    align: 'center',
    render: (row: Api.Assistant.AuditRow) =>
      row.tool_mode
        ? t(
            `page.assistant.toolMode${row.tool_mode.charAt(0).toUpperCase()}${row.tool_mode.slice(1)}` as App.I18n.I18nKey
          )
        : '-'
  },
  status: {
    title: t('common.status'),
    key: 'status',
    width: 90,
    align: 'center',
    render: (row: Api.Assistant.AuditRow) =>
      h(NTag, { size: 'small', bordered: false, type: row.status === 'success' ? 'success' : 'error' }, () =>
        t(`page.assistant.audit.status_${row.status}` as App.I18n.I18nKey, row.status)
      )
  },
  duration_ms: {
    title: t('page.assistant.audit.duration'),
    key: 'duration_ms',
    width: 90,
    align: 'right',
    render: (row: Api.Assistant.AuditRow) => seconds(row.duration_ms)
  },
  tokens: {
    title: t('page.assistant.audit.tokens'),
    key: 'tokens',
    width: 130,
    align: 'right',
    render: (row: Api.Assistant.AuditRow) =>
      row.prompt_tokens || row.completion_tokens ? `${row.prompt_tokens} + ${row.completion_tokens}` : '-'
  },
  tools: {
    title: t('page.assistant.audit.tools'),
    key: 'tools',
    width: 260,
    render: (row: Api.Assistant.AuditRow) =>
      row.tools.length
        ? h(NSpace, { size: 4, wrap: true }, () =>
            row.tools.map(tool =>
              h(NTag, { size: 'tiny', bordered: false, type: tool.ok ? 'default' : 'error' }, () => tool.name)
            )
          )
        : '-'
  },
  refused: {
    title: t('page.assistant.audit.refused'),
    key: 'refused',
    width: 220,
    render: (row: Api.Assistant.AuditRow) =>
      row.refused.length
        ? h(NSpace, { size: 4, wrap: true }, () =>
            row.refused.map(name => h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, () => name))
          )
        : '-'
  },
  error: {
    title: t('page.assistant.audit.error'),
    key: 'error',
    width: 260,
    ellipsis: { tooltip: true },
    render: (row: Api.Assistant.AuditRow) => row.error || '-'
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
  defaultKeys: [
    'id',
    'created_at',
    'user_name',
    'source',
    'page',
    'model',
    'status',
    'duration_ms',
    'tokens',
    'tools',
    'refused'
  ]
});

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
              <NFormItemGi :span="6" :label="t('page.assistant.keyword')" path="keyword">
                <NInput
                  v-model:value="searchParams.keyword"
                  clearable
                  :placeholder="t('page.assistant.audit.keywordPlaceholder')"
                  @keyup.enter="search"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
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
                :span="4"
                :label="t('page.assistant.audit.source')"
                path="source"
              >
                <NSelect
                  v-model:value="searchParams.source"
                  clearable
                  :placeholder="t('common.selectField', { field: t('page.assistant.audit.source') })"
                  :options="sourceOptions"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="t('page.assistant.audit.refused')"
                path="refused"
              >
                <NSelect v-model:value="searchParams.refused" clearable :options="refusedOptions" />
              </NFormItemGi>
              <NFormItemGi :span="6" :label="t('page.assistant.audit.time')" path="range">
                <NDatePicker v-model:value="searchParams.range" type="datetimerange" clearable class="w-full" />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="24">
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
          :show-add="false"
          :show-delete="false"
          @refresh="load"
        />
        <div class="mb-8px text-12px opacity-60">{{ t('page.assistant.audit.hint') }}</div>
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :data="rows"
            :loading="loading"
            :pagination="pagination"
            :row-key="row => row.id"
            :size="density"
            class="h-full"
            flex-height
            @update:columns="handleColumnUpdate"
            @unstable-column-resize="handleColumnWidthUpdate"
            @mouseup="saveColumnConfig"
          />
        </div>
      </div>
    </NCard>
  </div>
</template>
