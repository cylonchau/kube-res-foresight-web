<script setup lang="tsx">
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NCode,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDatePicker,
  NDropdown,
  NForm,
  NFormItem,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ExpandableDataTable from '@/components/advanced/expandable-data-table.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import DurationInput from '@/components/advanced/duration-input.vue';
import { forecastSources } from '@/hooks/business/use-forecast-modules';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBacktestModule,
  fetchBypassModule,
  fetchCollectModule,
  fetchCreateForecastModule,
  fetchCreateModuleSource,
  fetchCreatePeriod,
  fetchDeleteForecastModule,
  fetchDeletePeriod,
  fetchEvaluateModule,
  fetchGetForecastModules,
  fetchGetModuleSources,
  fetchGetPeriods,
  fetchPredictModule,
  fetchRecommendModule,
  fetchResumeModule,
  fetchScoreModule,
  fetchUpdateForecastModule,
  fetchUpdatePeriod
} from '@/service/api';
import RecommendationExplain from '@/components/business/recommendation-explain.vue';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';

const PAGE_CODE = 'forecast_module_manage';
const { t } = useI18n();
const router = useRouter();
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
const bypassTarget = ref<Api.Forecast.Module>();
const paceFields = ['scaleUpMaxStep', 'scaleDownMaxStep', 'scaleUpCooldown', 'scaleDownCooldown'] as const;
const paceModel = {
  scaleUpMaxStep: 'scale_up_max_step',
  scaleDownMaxStep: 'scale_down_max_step',
  scaleUpCooldown: 'scale_up_cooldown_seconds',
  scaleDownCooldown: 'scale_down_cooldown_seconds'
} as const;

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
      visible.value = false;
      message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  const { error } = await fetchDeleteForecastModule(id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await load();
  }
}

// ---- pipeline steps and their results
const resultVisible = ref(false);
const resultTitle = ref('');
const resultDetail = ref<string | null>(null);
const resultJson = ref('');
const running = ref<number>();

async function runStep(row: Api.Forecast.Module, step: string) {
  running.value = row.id;
  try {
    let result: { data: unknown; error: unknown } | undefined;
    switch (step) {
      case 'collect':
        result = await fetchCollectModule(row.id);
        break;
      case 'predict':
        result = await fetchPredictModule(row.id);
        break;
      case 'evaluate':
        result = await fetchEvaluateModule(row.id);
        break;
      case 'recommend':
        result = await fetchRecommendModule(row.id);
        break;
      case 'backtest': {
        const runs: unknown[] = [];
        for (const source of forecastSources(row)) {
          const { data, error } = await fetchBacktestModule(row.id, { metric: source.key });
          if (!error && data) runs.push({ metric: source.key, runs: data });
        }
        result = { data: runs, error: null };
        break;
      }
      case 'score':
        result = await fetchScoreModule(row.id);
        break;
      default:
        return;
    }
    if (result && !result.error) {
      resultTitle.value = `${row.name} - ${t(`page.forecast.modules.step_${step}`)}`;
      resultJson.value = JSON.stringify(result.data, null, 2);
      const recommended = step === 'recommend' ? (result.data as { detail?: unknown } | null)?.detail : undefined;
      resultDetail.value = recommended ? JSON.stringify(recommended) : null;
      resultVisible.value = true;
    }
  } finally {
    running.value = undefined;
  }
}

/** Every step works on the module's own sources with every enabled algorithm: nothing has to be bound first. */
function stepOptions(row: Api.Forecast.Module) {
  return [
    { label: t('page.forecast.modules.step_collect'), key: 'collect' },
    { label: t('page.forecast.modules.step_predict'), key: 'predict' },
    { label: t('page.forecast.modules.step_backtest'), key: 'backtest' },
    { label: t('page.forecast.modules.step_score'), key: 'score' },
    { label: t('page.forecast.modules.step_evaluate'), key: 'evaluate' },
    { label: t('page.forecast.modules.step_recommend'), key: 'recommend', disabled: row.mode === 'observe' }
  ];
}

/** Everything that is not used every day sits in one menu, so the operate column stays one row wide. */
function moreOptions(row: Api.Forecast.Module) {
  return [
    { label: t('page.forecast.modules.clone'), key: 'clone' },
    { label: t('page.forecast.modules.periods'), key: 'periods' },
    row.bypass
      ? { label: t('page.forecast.modules.resume'), key: 'resume' }
      : { label: t('page.forecast.modules.bypass'), key: 'bypass' },
    { type: 'divider', key: 'divider' },
    { label: t('common.delete'), key: 'delete' }
  ];
}

function moreAction(row: Api.Forecast.Module, key: string) {
  switch (key) {
    case 'clone':
      clone(row);
      break;
    case 'periods':
      openPeriods(row);
      break;
    case 'resume':
      resume(row);
      break;
    case 'bypass':
      bypassTarget.value = row;
      break;
    case 'delete':
      window.$dialog?.warning({
        title: t('common.delete'),
        content: t('common.confirmDelete'),
        positiveText: t('common.confirm'),
        negativeText: t('common.cancel'),
        onPositiveClick: () => remove(row.id)
      });
      break;
    default:
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

// ---- fixed periods
const periodModule = ref<Api.Forecast.Module>();
const periods = ref<Api.Forecast.Period[]>([]);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function emptyPeriod() {
  return {
    id: undefined as number | undefined,
    name: '',
    enabled: true,
    priority: 0,
    kind: 'weekly' as 'weekly' | 'absolute',
    weekdays: [1, 2, 3, 4, 5] as number[],
    start: '09:00',
    end: '18:00',
    abs_start: null as number | null,
    abs_end: null as number | null,
    cpu_milli: 0,
    memory_mib: 0,
    replicas: 0
  };
}
const periodForm = reactive(emptyPeriod());

function toMinute(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

function fromMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

async function loadPeriods() {
  if (!periodModule.value) return;
  const { data } = await fetchGetPeriods(periodModule.value.id);
  periods.value = data || [];
}

async function openPeriods(row: Api.Forecast.Module) {
  periodModule.value = row;
  Object.assign(periodForm, emptyPeriod());
  await loadPeriods();
}

function editPeriod(row: Api.Forecast.Period) {
  const absolute = Boolean(row.abs_start);
  Object.assign(periodForm, {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    kind: absolute ? 'absolute' : 'weekly',
    weekdays: WEEKDAYS.filter(day => row.weekdays & (1 << day)),
    start: fromMinute(row.start_minute),
    end: fromMinute(row.end_minute),
    abs_start: row.abs_start ? Date.parse(row.abs_start) : null,
    abs_end: row.abs_end ? Date.parse(row.abs_end) : null,
    cpu_milli: row.cpu_milli,
    memory_mib: row.memory_bytes / MIB,
    replicas: row.replicas
  });
}

async function savePeriod() {
  const module = periodModule.value;
  if (!module) return;
  const payload: Api.Forecast.PeriodPayload = {
    name: periodForm.name.trim(),
    enabled: periodForm.enabled,
    priority: periodForm.priority,
    cpu_milli: periodForm.cpu_milli,
    memory_bytes: Math.round(periodForm.memory_mib * MIB),
    replicas: periodForm.replicas
  };
  if (periodForm.kind === 'weekly') {
    const start = toMinute(periodForm.start);
    const end = toMinute(periodForm.end);
    if (start === null || end === null) {
      message.warning(t('page.forecast.modules.timeInvalid'));
      return;
    }
    payload.weekdays = periodForm.weekdays.reduce((mask, day) => mask | (1 << day), 0);
    payload.start_minute = start;
    payload.end_minute = end;
  } else {
    if (!periodForm.abs_start || !periodForm.abs_end) {
      message.warning(t('page.forecast.modules.timeInvalid'));
      return;
    }
    payload.abs_start = new Date(periodForm.abs_start).toISOString();
    payload.abs_end = new Date(periodForm.abs_end).toISOString();
  }
  const { error } = periodForm.id
    ? await fetchUpdatePeriod(module.id, periodForm.id, payload)
    : await fetchCreatePeriod(module.id, payload);
  if (!error) {
    message.success(periodForm.id ? t('common.modifySuccess') : t('common.addSuccess'));
    Object.assign(periodForm, emptyPeriod());
    await loadPeriods();
  }
}

async function removePeriod(id: number) {
  if (!periodModule.value) return;
  const { error } = await fetchDeletePeriod(periodModule.value.id, id);
  if (!error) {
    message.success(t('common.deleteSuccess'));
    await loadPeriods();
  }
}

const periodColumns = computed(() => [
  { title: t('page.forecast.modules.name'), key: 'name', width: 140 },
  { title: t('page.forecast.modules.priority'), key: 'priority', width: 80 },
  {
    title: t('page.forecast.modules.window'),
    key: 'window',
    render: (row: Api.Forecast.Period) =>
      row.abs_start
        ? `${formatDateTime(row.abs_start)} ~ ${formatDateTime(row.abs_end || '')}`
        : `${WEEKDAYS.filter(day => row.weekdays & (1 << day))
            .map(day => t(`page.forecast.modules.weekday_${day}`))
            .join(' ')} ${fromMinute(row.start_minute)}-${fromMinute(row.end_minute)}`
  },
  { title: 'CPU (m)', key: 'cpu_milli', width: 90, render: (row: Api.Forecast.Period) => row.cpu_milli || '-' },
  {
    title: 'MiB',
    key: 'memory_bytes',
    width: 90,
    render: (row: Api.Forecast.Period) => (row.memory_bytes ? row.memory_bytes / MIB : '-')
  },
  {
    title: t('page.forecast.modules.replicas'),
    key: 'replicas',
    width: 90,
    render: (row: Api.Forecast.Period) => row.replicas || '-'
  },
  {
    title: t('common.operate'),
    key: 'actions',
    width: 150,
    render: (row: Api.Forecast.Period) =>
      h(NSpace, { wrap: false }, () => [
        h(NButton, { size: 'small', onClick: () => editPeriod(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => removePeriod(row.id) },
          {
            trigger: () => h(NButton, { size: 'small', type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        )
      ])
  }
]);

// ---- table
const columnMap: Record<string, any> = {
  id: { title: t('common.id'), key: 'id', width: 70, align: 'center' },
  name: { title: t('page.forecast.modules.name'), key: 'name', width: 170, resizable: true },
  namespace: { title: t('page.forecast.modules.namespace'), key: 'namespace', width: 140, resizable: true },
  workload: { title: t('page.forecast.modules.workload'), key: 'workload', width: 160, resizable: true },
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
    width: 280,
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => open(row) }, () => t('common.edit')),
        h(
          NButton,
          {
            size: 'small',
            onClick: () => router.push({ path: '/monitoring/datasets', query: { module_id: row.id } })
          },
          () => t('page.forecast.modules.sources')
        ),
        h(
          NDropdown,
          { options: stepOptions(row), onSelect: (key: string) => runStep(row, key) },
          {
            default: () =>
              h(NButton, { size: 'small', loading: running.value === row.id }, () => t('page.forecast.modules.run'))
          }
        ),
        h(
          NDropdown,
          { options: moreOptions(row), onSelect: (key: string) => moreAction(row, key) },
          { default: () => h(NButton, { size: 'small' }, () => t('page.forecast.modules.more')) }
        )
      ])
  }
};
const defaultColumnKeys = ['name', 'workload_kind', 'workload', 'mode', 'enabled', 'status', 'actions'];

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

const modalTitle = computed(() =>
  editing.value ? t('page.forecast.modules.editTitle') : t('page.forecast.modules.addTitle')
);

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
              <NFormItemGi :span="8" :label="t('page.datasource.connections.keyword')" path="keyword">
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
                path="mode"
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
                path="enabled"
              >
                <NSelect
                  v-model:value="searchParams.enabled"
                  clearable
                  :placeholder="t('common.selectField', { field: t('page.datasource.connections.enabled') })"
                  :options="enabledOptions"
                />
              </NFormItemGi>
              <NGi class="list-search-actions" :span="6">
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
          :show-delete="false"
          @add="open()"
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
            :scroll-x="1500"
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
            <NSwitch v-model:value="form.enabled" />
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
          <NFormItem :label="t('page.forecast.modules.fallbackReplicas')">
            <NInputNumber v-model:value="form.fallback_replicas" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.fallbackGpu')">
            <NInputNumber v-model:value="form.fallback_gpu" :min="0" :precision="0" class="w-full" />
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
        </NForm>

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
          <NFormItem :label="t('page.forecast.modules.minReplicas')">
            <NInputNumber v-model:value="form.min_replicas" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.maxReplicas')">
            <NInputNumber v-model:value="form.max_replicas" :min="0" class="w-full" />
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

    <!-- fixed periods -->
    <NModal
      :show="Boolean(periodModule)"
      preset="card"
      :title="`${periodModule?.name || ''} - ${t('page.forecast.modules.periods')}`"
      class="edit-modal-wide"
      @update:show="value => !value && (periodModule = undefined)"
    >
      <NDataTable
        :columns="periodColumns"
        :data="periods"
        :row-key="(row: Api.Forecast.Period) => row.id"
        size="small"
        :max-height="240"
      />
      <div class="mb-8px mt-16px font-medium">{{ periodForm.id ? t('common.edit') : t('common.add') }}</div>
      <NForm :model="periodForm" label-placement="top">
        <NFormItem :label="t('page.forecast.modules.name')"><NInput v-model:value="periodForm.name" /></NFormItem>
        <NFormItem :label="t('page.forecast.modules.priority')">
          <NInputNumber v-model:value="periodForm.priority" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.periodKind')">
          <NSelect
            v-model:value="periodForm.kind"
            :options="[
              { label: t('page.forecast.modules.kindWeekly'), value: 'weekly' },
              { label: t('page.forecast.modules.kindAbsolute'), value: 'absolute' }
            ]"
          />
        </NFormItem>
        <NFormItem :label="t('page.datasource.connections.enabled')">
          <NSwitch v-model:value="periodForm.enabled" />
        </NFormItem>
        <template v-if="periodForm.kind === 'weekly'">
          <NFormItem :label="t('page.forecast.modules.weekdays')">
            <NCheckboxGroup v-model:value="periodForm.weekdays">
              <NSpace>
                <NCheckbox
                  v-for="day in WEEKDAYS"
                  :key="day"
                  :value="day"
                  :label="t(`page.forecast.modules.weekday_${day}`)"
                />
              </NSpace>
            </NCheckboxGroup>
          </NFormItem>
          <NFormItem>
            <template #label>
              <span class="inline-flex items-center gap-4px">
                {{ t('page.forecast.modules.timeRange') }}
                <IconTooltip icon="mdi-help-circle" placement="top">
                  <div class="max-w-320px leading-22px">
                    {{ t('page.forecast.modules.timeRangeHint', { zone: periodModule?.timezone || 'UTC' }) }}
                  </div>
                </IconTooltip>
              </span>
            </template>
            <NSpace align="center">
              <NInput v-model:value="periodForm.start" placeholder="09:00" class="w-100px" />
              <span>~</span>
              <NInput v-model:value="periodForm.end" placeholder="18:00" class="w-100px" />
            </NSpace>
          </NFormItem>
        </template>
        <template v-else>
          <NFormItem :label="t('page.forecast.modules.absStart')">
            <NDatePicker v-model:value="periodForm.abs_start" type="datetime" clearable class="w-full" />
          </NFormItem>
          <NFormItem :label="t('page.forecast.modules.absEnd')">
            <NDatePicker v-model:value="periodForm.abs_end" type="datetime" clearable class="w-full" />
          </NFormItem>
        </template>
        <NFormItem :label="t('page.forecast.modules.periodCpu')">
          <NInputNumber v-model:value="periodForm.cpu_milli" :min="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.periodMemory')">
          <NInputNumber v-model:value="periodForm.memory_mib" :min="0" class="w-full" />
        </NFormItem>
        <NFormItem :label="t('page.forecast.modules.replicas')">
          <NInputNumber v-model:value="periodForm.replicas" :min="0" class="w-full" />
        </NFormItem>
      </NForm>
      <div class="text-13px opacity-70">{{ t('page.forecast.modules.periodHint') }}</div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="Object.assign(periodForm, emptyPeriod())">{{ t('common.reset') }}</NButton>
          <NButton type="primary" @click="savePeriod">{{ t('common.save') }}</NButton>
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
    <NModal v-model:show="resultVisible" preset="card" :title="resultTitle" class="edit-modal-wide">
      <div class="max-h-60vh overflow-auto">
        <RecommendationExplain v-if="resultDetail" class="mb-12px" :detail="resultDetail" />
        <NCode :code="resultJson" language="json" word-wrap />
      </div>
    </NModal>
  </div>
</template>

<style scoped></style>
