<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NCard, NInput, NSelect, NSpace, NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import RuleDispatchModal from '@/components/business/rule-dispatch-modal.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import { fetchGetRuleDecisions } from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { formatBytes, formatCores } from '@/utils/format';
import { operateWidth } from '@/utils/operate-width';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { stateType } from '@/utils/rule-state';

defineOptions({ name: 'ResourceAnalysisRules' });

/**
 * The results of the fixed formula, apart from the forecasts of the algorithms: for every module the replicas it needs and the Pod spec it should request, worked out from the P90, P95 and
 * P99 of the real use (no forecast in it), what the module has now, which of the two sources the module follows, and how far the decision has gone (taken by a recommendation, written to the
 * cluster by the mode of the module, done by the operator). The detail of one module is its dispatch detail.
 */
const { t } = useI18n();
const r = (key: string, named?: Record<string, unknown>) => t(`page.rule.${key}`, named ?? {});

const rows = ref<Api.Rule.Row[]>([]);
const loading = ref(false);
const failure = ref('');
const search = reactive<{ keyword: string; source: Api.Rule.DecisionSource | null; state: string | null }>({
  keyword: '',
  source: null,
  state: null
});
const detailId = ref(0);
const detailShow = ref(false);

async function load() {
  loading.value = true;
  failure.value = '';
  try {
    const { data, error } = await fetchGetRuleDecisions();
    rows.value = data?.list ?? [];
    if (!data) failure.value = (error as { message?: string } | null)?.message || r('loadFailed');
  } finally {
    loading.value = false;
  }
}

const sourceOptions = computed(() =>
  (['algorithm', 'rule'] as const).map(value => ({ label: r(`source_${value}`), value }))
);
const stateOptions = computed(() =>
  [
    'not_followed',
    'observe_only',
    'unavailable',
    'pending',
    'recommended',
    'admission',
    'waiting_operator',
    'executed'
  ].map(value => ({ label: r(`state_${value}`), value }))
);

const listRows = computed(() => {
  const keyword = search.keyword.trim().toLowerCase();
  return rows.value.filter(
    row =>
      (!search.source || row.decision_source === search.source) &&
      (!search.state || row.state === search.state) &&
      (!keyword || `${row.name} ${row.namespace} ${row.workload}`.toLowerCase().includes(keyword))
  );
});

const pagination = reactive({
  page: 1,
  pageSize: getAdaptivePageSize(),
  pageSizes: getAdaptivePageSizes(),
  showSizePicker: true,
  onChange: (page: number) => {
    pagination.page = page;
  },
  onUpdatePageSize: (size: number) => {
    pagination.pageSize = size;
    pagination.page = 1;
  }
});
watch(
  () => [search.keyword, search.source, search.state],
  () => {
    pagination.page = 1;
  }
);

function openDetail(row: Api.Rule.Row) {
  detailId.value = row.module_id;
  detailShow.value = true;
}

const dash = '-';
const rule = (row: Api.Rule.Row) => row.rule;
const replicasText = (row: Api.Rule.Row) => {
  const d = rule(row);
  if (!d?.replicas_set) return dash;
  const change = d.current_replicas ? ` (${d.replicas_delta > 0 ? '+' : ''}${d.replicas_delta})` : '';
  return `${d.current_replicas || dash} → ${d.recommended_replicas}${change}`;
};
const cpuText = (row: Api.Rule.Row) => {
  const d = rule(row);
  if (!d?.cpu_set) return dash;
  return `${d.cpu_current_milli ? formatCores(d.cpu_current_milli / 1000, 3) : dash} → ${formatCores(d.cpu_recommended_milli / 1000, 3)}`;
};
const memoryText = (row: Api.Rule.Row) => {
  const d = rule(row);
  if (!d?.memory_set) return dash;
  return `${d.memory_current_bytes ? formatBytes(d.memory_current_bytes, 2) : dash} → ${formatBytes(d.memory_recommended_bytes, 2)}`;
};

const columnMap: Record<string, any> = {
  name: {
    title: r('colName'),
    key: 'name',
    minWidth: 190,
    render: (row: Api.Rule.Row) =>
      h(
        'span',
        { class: 'whitespace-nowrap', title: `${row.namespace}/${row.workload}` },
        row.enabled ? row.name : `${row.name} (${r('disabled')})`
      )
  },
  source: {
    title: r('colSource'),
    key: 'source',
    width: 120,
    render: (row: Api.Rule.Row) =>
      h(NTag, { size: 'small', bordered: false, type: row.decision_source === 'rule' ? 'info' : 'default' }, () =>
        r(`source_${row.decision_source}`)
      )
  },
  mode: {
    title: r('mode'),
    key: 'mode',
    width: 100,
    render: (row: Api.Rule.Row) => h(NTag, { size: 'small', bordered: false }, () => r(`mode_${row.mode}`))
  },
  state: {
    title: r('state'),
    key: 'state',
    width: 140,
    render: (row: Api.Rule.Row) =>
      h(NTag, { size: 'small', bordered: false, type: stateType(row.state), title: r(`stateNote_${row.state}`) }, () =>
        r(`state_${row.state}`)
      )
  },
  replicas: { title: r('colReplicas'), key: 'replicas', minWidth: 150, render: replicasText },
  cpu: { title: r('colCpu'), key: 'cpu', minWidth: 150, render: cpuText },
  memory: { title: r('colMemory'), key: 'memory', minWidth: 150, render: memoryText },
  certain: {
    title: r('colCertain'),
    key: 'certain',
    width: 110,
    render: (row: Api.Rule.Row) => {
      const d = rule(row);
      if (!d) return dash;
      return h(
        NTag,
        { size: 'small', bordered: false, type: d.certain ? 'success' : 'warning', title: d.caution || undefined },
        () => (d.certain ? r('certain') : r('uncertain'))
      );
    }
  },
  period: { title: r('colPeriod'), key: 'period', width: 90, render: (row: Api.Rule.Row) => rule(row)?.period || dash },
  checked: {
    title: r('colChecked'),
    key: 'checked',
    minWidth: 160,
    render: (row: Api.Rule.Row) => (rule(row) ? formatDateTime(rule(row)!.checked_at) : dash)
  },
  operate: {
    title: t('common.operate'),
    key: 'operate',
    width: operateWidth([r('detail')]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Rule.Row) =>
      h(NButton, { size: 'tiny', type: 'primary', onClick: () => openDetail(row) }, () => r('detail'))
  }
};
const cfg = useTableColumnConfig({
  pageCode: 'resource_analysis_rules',
  columnMap,
  defaultKeys: ['name', 'source', 'mode', 'state', 'replicas', 'cpu', 'memory', 'certain', 'checked', 'operate'],
  columnMinWidths: { operate: 70 }
});

onMounted(() => {
  cfg.initColumnConfig();
  void load();
});
</script>

<template>
  <div class="h-full flex-col gap-10px overflow-hidden">
    <NCard :bordered="false" size="small" class="rounded-16px shadow-sm">
      <div class="filter-bar">
        <NSelect
          v-model:value="search.source"
          clearable
          size="small"
          class="w-160px"
          :placeholder="r('colSource')"
          :options="sourceOptions"
        />
        <NSelect
          v-model:value="search.state"
          clearable
          size="small"
          class="w-180px"
          :placeholder="r('state')"
          :options="stateOptions"
        />
        <span class="w-260px">
          <NInput v-model:value="search.keyword" clearable size="small" :placeholder="r('keyword')" />
        </span>
        <NSpace v-if="failure" class="filter-actions" align="center">
          <NTag size="small" :bordered="false" type="warning">{{ failure }}</NTag>
          <NButton size="small" secondary @click="load">{{ r('retry') }}</NButton>
        </NSpace>
      </div>
    </NCard>
    <div class="min-h-0 flex-1 flex-col">
      <ListTablePanel
        :title="r('listTitle')"
        :help="r('listHelp')"
        :cfg="cfg"
        :loading="loading"
        :data="listRows"
        :pagination="pagination"
        :row-key="(row: any) => row.module_id"
        :remote="false"
        :empty-hint="r('empty')"
        @refresh="load"
      />
    </div>
    <RuleDispatchModal v-model:show="detailShow" :module-id="detailId" @changed="load" />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.filter-actions {
  margin-left: auto;
}
</style>
