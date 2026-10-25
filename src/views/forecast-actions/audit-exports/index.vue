<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NFormItemGi,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import { useForecastModules, windowStart, useWindowOptions } from '@/hooks/business/use-forecast-modules';
import { usePagedList } from '@/hooks/business/use-paged-list';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { downloadAuditExport, fetchGetOperationLogs } from '@/service/api';
import { formatDateTime } from '@/utils/date';

defineOptions({ name: 'ForecastActionsAuditExports' });

type ExportKind = Parameters<typeof downloadAuditExport>[0]['kind'];
const KINDS: ExportKind[] = ['recommendations', 'fallbacks', 'executions', 'evaluations', 'predictions'];

const { t } = useI18n();
const message = useMessage();
const { moduleOptions, loadModules } = useForecastModules();
const hoursOptions = useWindowOptions();

// ---- the page lists the exports that were made: they are entered in the operation log with their scope
const search = reactive({ hours: null as number | null });

const history = usePagedList<Api.System.OperationLog>(async (page, pageSize) => {
  const { data } = await fetchGetOperationLogs({
    keyword: 'audit/export',
    page,
    page_size: pageSize,
    start_time: windowStart(search.hours)
  });
  return data;
});

function resetSearch() {
  search.hours = null;
  history.search();
}

const columnMap: Record<string, any> = {
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    render: (row: Api.System.OperationLog) => formatDateTime(row.created_at)
  },
  username: { title: t('page.forecast.auditExports.user'), key: 'username', width: 140, resizable: true },
  scope: {
    title: t('page.forecast.auditExports.scope'),
    key: 'scope',
    minWidth: 280,
    ellipsis: { tooltip: true },
    render: (row: Api.System.OperationLog) => row.body || row.params
  },
  client_ip: { title: 'IP', key: 'client_ip', width: 140 },
  status_code: {
    title: t('page.forecast.recommendations.result'),
    key: 'status_code',
    width: 100,
    align: 'center',
    render: (row: Api.System.OperationLog) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.status_code === 200 ? 'success' : 'error' },
        () => row.status_code
      )
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'forecast_audit_exports',
  columnMap,
  defaultKeys: ['created_at', 'username', 'scope', 'client_ip', 'status_code']
});

// ---- the export dialog: what to export and over which range
const visible = ref(false);
const running = ref(false);
const form = reactive({
  kind: 'recommendations' as ExportKind,
  moduleId: null as number | null,
  hours: (24 * 7) as number | null
});
const kindOptions = computed(() => KINDS.map(kind => ({ kind, label: t(`page.forecast.auditExports.kind_${kind}`) })));

function openExport() {
  Object.assign(form, { kind: 'recommendations', moduleId: null, hours: 24 * 7 });
  visible.value = true;
}

async function runExport() {
  running.value = true;
  try {
    await downloadAuditExport({
      kind: form.kind,
      module_id: form.moduleId ?? undefined,
      from: windowStart(form.hours)
    });
    message.success(t('page.forecast.auditExports.done'));
    visible.value = false;
    history.search();
  } catch (error) {
    message.error(String((error as Error).message || error));
  } finally {
    running.value = false;
  }
}

onMounted(async () => {
  cfg.initColumnConfig();
  await loadModules();
  history.search();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="search" :action-span="12" @search="history.search" @reset="resetSearch">
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="6"
        :label="t('page.forecast.auditExports.exportedWithin')"
      >
        <NSelect v-model:value="search.hours" clearable :options="hoursOptions" />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      :title="t('page.forecast.auditExports.historyTitle')"
      :help="`${t('page.forecast.auditExports.historyHelp')} ${t('page.forecast.auditExports.help')}`"
      :cfg="cfg"
      :loading="history.loading.value"
      :data="history.rows.value"
      :pagination="history.pagination"
      :empty-hint="t('page.forecast.auditExports.historyEmpty')"
      @refresh="history.reload"
    >
      <template #suffix>
        <NButton size="small" type="primary" @click="openExport">
          {{ t('page.forecast.recommendations.export') }}
        </NButton>
      </template>
    </ListTablePanel>

    <NModal
      v-model:show="visible"
      preset="card"
      :title="t('page.forecast.auditExports.exportTitle')"
      class="w-600px max-w-95vw"
    >
      <NForm :model="form" label-placement="top" :style="{ display: 'block' }">
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.forecast.auditExports.kind') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-360px leading-22px">{{ t('page.forecast.auditExports.help') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NRadioGroup v-model:value="form.kind" class="w-full">
            <NSpace vertical :size="8">
              <NRadio v-for="item in kindOptions" :key="item.kind" :value="item.kind">
                <span class="font-medium">{{ item.label }}</span>
                <span class="ml-8px text-12px opacity-65">
                  {{ t(`page.forecast.auditExports.content_${item.kind}`) }}
                </span>
              </NRadio>
            </NSpace>
          </NRadioGroup>
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.name')">
          <NSelect
            v-model:value="form.moduleId"
            filterable
            clearable
            :options="moduleOptions"
            :placeholder="t('page.forecast.auditExports.allModules')"
          />
        </NFormItem>
        <NFormItem :label="t('page.forecast.evaluation.range')">
          <NSelect v-model:value="form.hours" clearable :options="hoursOptions" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="running" @click="runExport">
            {{ t('page.forecast.recommendations.export') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
