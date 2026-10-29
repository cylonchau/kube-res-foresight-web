<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import { fetchClearOperationLogs, fetchGetOperationLogs } from '@/service/api/system';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import TimeRangeField from '@/components/business/time-range-field.vue';
import { resolveRange } from '@/hooks/business/use-forecast-modules';
import { operateWidth } from '@/utils/operate-width';

const { t } = useI18n();
const route = useRoute();
const message = useMessage();
const pageKey = 'system_operation_log';
const canClear = computed(() => (route.meta.buttons ?? []).some((b: any) => b.code === 'system:operation-log:clear'));
const clearing = ref(false);
const rows = ref<Api.System.OperationLog[]>([]);
const loading = ref(false);
const detailVisible = ref(false);
const currentDetail = ref<Api.System.OperationLog | null>(null);

const search = reactive({
  keyword: '',
  clientType: null as string | null,
  status: null as string | null,
  range: null as [number, number] | null
});

const sourceOptions = computed(() => [
  { label: t('page.operationLog.sourcePage'), value: 'page' },
  { label: t('page.operationLog.sourceApi'), value: 'api' },
  { label: t('page.operationLog.sourceCli'), value: 'cli' },
  { label: t('page.operationLog.sourceOperator'), value: 'operator' }
]);

const statusOptions = computed(() => [
  { label: t('page.operationLog.statusSuccess'), value: 'success' },
  { label: t('page.operationLog.statusFailed'), value: 'failed' }
]);

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  itemCount: 0,
  showSizePicker: true,
  pageSizes: getAdaptivePageSizes(),
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

// the server reads a time without an offset as UTC+8, the zone every time is shown in
function formatQueryTime(ms: number) {
  return formatDateTime(ms);
}

async function load() {
  loading.value = true;
  const resolved = resolveRange(search.range);
  const { data } = await fetchGetOperationLogs({
    page: pagination.page,
    page_size: pagination.pageSize,
    keyword: search.keyword || undefined,
    client_type: search.clientType || undefined,
    status: search.status || undefined,
    start_time: resolved ? formatQueryTime(resolved[0]) : undefined,
    end_time: resolved ? formatQueryTime(resolved[1]) : undefined
  });
  loading.value = false;
  if (data) {
    rows.value = data.list || [];
    pagination.itemCount = data.total || 0;
  }
}

function resetSearch() {
  Object.assign(search, { keyword: '', clientType: null, status: null, range: null });
  pagination.page = 1;
  load();
}

function openDetail(row: Api.System.OperationLog) {
  currentDetail.value = row;
  detailVisible.value = true;
}

async function clearLogs() {
  clearing.value = true;
  const { error } = await fetchClearOperationLogs();
  clearing.value = false;
  if (!error) {
    message.success(t('common.deleteSuccess'));
    pagination.page = 1;
    load();
  }
}

const sourceMeta: Record<string, { type: 'info' | 'success' | 'warning' | 'primary'; labelKey: string }> = {
  page: { type: 'info', labelKey: 'page.operationLog.sourcePage' },
  api: { type: 'warning', labelKey: 'page.operationLog.sourceApi' },
  cli: { type: 'primary', labelKey: 'page.operationLog.sourceCli' },
  operator: { type: 'success', labelKey: 'page.operationLog.sourceOperator' }
};

const columnMap: Record<string, any> = {
  created_at: {
    title: t('page.operationLog.columns.createdAt'),
    key: 'created_at',
    width: 170,
    resizable: true,
    align: 'center',
    render: (row: Api.System.OperationLog) => formatDateTime(row.created_at)
  },
  client_type: {
    title: t('page.operationLog.columns.source'),
    key: 'client_type',
    width: 100,
    resizable: true,
    align: 'center',
    render: (row: Api.System.OperationLog) => {
      const meta = sourceMeta[row.client_type] || { type: 'info' as const, labelKey: '' };
      return h(NTag, { type: meta.type, size: 'small', bordered: false }, () => t(meta.labelKey) || row.client_type);
    }
  },
  request_id: {
    title: t('page.operationLog.columns.requestId'),
    key: 'request_id',
    width: 230,
    resizable: true,
    align: 'left',
    ellipsis: { tooltip: true },
    render: (row: Api.System.OperationLog) => (row.request_id ? h('code', row.request_id) : '-')
  },
  client_name: {
    title: t('page.operationLog.columns.clientName'),
    key: 'client_name',
    width: 200,
    resizable: true,
    align: 'center',
    ellipsis: { tooltip: true },
    render: (row: Api.System.OperationLog) => row.client_name || '-'
  },
  username: {
    title: t('page.operationLog.columns.username'),
    key: 'username',
    width: 140,
    resizable: true,
    align: 'center',
    render: (row: Api.System.OperationLog) => row.username || '-'
  },
  method: {
    title: t('page.operationLog.columns.method'),
    key: 'method',
    width: 90,
    resizable: true,
    align: 'center'
  },
  path: {
    title: t('page.operationLog.columns.path'),
    key: 'path',
    width: 260,
    resizable: true,
    align: 'left',
    ellipsis: { tooltip: true },
    render: (row: Api.System.OperationLog) => h('code', row.path)
  },
  module: {
    title: t('page.operationLog.columns.module'),
    key: 'module',
    width: 130,
    resizable: true,
    align: 'center'
  },
  status_code: {
    title: t('page.operationLog.columns.statusCode'),
    key: 'status_code',
    width: 100,
    resizable: true,
    align: 'center',
    render: (row: Api.System.OperationLog) =>
      h(NTag, { type: row.status_code < 400 ? 'success' : 'error', size: 'small', bordered: false }, () =>
        String(row.status_code)
      )
  },
  client_ip: {
    title: t('page.operationLog.columns.clientIp'),
    key: 'client_ip',
    width: 140,
    resizable: true,
    align: 'center'
  },
  duration_ms: {
    title: t('page.operationLog.columns.duration'),
    key: 'duration_ms',
    width: 100,
    resizable: true,
    align: 'center'
  },
  operate: {
    title: t('common.action'),
    key: 'operate',
    width: operateWidth([t('page.operationLog.detail')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.System.OperationLog) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', secondary: true, onClick: () => openDetail(row) }, () =>
          t('page.operationLog.detail')
        )
      ])
  }
};

const defaultKeys = [
  'created_at',
  'client_type',
  'client_name',
  'request_id',
  'username',
  'method',
  'path',
  'module',
  'status_code',
  'client_ip',
  'duration_ms',
  'operate'
];

const { columnChecks, tableColumns, density, initColumnConfig, handleColumnWidthUpdate } = useTableColumnConfig({
  pageCode: pageKey,
  columnMap,
  defaultKeys
});

onMounted(() => {
  initColumnConfig();
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm">
      <NCollapse class="list-search-collapse" :default-expanded-names="['1']">
        <NCollapseItem :title="$t('common.search')" name="1">
          <NForm class="list-search-form" inline :model="search" label-placement="top" :show-feedback="false">
            <NGrid class="list-search-row" :cols="24" :x-gap="24">
              <NFormItemGi :span="6" :label="$t('common.keyword')" path="keyword">
                <NInput
                  v-model:value="search.keyword"
                  clearable
                  :placeholder="$t('page.operationLog.keywordPlaceholder')"
                  @keyup.enter="load"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="$t('page.operationLog.source')"
                path="clientType"
              >
                <NSelect
                  v-model:value="search.clientType"
                  clearable
                  :placeholder="$t('page.operationLog.allSources')"
                  :options="sourceOptions"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="4"
                :label="$t('common.status')"
                path="status"
              >
                <NSelect
                  v-model:value="search.status"
                  clearable
                  :placeholder="$t('page.operationLog.allStatuses')"
                  :options="statusOptions"
                />
              </NFormItemGi>
              <NFormItemGi :span="6" :label="$t('page.operationLog.dateRange')" path="range">
                <TimeRangeField v-model="search.range" />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="4">
                <NSpace justify="end" class="w-full">
                  <NButton @click="resetSearch">{{ $t('common.reset') }}</NButton>
                  <NButton type="primary" @click="load">{{ $t('common.search') }}</NButton>
                </NSpace>
              </NGi>
            </NGrid>
          </NForm>
        </NCollapseItem>
      </NCollapse>
    </NCard>
    <NCard :bordered="false" size="small" class="flex-1 overflow-hidden card-wrapper rounded-16px shadow-sm">
      <div class="h-full flex flex-col justify-between gap-12px">
        <TableHeaderOperation
          v-model:columns="columnChecks"
          v-model:density="density"
          :loading="loading"
          :show-add="false"
          :show-delete="false"
          @refresh="load"
        >
          <template #prefix>
            <div class="flex items-center gap-6px whitespace-nowrap text-14px font-medium mr-8px">
              {{ $t('page.operationLog.title') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ $t('page.operationLog.help') }}</div>
              </IconTooltip>
            </div>
          </template>
          <template v-if="canClear" #suffix>
            <NPopconfirm @positive-click="clearLogs">
              <template #trigger>
                <NButton size="small" ghost type="error" :loading="clearing">
                  <template #icon>
                    <icon-ic-round-delete class="text-icon" />
                  </template>
                  {{ $t('page.operationLog.clear') }}
                </NButton>
              </template>
              {{ $t('page.operationLog.clearConfirm') }}
            </NPopconfirm>
          </template>
        </TableHeaderOperation>
        <div class="flex-1 overflow-hidden">
          <ExpandableDataTable
            v-model:columns="tableColumns"
            remote
            :loading="loading"
            :data="rows"
            :pagination="pagination"
            :row-key="row => row.id"
            :size="density"
            class="h-full"
            flex-height
            @unstable-column-resize="handleColumnWidthUpdate"
          />
        </div>
      </div>
    </NCard>
    <NModal v-model:show="detailVisible" preset="card" :title="$t('page.operationLog.detailTitle')" class="w-640px">
      <template v-if="currentDetail">
        <NSpace vertical size="large">
          <div class="flex flex-wrap gap-x-24px gap-y-4px text-13px">
            <span>
              <span class="text-gray-500">{{ $t('page.operationLog.columns.requestId') }}</span>
              <code class="ml-6px">{{ currentDetail.request_id || '-' }}</code>
            </span>
            <span>
              <span class="text-gray-500">{{ $t('page.operationLog.columns.clientName') }}</span>
              <span class="ml-6px">{{ currentDetail.client_name || '-' }}</span>
            </span>
          </div>
          <div>
            <div class="text-12px text-gray-500 mb-4px">{{ $t('page.operationLog.params') }}</div>
            <NInput
              :value="currentDetail.params || $t('page.operationLog.noDetail')"
              type="textarea"
              readonly
              :autosize="{ minRows: 2, maxRows: 6 }"
            />
          </div>
          <div>
            <div class="text-12px text-gray-500 mb-4px">{{ $t('page.operationLog.body') }}</div>
            <NInput
              :value="currentDetail.body || $t('page.operationLog.noDetail')"
              type="textarea"
              readonly
              :autosize="{ minRows: 3, maxRows: 10 }"
            />
          </div>
          <div v-if="currentDetail.error_msg">
            <div class="text-12px text-gray-500 mb-4px">{{ $t('page.operationLog.errorMsg') }}</div>
            <NInput :value="currentDetail.error_msg" type="textarea" readonly :autosize="{ minRows: 2, maxRows: 6 }" />
          </div>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
