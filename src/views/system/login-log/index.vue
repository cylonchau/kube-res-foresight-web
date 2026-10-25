<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { fetchGetLoginLogs } from '@/service/api/system';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { useTableSort } from '@/hooks/business/use-table-sort';

defineOptions({ name: 'SystemLoginLog' });

const { t } = useI18n();
const pageKey = 'system_login_log';
const rows = ref<Api.System.LoginLog[]>([]);
const loading = ref(false);

const search = reactive({
  username: '',
  clientIp: '',
  result: null as string | null,
  reason: null as string | null,
  method: null as string | null,
  range: null as [number, number] | null
});

const resultOptions = computed(() => [
  { label: t('page.loginLog.resultSuccess'), value: 'success' },
  { label: t('page.loginLog.resultFailed'), value: 'failed' }
]);
const reasonKeys = ['invalid_credentials', 'captcha_required', 'user_disabled', 'otp_invalid', 'ok'];
const reasonOptions = computed(() => reasonKeys.map(key => ({ label: t(`page.loginLog.reasons.${key}`), value: key })));
const methodOptions = computed(() =>
  ['password', 'ldap', 'otp'].map(key => ({ label: t(`page.loginLog.methods.${key}`), value: key }))
);

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

const { handleSorterChange, sortParams, resetSort } = useTableSort(() => {
  pagination.page = 1;
  load();
});

function formatQueryTime(ms: number, endOfDay: boolean) {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

async function load() {
  loading.value = true;
  const { data } = await fetchGetLoginLogs({
    page: pagination.page,
    page_size: pagination.pageSize,
    username: search.username || undefined,
    client_ip: search.clientIp || undefined,
    result: search.result || undefined,
    reason: search.reason || undefined,
    method: search.method || undefined,
    start_time: search.range ? formatQueryTime(search.range[0], false) : undefined,
    end_time: search.range ? formatQueryTime(search.range[1], true) : undefined,
    ...sortParams()
  });
  loading.value = false;
  if (data) {
    rows.value = data.list || [];
    pagination.itemCount = data.total || 0;
  }
}

function resetSearch() {
  Object.assign(search, { username: '', clientIp: '', result: null, reason: null, method: null, range: null });
  pagination.page = 1;
  resetSort();
  load();
}

const columnMap: Record<string, any> = {
  created_at: {
    title: t('page.loginLog.columns.createdAt'),
    key: 'created_at',
    width: 170,
    resizable: true,
    align: 'center',
    sorter: true,
    render: (row: Api.System.LoginLog) => formatDateTime(row.created_at)
  },
  username: {
    title: t('page.loginLog.columns.username'),
    key: 'username',
    width: 150,
    resizable: true,
    align: 'center',
    sorter: true
  },
  success: {
    title: t('page.loginLog.columns.result'),
    key: 'success',
    width: 100,
    resizable: true,
    align: 'center',
    sorter: true,
    render: (row: Api.System.LoginLog) =>
      h(NTag, { type: row.success ? 'success' : 'error', size: 'small', bordered: false }, () =>
        t(row.success ? 'page.loginLog.resultSuccess' : 'page.loginLog.resultFailed')
      )
  },
  reason: {
    title: t('page.loginLog.columns.reason'),
    key: 'reason',
    width: 170,
    resizable: true,
    align: 'center',
    sorter: true,
    render: (row: Api.System.LoginLog) => (row.reason ? t(`page.loginLog.reasons.${row.reason}`, row.reason) : '-')
  },
  method: {
    title: t('page.loginLog.columns.method'),
    key: 'method',
    width: 110,
    resizable: true,
    align: 'center',
    sorter: true,
    render: (row: Api.System.LoginLog) => (row.method ? t(`page.loginLog.methods.${row.method}`, row.method) : '-')
  },
  client_ip: {
    title: t('page.loginLog.columns.clientIp'),
    key: 'client_ip',
    width: 150,
    resizable: true,
    align: 'center',
    sorter: true
  },
  user_agent: {
    title: t('page.loginLog.columns.userAgent'),
    key: 'user_agent',
    width: 280,
    resizable: true,
    align: 'left',
    ellipsis: { tooltip: true },
    render: (row: Api.System.LoginLog) => row.user_agent || '-'
  }
};

const defaultKeys = ['created_at', 'username', 'success', 'reason', 'client_ip'];

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
              <NFormItemGi :span="4" :label="$t('page.loginLog.columns.username')" path="username">
                <NInput
                  v-model:value="search.username"
                  clearable
                  :placeholder="$t('common.inputField', { field: $t('page.loginLog.columns.username') })"
                  @keyup.enter="load"
                />
              </NFormItemGi>
              <NFormItemGi :span="4" :label="$t('page.loginLog.columns.clientIp')" path="clientIp">
                <NInput
                  v-model:value="search.clientIp"
                  clearable
                  :placeholder="$t('common.inputField', { field: $t('page.loginLog.columns.clientIp') })"
                  @keyup.enter="load"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="3"
                :label="$t('page.loginLog.columns.result')"
                path="result"
              >
                <NSelect
                  v-model:value="search.result"
                  clearable
                  :options="resultOptions"
                  :placeholder="$t('common.selectField', { field: $t('page.loginLog.columns.result') })"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="3"
                :label="$t('page.loginLog.columns.reason')"
                path="reason"
              >
                <NSelect
                  v-model:value="search.reason"
                  clearable
                  :options="reasonOptions"
                  :placeholder="$t('common.selectField', { field: $t('page.loginLog.columns.reason') })"
                />
              </NFormItemGi>
              <NFormItemGi
                class="list-search-select-field list-search-short-field"
                :span="3"
                :label="$t('page.loginLog.columns.method')"
                path="method"
              >
                <NSelect
                  v-model:value="search.method"
                  clearable
                  :options="methodOptions"
                  :placeholder="$t('common.selectField', { field: $t('page.loginLog.columns.method') })"
                />
              </NFormItemGi>
              <NFormItemGi :span="4" :label="$t('page.loginLog.dateRange')" path="range">
                <NDatePicker
                  v-model:value="search.range"
                  type="daterange"
                  clearable
                  class="w-full"
                  :placeholder="$t('common.selectField', { field: $t('page.loginLog.dateRange') })"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="3">
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
              {{ $t('page.loginLog.title') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ $t('page.loginLog.help') }}</div>
              </IconTooltip>
            </div>
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
            @update:sorter="handleSorterChange"
            @unstable-column-resize="handleColumnWidthUpdate"
          />
        </div>
      </div>
    </NCard>
  </div>
</template>
