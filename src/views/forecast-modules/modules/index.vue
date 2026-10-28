<script setup lang="tsx">
import { computed, h, nextTick, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
  NDivider,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import StatusSelect from '@/components/business/status-select.vue';
import PeriodEditor from '@/components/business/period-editor.vue';
import BatchActions from '@/components/business/batch-actions.vue';
import ListSearchCard from '@/components/business/list-search-card.vue';
import PromqlTester from '@/components/business/promql-tester.vue';
import ModuleMetrics from '@/components/business/module-metrics.vue';
import type { QueryConfig } from '@/components/business/query-test-result.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import DurationInput from '@/components/advanced/duration-input.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchModules,
  fetchBypassModule,
  fetchCreateForecastModule,
  fetchCreateModuleSource,
  fetchCreatePeriod,
  fetchDeleteForecastModule,
  fetchGetForecastModules,
  fetchGetModuleSources,
  fetchGetPeriods,
  fetchResumeModule,
  fetchUpdateForecastModule
} from '@/service/api';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { copyCell } from '@/utils/copy-cell';

const PAGE_CODE = 'forecast_module_manage';
const { t } = useI18n();
const message = useMessage();
const MIB = 1024 * 1024;
const WORKLOAD_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet'] as const;

const loading = ref(false);
const saving = ref(false);
const rows = ref<Api.Forecast.Module[]>([]);
const checkedRowKeys = ref<number[]>([]);
const editing = ref<Api.Forecast.Module>();
const visible = ref(false);

const searchParams = reactive<{ keyword: string; mode: Api.Forecast.Mode | null; enabled: 'true' | 'false' | null }>({
  keyword: '',
  mode: null,
  enabled: null
});

const modeOptions = computed(() =>
  (['observe', 'recommend', 'admission', 'auto'] as const).map(value => ({
    label: t(`page.forecast.modules.mode_${value}`),
    value
  }))
);
const replicaModeOptions = computed(() =>
  (['fixed', 'dynamic'] as const).map(value => ({ label: t(`page.forecast.modules.replicaMode_${value}`), value }))
);
const maxModeOptions = computed(() =>
  (['fixed', 'dynamic'] as const).map(value => ({ label: t(`page.forecast.modules.maxMode_${value}`), value }))
);
const kindOptions = WORKLOAD_KINDS.map(value => ({ label: value, value }));
const capacityModeOptions = computed(() =>
  (['manual', 'estimate'] as const).map(value => ({ label: t(`page.forecast.modules.capacityMode_${value}`), value }))
);
const enabledOptions = computed(() => [
  { label: t('common.enable'), value: 'true' },
  { label: t('common.disable'), value: 'false' }
]);

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
    const { data } = await fetchGetForecastModules({
      page: pagination.page,
      page_size: pagination.pageSize,
      keyword: searchParams.keyword.trim() || undefined,
      mode: searchParams.mode ?? undefined,
      enabled: searchParams.enabled === null ? undefined : searchParams.enabled === 'true'
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
  searchParams.mode = null;
  searchParams.enabled = null;
  search();
}

// ---- create / edit
function emptyForm() {
  return {
    name: '',
    description: '',
    enabled: true,
    mode: 'observe' as Api.Forecast.Mode,
    namespace: '',
    workload_kind: 'Deployment' as Api.Forecast.WorkloadKind,
    workload: '',
    service: '',
    container: '',
    lookback_hours: 720,
    horizon_minutes: 15,
    step_seconds: 0,
    window_steps: 0,
    min_points: 0,
    run_interval_minutes: 0,
    max_fill_steps: 3,
    fallback_min_history_ratio: 0.8,
    max_missing_ratio: 0.3,
    replica_mode: 'fixed' as Api.Forecast.ReplicaMode,
    capacity_mode: 'manual' as Api.Forecast.CapacityMode,
    pod_cpu_request_milli: 0,
    pod_memory_request_mib: 0,
    target_utilization: 0.7,
    ttl_seconds: 900,
    min_cpu_milli: 0,
    max_cpu_milli: 0,
    min_memory_mib: 0,
    max_memory_mib: 0,
    min_replicas: 0,
    max_replicas: 0,
    fallback_cpu_milli: 0,
    fallback_memory_mib: 0,
    fallback_replicas: 0,
    headroom_ratio: 1,
    limit_cpu_ratio: 0,
    limit_memory_ratio: 0,
    scale_up_max_step: 0,
    scale_down_max_step: 0,
    scale_up_cooldown_seconds: 0,
    scale_down_cooldown_seconds: 0,
    pod_capacity_rps: 0,
    timezone: 'UTC',
    min_score: 0,
    max_replicas_mode: 'fixed' as Api.Forecast.MaxReplicasMode,
    hard_max_replicas: 0,
    expand_step_ratio: 0.25,
    min_gpu: 0,
    max_gpu: 0,
    fallback_gpu: 0,
    oom_lookback_days: 14,
    oom_memory_uplift: 1.2,
    jvm_heap_pressure: 0.85,
    recover_cycles: 2
  };
}
const form = reactive(emptyForm());
/** The module a clone is taken from; its metric sources and fixed periods are copied once the clone exists. Algorithms are platform-wide and apply to the clone by themselves. */
const cloneSource = ref<Api.Forecast.Module>();
const periodEditor = ref<InstanceType<typeof PeriodEditor>>();
const metricsEditor = ref<InstanceType<typeof ModuleMetrics>>();
const bypassTarget = ref<Api.Forecast.Module>();
const paceFields = ['scaleUpMaxStep', 'scaleDownMaxStep', 'scaleUpCooldown', 'scaleDownCooldown'] as const;
const paceModel = {
  scaleUpMaxStep: 'scale_up_max_step',
  scaleDownMaxStep: 'scale_down_max_step',
  scaleUpCooldown: 'scale_up_cooldown_seconds',
  scaleDownCooldown: 'scale_down_cooldown_seconds'
} as const;

// ---- the preview of a metric, asked for on demand: choose the module and its metric, then the same query test dialog as the
// Metrics dataset page runs the PromQL against Prometheus (the dialog also takes a PromQL typed by hand, e.g. a log metric)
const testerVisible = ref(false);
const testerInitial = ref<Partial<QueryConfig>>({});
const pickVisible = ref(false);
const pick = reactive({ moduleId: null as number | null, key: null as string | null });
const pickSources = ref<Api.Forecast.DatasetSource[]>([]);
const moduleChoices = computed(() => rows.value.map(item => ({ label: item.name, value: item.id })));
const metricChoices = computed(() => pickSources.value.map(item => ({ label: item.name, value: item.key })));

async function loadPickSources() {
  pick.key = null;
  pickSources.value = [];
  if (!pick.moduleId) return;
  const { data } = await fetchGetModuleSources(pick.moduleId);
  pickSources.value = data || [];
  pick.key = pickSources.value[0]?.key ?? null;
}

function openPreview() {
  pick.moduleId = rows.value[0]?.id ?? null;
  pickVisible.value = true;
  loadPickSources();
}

/** The module whose workload fills the variables of the query being previewed. */
const testerModuleId = ref<number | null>(null);

/** Shows what a metric of a module returns now: its query is run at once against Prometheus, in the preview dialog. */
function showPreview(
  moduleId: number | null,
  source?: Pick<Api.Forecast.DatasetSource, 'datasource_id' | 'query' | 'level' | 'unit' | 'step_seconds'> & {
    kind: string;
  } & Partial<Pick<Api.Forecast.DatasetSource, 'query_step_seconds' | 'scale' | 'precision'>>
) {
  testerModuleId.value = moduleId;
  testerInitial.value = source
    ? {
        datasource_id: source.datasource_id,
        query: source.query,
        level: source.level,
        metric: source.kind,
        unit: source.unit,
        step_seconds: source.query_step_seconds || source.step_seconds,
        scale: source.scale,
        precision: source.precision
      }
    : {};
  pickVisible.value = false;
  testerVisible.value = true;
}

function runPreview() {
  showPreview(
    pick.moduleId,
    pickSources.value.find(item => item.key === pick.key)
  );
}

function open(row?: Api.Forecast.Module) {
  editing.value = row;
  cloneSource.value = undefined;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      ...row,
      pod_memory_request_mib: (row.pod_memory_request_bytes || 0) / MIB,
      target_utilization: row.target_utilization || 0.7,
      min_memory_mib: row.min_memory_bytes / MIB,
      max_memory_mib: row.max_memory_bytes / MIB,
      fallback_memory_mib: row.fallback_memory_bytes / MIB,
      expand_step_ratio: row.expand_step_ratio || 0.25
    });
  }
  visible.value = true;
  nextTick(() => {
    periodEditor.value?.load(row?.id);
    metricsEditor.value?.load(row?.id);
  });
}

function payloadFromForm(): Api.Forecast.ModulePayload {
  return {
    name: form.name.trim(),
    description: form.description,
    enabled: form.enabled,
    mode: form.mode,
    namespace: form.namespace.trim(),
    workload_kind: form.workload_kind,
    workload: form.workload.trim(),
    service: form.service.trim(),
    container: form.container.trim(),
    lookback_hours: form.lookback_hours,
    horizon_minutes: form.horizon_minutes,
    step_seconds: form.step_seconds,
    window_steps: form.window_steps,
    min_points: form.min_points,
    run_interval_minutes: form.run_interval_minutes,
    max_fill_steps: form.max_fill_steps,
    fallback_min_history_ratio: form.fallback_min_history_ratio,
    max_missing_ratio: form.max_missing_ratio,
    replica_mode: form.replica_mode,
    capacity_mode: form.capacity_mode,
    pod_cpu_request_milli: form.pod_cpu_request_milli,
    pod_memory_request_bytes: Math.round(form.pod_memory_request_mib * MIB),
    target_utilization: form.target_utilization,
    ttl_seconds: form.ttl_seconds,
    min_cpu_milli: form.min_cpu_milli,
    max_cpu_milli: form.max_cpu_milli,
    min_memory_bytes: Math.round(form.min_memory_mib * MIB),
    max_memory_bytes: Math.round(form.max_memory_mib * MIB),
    min_replicas: form.min_replicas,
    max_replicas: form.max_replicas,
    fallback_cpu_milli: form.fallback_cpu_milli,
    fallback_memory_bytes: Math.round(form.fallback_memory_mib * MIB),
    fallback_replicas: form.fallback_replicas,
    headroom_ratio: form.headroom_ratio,
    limit_cpu_ratio: form.limit_cpu_ratio,
    limit_memory_ratio: form.limit_memory_ratio,
    scale_up_max_step: form.scale_up_max_step,
    scale_down_max_step: form.scale_down_max_step,
    scale_up_cooldown_seconds: form.scale_up_cooldown_seconds,
    scale_down_cooldown_seconds: form.scale_down_cooldown_seconds,
    pod_capacity_rps: form.pod_capacity_rps,
    timezone: form.timezone.trim() || 'UTC',
    min_score: form.min_score,
    max_replicas_mode: form.max_replicas_mode,
    hard_max_replicas: form.hard_max_replicas,
    expand_step_ratio: form.expand_step_ratio,
    min_gpu: form.min_gpu,
    max_gpu: form.max_gpu,
    fallback_gpu: form.fallback_gpu,
    oom_lookback_days: form.oom_lookback_days,
    oom_memory_uplift: form.oom_memory_uplift,
    jvm_heap_pressure: form.jvm_heap_pressure,
    recover_cycles: form.recover_cycles
  };
}

function clone(row: Api.Forecast.Module) {
  open(row);
  editing.value = undefined;
  cloneSource.value = row;
  Object.assign(form, { name: `${row.name}-copy`, enabled: false });
  // the periods and metrics are copied from the source once the clone exists, so the editors start empty
  nextTick(() => {
    periodEditor.value?.load();
    metricsEditor.value?.load();
  });
}

async function copyConfiguration(sourceId: number, targetId: number) {
  const [sourceList, periodList] = await Promise.all([fetchGetModuleSources(sourceId), fetchGetPeriods(sourceId)]);
  // creating the sources in their original order gives them the same series keys
  for (const source of [...(sourceList.data || [])].sort((a, b) => a.id - b.id)) {
    await fetchCreateModuleSource(targetId, {
      name: source.name,
      kind: source.kind,
      resource: source.resource,
      mapping_id: source.mapping_id,
      priority: source.priority,
      weight: source.weight,
      stat: source.stat,
      basis: source.basis,
      window_hours: source.window_hours,
      threshold: source.threshold,
      enabled: source.enabled,
      remark: source.remark
    });
  }
  for (const p of periodList.data || []) {
    const { id: _id, module_id: _moduleId, ...rest } = p;
    await fetchCreatePeriod(targetId, rest);
  }
}

async function save() {
  if (!form.name.trim() || !form.namespace.trim() || !form.workload.trim()) {
    message.warning(t('page.forecast.modules.required'));
    return;
  }
  const editorProblem = metricsEditor.value?.problem() || periodEditor.value?.problem();
  if (editorProblem) {
    message.warning(editorProblem);
    return;
  }
  saving.value = true;
  try {
    const id = editing.value?.id;
    const payload = payloadFromForm();
    const { data, error } = id
      ? await fetchUpdateForecastModule(id, payload)
      : await fetchCreateForecastModule(payload);
    if (!error) {
      if (!id && cloneSource.value && data) await copyConfiguration(cloneSource.value.id, data.id);
      cloneSource.value = undefined;
      const savedId = id ?? data?.id;
      if (savedId && !(await periodEditor.value?.save(savedId))) message.warning(t('page.forecast.periods.saveFailed'));
      if (savedId && !(await metricsEditor.value?.save(savedId)))
        message.warning(t('page.forecast.periods.saveFailed'));
      visible.value = false;
      message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      await load();
    }
  } finally {
    saving.value = false;
  }
}

const batchActions = computed(() => [
  { key: 'enable', label: t('common.enable') },
  { key: 'disable', label: t('common.disable') },
  { key: 'delete', label: t('common.delete'), danger: true }
]);

async function runBatch(action: string) {
  const { data, error } = await fetchBatchModules({
    action: action as 'enable' | 'disable' | 'delete',
    ids: checkedRowKeys.value
  });
  if (error || !data) return;
  if (data.failed.length) {
    message.warning(
      t('common.batchPartial', { done: data.done, failed: data.failed.length, reason: data.failed[0].error })
    );
  } else {
    message.success(t('common.batchDone', { done: data.done }));
  }
  checkedRowKeys.value = [];
  await load();
}

async function remove(id: number) {
  const { error } = await fetchDeleteForecastModule(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await load();
  }
}

// ---- bypass
const bypassReason = ref('');

async function confirmBypass() {
  const target = bypassTarget.value;
  if (!target) return;
  if (!bypassReason.value.trim()) {
    message.warning(t('page.forecast.modules.bypassReasonRequired'));
    return;
  }
  const { error } = await fetchBypassModule(target.id, bypassReason.value.trim());
  if (!error) {
    bypassTarget.value = undefined;
    bypassReason.value = '';
    message.success(t('page.forecast.modules.bypassOn'));
    await load();
  }
}

async function resume(row: Api.Forecast.Module) {
  const { error } = await fetchResumeModule(row.id);
  if (!error) {
    message.success(t('page.forecast.modules.bypassOff'));
    await load();
  }
}

// ---- table
const columnMap: Record<string, any> = {
  __selection__: { type: 'selection', width: 42, minWidth: 42 },
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: {
    title: t('page.forecast.modules.name'),
    key: 'name',
    width: 170,
    resizable: true,
    render: (row: Api.Forecast.Module) => copyCell(row.name)
  },
  namespace: { title: t('page.forecast.modules.namespace'), key: 'namespace', width: 140, resizable: true },
  workload: {
    title: t('page.forecast.modules.workload'),
    key: 'workload',
    width: 160,
    resizable: true,
    render: (row: Api.Forecast.Module) => copyCell(row.workload)
  },
  workload_kind: { title: t('page.forecast.modules.workloadKind'), key: 'workload_kind', width: 130, resizable: true },
  mode: {
    title: t('page.forecast.modules.mode'),
    key: 'mode',
    width: 120,
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(
        NTag,
        { type: row.mode === 'observe' ? 'default' : 'info', bordered: false },
        { default: () => t(`page.forecast.modules.mode_${row.mode}`) }
      )
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 90,
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(
        NTag,
        { type: row.enabled ? 'success' : 'default', bordered: false },
        { default: () => (row.enabled ? t('common.enable') : t('common.disable')) }
      )
  },
  bypass: {
    title: t('page.forecast.modules.bypass'),
    key: 'bypass',
    width: 110,
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      row.bypass
        ? h(
            NTag,
            { type: 'warning', bordered: false, title: row.bypass_reason },
            { default: () => t('page.forecast.modules.bypassing') }
          )
        : '-'
  },
  status: {
    title: t('page.forecast.modules.runState'),
    key: 'status',
    width: 200,
    render: (row: Api.Forecast.Module) => {
      const tags: ReturnType<typeof h>[] = [];
      if (row.bypass)
        tags.push(
          h(NTag, { type: 'warning', bordered: false, size: 'small', title: row.bypass_reason }, () =>
            t('page.forecast.modules.bypassing')
          )
        );
      if (row.summary?.degraded)
        tags.push(
          h(NTag, { type: 'error', bordered: false, size: 'small', title: row.summary.degrade_reasons }, () =>
            t('page.forecast.modules.degraded')
          )
        );
      if (row.summary?.oom_floor)
        tags.push(
          h(NTag, { type: 'error', bordered: false, size: 'small' }, () => t('page.forecast.recommendations.oomFloor'))
        );
      if (row.summary && row.summary.consecutive_failures > 0)
        tags.push(
          h(NTag, { type: 'warning', bordered: false, size: 'small', title: row.summary.last_error }, () =>
            t('page.forecast.modules.failing', { count: row.summary!.consecutive_failures })
          )
        );
      return tags.length ? h(NSpace, { size: 4, wrap: true }, () => tags) : '-';
    }
  },
  links: {
    title: t('page.forecast.modules.links'),
    key: 'links',
    width: 300,
    ellipsis: { tooltip: true },
    render: (row: Api.Forecast.Module) =>
      row.summary
        ? t('page.forecast.modules.linksText', {
            sources: row.sources?.filter(item => item.enabled).length ?? 0,
            total: row.sources?.length ?? 0,
            version: row.summary.latest_version ? `v${row.summary.latest_version}` : '-'
          })
        : '-'
  },
  created_at: {
    title: t('common.createTime'),
    key: 'created_at',
    width: 170,
    align: 'center',
    render: (row: Api.Forecast.Module) => formatDateTime(row.created_at)
  },
  actions: {
    title: t('common.operate'),
    key: 'actions',
    width: 180,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error', ghost: true }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        ),
        h(NButton, { size: 'tiny', onClick: () => clone(row) }, () => t('page.forecast.modules.clone')),
        row.bypass
          ? h(NButton, { size: 'tiny', type: 'warning', ghost: true, onClick: () => resume(row) }, () =>
              t('page.forecast.modules.resume')
            )
          : h(NButton, { size: 'tiny', onClick: () => (bypassTarget.value = row) }, () =>
              t('page.forecast.modules.bypass')
            )
      ])
  }
};
const defaultColumnKeys = [
  '__selection__',
  'name',
  'workload_kind',
  'workload',
  'mode',
  'enabled',
  'status',
  'actions'
];

const cfg = useTableColumnConfig({ pageCode: PAGE_CODE, columnMap, defaultKeys: defaultColumnKeys });

const modalTitle = computed(() =>
  editing.value ? t('page.forecast.modules.editTitle') : t('page.forecast.modules.addTitle')
);

onMounted(() => {
  cfg.initColumnConfig();
  load();
});
</script>

<template>
  <div class="h-full flex-col overflow-hidden gap-12px">
    <ListSearchCard :model="searchParams" :action-span="6" @search="search" @reset="resetSearch">
      <NFormItemGi :span="8" :label="t('page.datasource.connections.keyword')">
        <NInput
          v-model:value="searchParams.keyword"
          clearable
          :placeholder="t('page.forecast.modules.keywordPlaceholder')"
          @keyup.enter="search"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.forecast.modules.mode')"
      >
        <NSelect
          v-model:value="searchParams.mode"
          clearable
          :placeholder="t('common.selectField', { field: t('page.forecast.modules.mode') })"
          :options="modeOptions"
        />
      </NFormItemGi>
      <NFormItemGi
        class="list-search-select-field list-search-short-field"
        :span="5"
        :label="t('page.datasource.connections.enabled')"
      >
        <NSelect
          v-model:value="searchParams.enabled"
          clearable
          :placeholder="t('common.selectField', { field: t('page.datasource.connections.enabled') })"
          :options="enabledOptions"
        />
      </NFormItemGi>
    </ListSearchCard>

    <ListTablePanel
      v-model:checked-row-keys="checkedRowKeys"
      :title="t('page.forecast.modules.title')"
      :help="t('page.forecast.modules.help')"
      :cfg="cfg"
      :loading="loading"
      :data="rows"
      :pagination="pagination"
      :row-key="(row: any) => row.id"
      show-add
      @add="open()"
      @refresh="load"
    >
      <template #suffix>
        <NButton size="small" @click="openPreview">{{ t('page.forecast.modules.previewMetric') }}</NButton>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>

    <!-- create / edit -->
    <NModal v-model:show="visible" preset="card" :title="modalTitle" class="edit-modal-wide">
      <div class="max-h-70vh overflow-y-auto pr-8px">
        <div class="mb-8px font-medium">{{ t('page.forecast.modules.sectionBasic') }}</div>
        <NForm :model="form" label-placement="top">
          <NFormItem :label="t('page.forecast.modules.name')">
            <NInput
              v-model:value="form.name"
              :placeholder="t('common.inputField', { field: t('page.forecast.modules.name') })"
            />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.mode')">
            <NSelect v-model:value="form.mode" :options="modeOptions" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.namespace')">
            <NInput
              v-model:value="form.namespace"
              :placeholder="t('common.inputField', { field: t('page.forecast.modules.namespace') })"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.workloadKind') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.workloadKindHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.workload_kind" :options="kindOptions" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.workload')">
            <NInput
              v-model:value="form.workload"
              :placeholder="t('common.inputField', { field: t('page.forecast.modules.workload') })"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.service') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.queryVariablesHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInput v-model:value="form.service" :placeholder="t('page.forecast.modules.optional')" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.container') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.queryVariablesHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInput v-model:value="form.container" :placeholder="t('page.forecast.modules.optional')" />
          </NFormItem>
          <NFormItem :label="t('page.datasource.connections.enabled')">
            <StatusSelect v-model:value="form.enabled" />
          </NFormItem>
          <NFormItem :label="t('common.remark')">
            <NInput
              v-model:value="form.description"
              :placeholder="t('common.inputField', { field: t('common.remark') })"
            />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.modules.sectionData') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.dataHint') }}</div>
          </IconTooltip>
        </div>
        <NForm :model="form" label-placement="top">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.stepSeconds') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.stepSecondsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <DurationInput
              v-model="form.step_seconds"
              unit="seconds"
              :min="15"
              :max="86400"
              :presets="[300, 900, 3600, 86400]"
              :zero-label="t('page.forecast.modules.stepFollowSource')"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.lookbackHours') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.lookbackHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <DurationInput
              v-model="form.lookback_hours"
              unit="hours"
              :min="1"
              :max="4320"
              :presets="[86400, 604800, 2592000]"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.horizonMinutes') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.horizonHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <DurationInput
              v-model="form.horizon_minutes"
              unit="minutes"
              :min="1"
              :max="1440"
              :presets="[300, 900, 3600, 86400]"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.windowSteps') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.windowStepsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.window_steps" :min="0" :max="1000000" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.minPoints') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.minPointsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.min_points" :min="0" :max="100000" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.runInterval') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.runIntervalHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <DurationInput
              v-model="form.run_interval_minutes"
              unit="minutes"
              :min="1"
              :max="43200"
              :presets="[300, 900, 3600, 86400]"
              :zero-label="t('page.forecast.modules.runEveryCycle')"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.maxFillSteps') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.maxFillStepsHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.max_fill_steps" :min="0" :max="60" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.fallbackMinHistory') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.fallbackMinHistoryHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber
              v-model:value="form.fallback_min_history_ratio"
              :min="0.05"
              :max="1"
              :step="0.05"
              class="w-full"
            />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.maxMissingRatio') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.maxMissingRatioHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.max_missing_ratio" :min="0.01" :max="0.9" :step="0.05" class="w-full" />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px font-medium">{{ t('page.forecast.modules.sectionApply') }}</div>
        <NForm :model="form" label-placement="top">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.ttlSeconds') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.ttlHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.ttl_seconds" :min="30" :max="86400" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.minScore') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.minScoreHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.min_score" :min="0" :max="100" class="w-full" />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px font-medium">{{ t('page.forecast.modules.sectionReplicas') }}</div>
        <NForm :model="form" label-placement="top">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.replicaMode') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.replicaModeHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.replica_mode" :options="replicaModeOptions" />
          </NFormItem>
          <template v-if="form.replica_mode === 'dynamic'">
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.capacityMode') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.capacityModeHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.capacity_mode" :options="capacityModeOptions" />
            </NFormItem>
            <NFormItem :label="t('page.forecast.modules.podCpuRequest')">
              <NInputNumber v-model:value="form.pod_cpu_request_milli" :min="0" class="w-full" />
            </NFormItem>
            <NFormItem :label="t('page.forecast.modules.podMemoryRequest')">
              <NInputNumber v-model:value="form.pod_memory_request_mib" :min="0" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.targetUtilization') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.targetUtilizationHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber v-model:value="form.target_utilization" :min="0.1" :max="1" :step="0.05" class="w-full" />
            </NFormItem>
          </template>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.minReplicas') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.minReplicasHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.min_replicas" :min="0" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.maxReplicas') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.maxReplicasHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.max_replicas" :min="0" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.fallbackReplicas') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.fallbackReplicasHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.fallback_replicas" :min="0" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.recoverCycles') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.recoverCyclesHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.recover_cycles" :min="1" :max="20" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.maxReplicasMode') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.maxReplicasModeHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NSelect v-model:value="form.max_replicas_mode" :options="maxModeOptions" />
          </NFormItem>
          <template v-if="form.max_replicas_mode === 'dynamic'">
            <NFormItem :label="t('page.forecast.modules.hardMaxReplicas')">
              <NInputNumber v-model:value="form.hard_max_replicas" :min="0" :precision="0" class="w-full" />
            </NFormItem>
            <NFormItem :label="t('page.forecast.modules.expandStepRatio')">
              <NInputNumber v-model:value="form.expand_step_ratio" :min="0.01" :max="5" :step="0.05" class="w-full" />
            </NFormItem>
          </template>
        </NForm>

        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.modules.sectionFallback') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.fallbackHint') }}</div>
          </IconTooltip>
        </div>
        <NForm :model="form" label-placement="top">
          <NFormItem :label="t('page.forecast.modules.fallbackCpu')">
            <NInputNumber v-model:value="form.fallback_cpu_milli" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.fallbackMemory')">
            <NInputNumber v-model:value="form.fallback_memory_mib" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.fallbackGpu')">
            <NInputNumber v-model:value="form.fallback_gpu" :min="0" :precision="0" class="w-full" />
          </NFormItem>
        </NForm>

        <NDivider class="!my-18px" />
        <div class="mb-8px flex items-center gap-6px font-medium">
          {{ t('page.forecast.moduleMetrics.title') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-420px leading-22px">{{ t('page.forecast.moduleMetrics.rules') }}</div>
          </IconTooltip>
        </div>
        <ModuleMetrics ref="metricsEditor" @preview="source => showPreview(editing?.id ?? null, source)" />

        <NDivider class="!my-18px" />
        <div class="mb-8px flex items-center gap-6px font-medium">
          {{ t('page.forecast.periods.title') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-420px leading-22px">{{ t('page.forecast.periods.rules') }}</div>
          </IconTooltip>
        </div>
        <PeriodEditor ref="periodEditor" />

        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.modules.sectionPace') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.paceHint') }}</div>
          </IconTooltip>
        </div>
        <NForm :model="form" label-placement="top">
          <NFormItem v-for="key in paceFields" :key="key">
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t(`page.forecast.modules.${key}`) }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t(`page.forecast.modules.${key}Hint`) }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form[paceModel[key]]" :min="0" :precision="0" class="w-full" />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px flex items-center gap-6px font-medium">
          {{ t('page.forecast.modules.sectionProtection') }}
          <IconTooltip icon="mdi-help-circle" placement="top">
            <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.protectionHint') }}</div>
          </IconTooltip>
        </div>
        <NForm :model="form" label-placement="top">
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.oomLookbackDays') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.oomLookbackDaysHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.oom_lookback_days" :min="1" :max="180" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.oomMemoryUplift') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.oomMemoryUpliftHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.oom_memory_uplift" :min="1" :max="3" :step="0.05" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.jvmHeapPressure') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.jvmHeapPressureHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.jvm_heap_pressure" :min="0" :max="1" :step="0.05" class="w-full" />
          </NFormItem>
        </NForm>

        <div class="mb-8px mt-12px font-medium">{{ t('page.forecast.modules.sectionSafety') }}</div>
        <NForm :model="form" label-placement="top">
          <NFormItem :label="t('page.forecast.modules.minCpu')">
            <NInputNumber v-model:value="form.min_cpu_milli" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.maxCpu')">
            <NInputNumber v-model:value="form.max_cpu_milli" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.minMemory')">
            <NInputNumber v-model:value="form.min_memory_mib" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.maxMemory')">
            <NInputNumber v-model:value="form.max_memory_mib" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.minGpu')">
            <NInputNumber v-model:value="form.min_gpu" :min="0" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.maxGpu')">
            <NInputNumber v-model:value="form.max_gpu" :min="0" :precision="0" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.headroom') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.headroomHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.headroom_ratio" :min="1" :max="10" :step="0.05" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.limitCpuRatio') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.limitRatioHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.limit_cpu_ratio" :min="0" :max="10" :step="0.1" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.limitMemoryRatio') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.limitRatioHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.limit_memory_ratio" :min="0" :max="10" :step="0.1" class="w-full" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.podCapacity') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.podCapacityHint') }}</div>
                </IconTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.pod_capacity_rps" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.timezone')">
            <NInput v-model:value="form.timezone" placeholder="UTC / Asia/Shanghai" />
          </NFormItem>
        </NForm>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="visible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="saving" @click="save">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>
    <PromqlTester v-model:show="testerVisible" :initial="testerInitial" :module-id="testerModuleId" auto-run />
    <NModal
      v-model:show="pickVisible"
      preset="card"
      :title="t('page.forecast.modules.previewMetric')"
      class="w-480px max-w-95vw"
    >
      <NForm label-placement="top">
        <NFormItem>
          <template #label>
            <span class="inline-flex items-center gap-4px">
              {{ t('page.forecast.modules.name') }}
              <IconTooltip icon="mdi-help-circle" placement="top">
                <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.metricsPreviewHelp') }}</div>
              </IconTooltip>
            </span>
          </template>
          <NSelect v-model:value="pick.moduleId" filterable :options="moduleChoices" @update:value="loadPickSources" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.metricOf')">
          <NSelect v-model:value="pick.key" clearable filterable :options="metricChoices" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="pickVisible = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="runPreview">{{ t('page.forecast.modules.previewMetric') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- bypass reason -->
    <NModal
      :show="Boolean(bypassTarget)"
      preset="card"
      :title="t('page.forecast.modules.bypassTitle')"
      class="w-520px max-w-90vw"
      @update:show="value => !value && (bypassTarget = undefined)"
    >
      <div class="mb-8px text-13px opacity-80">{{ t('page.forecast.modules.bypassHint') }}</div>
      <NInput v-model:value="bypassReason" type="textarea" :placeholder="t('page.forecast.modules.bypassReason')" />
      <template #footer>
        <NSpace justify="end">
          <NButton @click="bypassTarget = undefined">{{ t('common.cancel') }}</NButton>
          <NButton type="warning" @click="confirmBypass">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- step result -->
  </div>
</template>

<style scoped></style>
