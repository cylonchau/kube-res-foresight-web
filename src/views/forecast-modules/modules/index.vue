<script setup lang="tsx">
import { computed, h, nextTick, onMounted, reactive, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItem,
  NFormItemGi,
  NInput,
  NInputNumber,
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
import ModuleDisplayMetrics from '@/components/business/module-display-metrics.vue';
import FormulaView from '@/components/common/formula-view.vue';
import ParamLabel from '@/components/common/param-label.vue';
import CapacityCard, { type CapacityCardData } from '@/components/business/capacity-card.vue';
import TriggerEditor from '@/components/business/trigger-editor.vue';
import ModuleMetrics from '@/components/business/module-metrics.vue';
import ModuleBatchCopyModal from '@/components/business/module-batch-copy-modal.vue';
import OverprovisionApplyTable from '@/components/business/overprovision-apply-table.vue';
import ModuleNeedModal from '@/components/business/module-need-modal.vue';
import RegistrationTombstonesModal from '@/components/business/registration-tombstones-modal.vue';
import ModuleParamsModal from '@/components/business/module-params-modal.vue';
import type { QueryConfig } from '@/components/business/query-test-result.vue';
import ListTablePanel from '@/components/business/list-table-panel.vue';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import DurationInput from '@/components/advanced/duration-input.vue';
import { useTableColumnConfig } from '@/hooks/business/use-table-column-config';
import {
  fetchBatchModules,
  fetchBypassModule,
  fetchCopyModuleConfig,
  fetchGetForecastModule,
  fetchCreateForecastModule,
  fetchCreateModuleSource,
  fetchCreatePeriod,
  fetchDeleteForecastModule,
  fetchGetAlgorithms,
  fetchGetClusters,
  fetchCreateTrigger,
  fetchGetConfig,
  fetchGetForecastModules,
  fetchGetModuleCapacity,
  fetchGetModuleOverprovision,
  fetchGetModuleSources,
  fetchGetPeriods,
  fetchGetTriggers,
  fetchResumeModule,
  fetchUpdateForecastModule
} from '@/service/api';
import SvgIcon from '@/components/custom/svg-icon.vue';
import { formatDateTime } from '@/utils/date';
import { getAdaptivePageSize, getAdaptivePageSizes } from '@/utils/pagination';
import { copyCell } from '@/utils/copy-cell';
import { progressParams } from '@/utils/pending-text';
import { formatResource } from '@/utils/format';
import {
  type CoefficientForm,
  type FormulaLine,
  moduleFormulaLines,
  coef as coefToken,
  name as nameToken,
  num as numToken,
  op as opToken,
  res as resToken
} from '@/utils/formula';
import { type DocForm, type ParamId, paramDoc } from '@/utils/param-docs';
import { type ApplyField, type ApplyTarget, applyItems, formField } from '@/utils/overprovision-apply';
import { helpTitle } from '@/utils/help-title';
import { operateWidth } from '@/utils/operate-width';
import { EMPTY_SYSTEM, type SystemParams } from '@/utils/module-params';

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

/** the registered clusters: the form of a module asks for one only when there is more than one (the default one is the empty value) */
const clusters = ref<Api.Cluster.Cluster[]>([]);
const clusterOptions = computed(() =>
  clusters.value.map(c => ({
    label: c.is_default ? `${c.name} (${t('page.datasource.clusters.default')})` : c.name,
    value: c.is_default ? '' : c.name
  }))
);
async function loadClusters() {
  const { data } = await fetchGetClusters();
  clusters.value = data?.list || [];
}

const modeOptions = computed(() =>
  (['observe', 'recommend', 'admission', 'auto'] as const).map(value => ({
    label: t(`page.forecast.modules.mode_${value}`),
    value
  }))
);
const decisionSourceOptions = computed(() =>
  (['algorithm', 'rule'] as const).map(value => ({ label: t(`page.forecast.modules.decisionSource_${value}`), value }))
);
const predictModeOptions = computed(() =>
  (['dynamic', 'fixed', 'none'] as const).map(value => ({
    label: t(`page.forecast.modules.predictMode_${value}`),
    value
  }))
);
/** the algorithms a module can be fixed to: every algorithm of the platform */
const algorithmOptions = ref<Array<{ label: string; value: string }>>([]);
async function loadAlgorithms() {
  const { data } = await fetchGetAlgorithms({ page: 1, page_size: 200 });
  algorithmOptions.value = (data?.list || []).map(item => ({ label: item.id, value: item.id }));
}
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
    predict_enabled: false,
    predict_mode: 'dynamic' as Api.Forecast.PredictMode,
    predict_algorithm: '',
    cluster: '',
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
    target_utilization: 0,
    rec_p90_target: 0,
    rec_p95_target: 0,
    rec_p99_target: 0,
    rec_limit_guard: 0,
    rec_sustain_minutes: 0,
    rec_cpu_request_headroom: 0,
    rec_memory_request_headroom: 0,
    rec_cpu_limit_factor: 0,
    rec_memory_limit_factor: 0,
    oom_calc_working_set_ratio: 1,
    oom_calc_limit_ratio: 1,
    oom_calc_history_ratio: 1,
    floor_ratio: 0,
    max_shortfall: 0.5,
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
    fixed_replicas: 0,
    fixed_replicas_enabled: false,
    decision_source: 'algorithm' as 'algorithm' | 'rule',
    headroom_ratio: 1,
    limit_cpu_ratio: 0,
    limit_memory_ratio: 0,
    scale_up_max_step: 0,
    scale_down_max_step: 0,
    scale_up_cooldown_seconds: 0,
    scale_down_cooldown_seconds: 0,
    pod_capacity_rps: 0,
    timezone: 'Asia/Shanghai',
    min_score: 0,
    max_replicas_mode: 'fixed' as Api.Forecast.MaxReplicasMode,
    hard_max_replicas: 0,
    expand_step_ratio: 0.25,
    min_gpu: 0,
    max_gpu: 0,
    fallback_gpu: 0,
    oom_lookback_days: 14,
    oom_memory_uplift: 1.2,
    oom_weight_enabled: false,
    oom_weight: 0.2,
    jvm_heap_pressure: 0.85,
    recover_cycles: 2
  };
}
const form = reactive(emptyForm());
/** the floor coefficient is a number with a switch: the form holds the effective figure (0 = off), and the switch remembers the last one so turning it on again restores it */
const FLOOR_START = 0.5;
let floorMemo = FLOOR_START;
const floorOn = computed({
  get: () => form.floor_ratio > 0,
  set: (on: boolean) => {
    if (on) {
      form.floor_ratio = floorMemo > 0 ? floorMemo : FLOOR_START;
    } else {
      if (form.floor_ratio > 0) floorMemo = form.floor_ratio;
      form.floor_ratio = 0;
    }
  }
});
/** The module a clone is taken from; its metric sources and fixed periods are copied once the clone exists. Algorithms are platform-wide and apply to the clone by themselves. */
const cloneSource = ref<Api.Forecast.Module>();
const periodEditor = ref<InstanceType<typeof PeriodEditor>>();
const triggerEditor = ref<InstanceType<typeof TriggerEditor>>();
const jvmMetricsEditor = ref<InstanceType<typeof ModuleMetrics>>();
const metricsEditor = ref<InstanceType<typeof ModuleMetrics>>();
const oomMetricsEditor = ref<InstanceType<typeof ModuleMetrics>>();
const boardMetricsEditor = ref<InstanceType<typeof ModuleDisplayMetrics>>();
const bypassTarget = ref<Api.Forecast.Module>();
/** the module whose need (replicas, CPU, memory) is being read, before it is configured to act */
const needTarget = ref<Api.Forecast.Module>();
const paramsTarget = ref<Api.Forecast.Module | null>(null);
const paramsShow = ref(false);
/** the formulas of the calculation with the coefficients the form holds right now: they change as a coefficient is typed */
const coefficientLines = computed(() => {
  const m = (key: string) => t(`page.forecast.modules.${key}`);
  return moduleFormulaLines(form as unknown as CoefficientForm, {
    cpu: m('formulaCpu'),
    memory: m('formulaMemory'),
    peak: m('formulaPeak'),
    headroom: m('headroom'),
    reserve: m('coeffReserve'),
    oom: m('coeffOomCalc'),
    workingSet: m('coeffOomWorkingSet'),
    limit: m('coeffOomLimit'),
    history: m('coeffOomHistory'),
    uplift: m('oomMemoryUplift'),
    floor: m('coeffFloor'),
    statedRequest: m('formulaStatedRequest'),
    board: m('formulaBoard'),
    boardLimits: m('formulaBoardLimits'),
    cpuRequests: m('formulaCpuRequests'),
    memoryRequests: m('formulaMemoryRequests'),
    cpuLimits: m('formulaCpuLimits'),
    memoryLimits: m('formulaMemoryLimits'),
    requestHeadroom: m('coeffCpuRequestHeadroom'),
    limitFactor: m('coeffCpuLimitFactor'),
    system: m('formulaSystem'),
    keepsNeed: ''
  });
});

/** what the system settings say where a module leaves a share at 0: read once, shown in the examples of the "?" (0 = not read) */
const system = reactive({ p90: 0, p95: 0, p99: 0, limitFactor: 0, limitGuard: 0, sustain: 0 });
async function loadSystemDefaults() {
  const keys = {
    p90: 'analysis.rec_p90_target_percent',
    p95: 'analysis.rec_p95_target_percent',
    p99: 'analysis.rec_p99_target_percent',
    limitFactor: 'analysis.rec_limit_factor_percent',
    limitGuard: 'analysis.rec_limit_guard_percent',
    sustain: 'analysis.rec_sustain_minutes'
  } as const;
  await Promise.all(
    (Object.keys(keys) as Array<keyof typeof keys>).map(async name => {
      const { data } = await fetchGetConfig(keys[name]);
      const value = Number(data?.config_value);
      // the percentages of the settings are shares; the sustain window is minutes
      if (Number.isFinite(value) && value > 0) system[name] = name === 'sustain' ? value : value / 100;
    })
  );
}

/** the times of the operator's outage rules in seconds, read from the system parameters (null = not read): the flow under the fallback names them */
const operatorTimes = reactive<Record<'cache' | 'hold' | 'cooldown' | 'answers' | 'stable', number | null>>({
  cache: null,
  hold: null,
  cooldown: null,
  answers: null,
  stable: null
});
async function loadOperatorTimes() {
  const keys = {
    cache: 'operator.decision_cache_ttl_seconds',
    hold: 'operator.degrade_hold_seconds',
    cooldown: 'operator.degrade_cooldown_seconds',
    answers: 'operator.recover_answers',
    stable: 'operator.recover_stable_seconds'
  } as const;
  await Promise.all(
    (Object.keys(keys) as Array<keyof typeof keys>).map(async name => {
      const { data } = await fetchGetConfig(keys[name]);
      const value = Number(data?.config_value);
      if (data?.config_value !== undefined && data.config_value !== '' && Number.isFinite(value) && value >= 0) {
        operatorTimes[name] = value;
      }
    })
  );
}

/**
 * The system settings the "Parameters" window shows next to the module's own figures: the ones a module follows (read above) and the ones only the system has (the reasonable bands
 * of the percentiles, the throttle limit, the period, the grades). They are read once, when the window is first opened, so the list does not ask for them.
 */
const viewSystem = reactive<SystemParams>({ ...EMPTY_SYSTEM });
let viewSystemRead = false;
async function openParams(row: Api.Forecast.Module) {
  paramsTarget.value = row;
  paramsShow.value = true;
  if (viewSystemRead) return;
  viewSystemRead = true;
  const keys = {
    p90Low: 'analysis.rec_p90_low_percent',
    p90High: 'analysis.rec_p90_high_percent',
    p95Low: 'analysis.rec_p95_low_percent',
    p95High: 'analysis.rec_p95_high_percent',
    p99Low: 'analysis.rec_p99_low_percent',
    p99High: 'analysis.rec_p99_high_percent',
    throttle: 'analysis.throttle_percent',
    baseline: 'analysis.baseline_window_days',
    severe: 'analysis.grade_severe_percent',
    moderate: 'analysis.grade_moderate_percent'
  } as const;
  await Promise.all(
    (Object.keys(keys) as Array<keyof typeof keys>).map(async name => {
      const { data } = await fetchGetConfig(keys[name]);
      const value = Number(data?.config_value);
      if (Number.isFinite(value) && value > 0) viewSystem[name] = name === 'baseline' ? value : value / 100;
    })
  );
}
const paramsSystem = computed<SystemParams>(() => ({ ...viewSystem, ...system }));

/** the "?" of a parameter: its definition, what it does, its formula, an example with the figures of the form and where it applies */
const docOf = (id: ParamId) =>
  paramDoc(id, form as unknown as DocForm, { t: (key, named) => t(key, named ?? {}), system });

const formatNumber = (v: number) => String(Number(v.toFixed(2)));

/** a state of the report as the card says it: a missing source and a missing history are both "no history" */
const STATE_OF: Record<Api.Forecast.CapacityState, CapacityCardData['state']> = {
  ready: 'ready',
  not_set: 'not_set',
  no_source: 'no_history',
  no_history: 'no_history',
  insufficient: 'insufficient',
  error: 'error'
};

/** the capacity of one Pod as the platform reads it (the entered figure and what the history says), for the module being edited; none for a module that is not saved */
const capacityReport = ref<Api.Forecast.CapacityReport | null>(null);
async function loadCapacity(id?: number) {
  capacityReport.value = null;
  if (!id) return;
  const { data } = await fetchGetModuleCapacity(id);
  capacityReport.value = data ?? null;
}

/**
 * What the capacity settings come to, worked out from the form and shown beside it: the utilization of a Pod's request, the safe load of a Pod in requests per second, and
 * what the least and the most replicas can carry. A card with no figure behind it says why (not set, no history, not enough data, calculation failed); it never shows a
 * number that has no source, and a module that is not saved has no history to read.
 */
const capacityCards = computed<CapacityCardData[]>(() => {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  const fx = (v: number) => formatNumber(v);
  const fmtPct = (v: number) => `${formatNumber(v * 100)}%`;
  const line = (label: string, ...tokens: FormulaLine['tokens']): FormulaLine[] => [{ label, tokens }];
  const report = capacityReport.value;
  const saved = Boolean(editing.value?.id);
  const reserveSet = form.target_utilization > 0 && form.target_utilization <= 1;
  const estimate = form.replica_mode === 'dynamic' && form.capacity_mode === 'estimate';

  // the safe load of one Pod: the entered figure, or what the history gives
  let pod: Pick<CapacityCardData, 'state' | 'value' | 'sub'> & { number: number };
  if (estimate) {
    if (!saved || !report || report.mode !== 'estimate')
      pod = { state: 'unsaved', value: '', sub: saved ? m('capUnsavedEstimate') : m('capNew'), number: 0 };
    else if (report.state === 'ready')
      pod = {
        state: 'ready',
        value: `${fx(report.value)} RPS`,
        sub: m('capPodEstimateSub', { used: report.used, samples: report.samples, days: report.lookback_days }),
        number: report.value
      };
    else if (report.state === 'insufficient')
      pod = {
        state: 'insufficient',
        value: '',
        sub: m('capPodInsufficientSub', { used: report.used, min: report.min_samples }),
        number: 0
      };
    else pod = { state: STATE_OF[report.state], value: '', sub: report.estimate_note || report.note || '', number: 0 };
  } else if (form.pod_capacity_rps > 0) {
    pod = {
      state: 'ready',
      value: `${fx(form.pod_capacity_rps)} RPS`,
      sub: m('capPodManualSub'),
      number: form.pod_capacity_rps
    };
  } else {
    pod = { state: 'not_set', value: '', sub: m('capPodNotSet'), number: 0 };
  }

  const total = (replicas: number, what: string, hard?: number): Pick<CapacityCardData, 'state' | 'value' | 'sub'> => {
    if (!(replicas > 0)) return { state: 'not_set', value: '', sub: m('capTotalNoReplicas', { what }) };
    if (pod.state !== 'ready') return { state: pod.state, value: '', sub: m('capTotalNoPod') };
    const extra = hard && hard > replicas ? ` · ${m('capTotalHard', { hard, total: fx(pod.number * hard) })}` : '';
    return {
      state: 'ready',
      value: `${fx(pod.number * replicas)} RPS`,
      sub: `${m('capTotalSub', { replicas, rps: fx(pod.number) })}${extra}`
    };
  };
  const minTotal = total(form.min_replicas, m('capReplicasMin'));
  const maxTotal = total(
    form.max_replicas,
    m('capReplicasMax'),
    form.max_replicas_mode === 'dynamic' ? form.hard_max_replicas : 0
  );
  const days = report?.lookback_days ?? 7;
  const busy = fmtPct(report?.busy_share ?? 0.7);
  return [
    {
      key: 'util',
      label: m('capCardUtil'),
      state: reserveSet ? 'ready' : 'not_set',
      value: fmtPct(form.target_utilization),
      sub: reserveSet ? m('capUtilSub', { value: fx(form.target_utilization) }) : m('capUtilNotSet'),
      meaning: m('capMeaningUtil'),
      source: m('capSourceUtil'),
      formula: line(m('capFormulaUtil'), nameToken(m('capFormulaUtil')), opToken('='), coefToken(m('coeffReserve'))),
      period: m('capPeriodUtil')
    },
    {
      key: 'pod',
      label: m('capCardPod'),
      ...pod,
      meaning: m('capMeaningPod'),
      source: estimate ? m('capSourcePodEstimate') : m('capSourcePodManual'),
      formula: estimate
        ? line(
            m('capFormulaPodEstimate'),
            nameToken(m('capFormulaPodEstimate')),
            opToken('='),
            numToken(m('capRuleEstimate'))
          )
        : line(m('capFormulaPodManual'), nameToken(m('capFormulaPodManual')), opToken('='), resToken(m('podCapacity'))),
      period: estimate
        ? m('capPeriodPodEstimate', { days, busy, min: report?.min_samples ?? 30 })
        : m('capPeriodPodManual')
    },
    {
      key: 'min',
      label: m('capCardMin'),
      ...minTotal,
      meaning: m('capMeaningTotal'),
      source: m('capSourceTotal'),
      formula: line(
        m('capFormulaMin'),
        nameToken(m('capFormulaMin')),
        opToken('='),
        nameToken(m('capReplicasMin')),
        opToken('×'),
        nameToken(m('capCardPod'))
      ),
      period: m('capPeriodTotal')
    },
    {
      key: 'max',
      label: m('capCardMax'),
      ...maxTotal,
      meaning: m('capMeaningTotal'),
      source: m('capSourceTotal'),
      formula: line(
        m('capFormulaMax'),
        nameToken(m('capFormulaMax')),
        opToken('='),
        nameToken(m('capReplicasMax')),
        opToken('×'),
        nameToken(m('capCardPod'))
      ),
      period: m('capPeriodTotal')
    }
  ];
});

/** the replica bounds in one sentence with the figures of the form: what the ceiling is now and what the hard maximum and the expansion speed do (or that they do nothing) */
const boundsNote = computed(() => {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  const { min_replicas: min, max_replicas: max } = form;
  if (!(max > 0)) return m('boundsMissing', { what: m('boundsMissingMax'), side: m('boundsSideMax') });
  if (form.max_replicas_mode === 'dynamic') {
    const step = Math.max(1, Math.ceil(max * form.expand_step_ratio));
    return m('boundsDynamic', {
      max,
      step,
      ratio: `${formatNumber(form.expand_step_ratio * 100)}%`,
      hard: form.hard_max_replicas || '-'
    });
  }
  if (!(min > 0)) return `${m('boundsFixed', { min: 0, max })}`;
  return m('boundsFixed', { min, max });
});

/** the rows of the table that says which coefficient makes which result, in the two calculations */
const coeffMatrixRows = ['cpuRequests', 'memoryRequests', 'cpuLimits', 'memoryLimits', 'replicas'] as const;

/** the floor coefficient with the figures of the form: the stated Pod request times it, against the fixed floor value, the larger is the lower bound */
const floorNote = computed(() => {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  const stated = form.pod_cpu_request_milli;
  if (!(stated > 0)) return m('floorNoteNoRequest');
  const byRatio = Math.ceil(stated * form.floor_ratio);
  const fixed = form.min_cpu_milli;
  return m('floorNote', {
    stated,
    ratio: formatNumber(form.floor_ratio),
    byRatio,
    fixed: fixed > 0 ? fixed : '-',
    floor: Math.max(byRatio, fixed)
  });
});

/** what the fixed replicas do now: on and holding a count, off with a count kept, or not set */
const fixedNote = computed(() => {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  if (form.fixed_replicas_enabled) return m('fixedNoteOn', { n: form.fixed_replicas || '-' });
  if (form.fixed_replicas > 0) return m('fixedNoteOffKept', { n: form.fixed_replicas });
  return m('fixedNoteOff');
});

/** what the step and the cooldown of a direction add up to: the most replicas one action moves and how often */
function paceLine(direction: 'up' | 'down', step: number, cooldown: number) {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  const dir = m(direction === 'up' ? 'paceUp' : 'paceDown');
  if (step > 0 && cooldown > 0)
    return m('paceBoth', { dir, step, sec: cooldown, hour: Math.floor(3600 / cooldown) * step });
  if (step > 0) return m('paceStepOnly', { dir, step });
  if (cooldown > 0) return m('paceCooldownOnly', { dir, sec: cooldown });
  return m('paceNone', { dir });
}
const paceNote = computed(() => ({
  up: paceLine('up', form.scale_up_max_step, form.scale_up_cooldown_seconds),
  down: paceLine('down', form.scale_down_max_step, form.scale_down_cooldown_seconds)
}));

/** a time in seconds as the flow writes it: whole minutes as minutes, else seconds; "-" when the parameter was not read */
function spanText(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds > 0 && seconds % 60 === 0) return t('page.forecast.modules.spanMinutes', { n: seconds / 60 });
  return t('page.forecast.modules.spanSeconds', { n: seconds });
}

/** the way of an outage of the platform and of its end, with the times the system parameters hold */
const fallbackFlow = computed(() => {
  const m = (key: string, named?: Record<string, unknown>) => t(`page.forecast.modules.${key}`, named ?? {});
  return [
    m('flowOk'),
    m('flowCache', { cache: spanText(operatorTimes.cache) }),
    m('flowHold', { hold: spanText(operatorTimes.hold) }),
    m('flowDegraded', { cooldown: spanText(operatorTimes.cooldown) }),
    m('flowRecover', { answers: operatorTimes.answers ?? '-', stable: spanText(operatorTimes.stable) }),
    m('flowRecord')
  ];
});

/** the bounds that have a "?" of the full kind (definition, formula, example, scope) */
const boundDocs: Record<string, ParamId | undefined> = { min_cpu_milli: 'minCpu', min_memory_mib: 'minMemory' };

const paceFields = ['scaleUpMaxStep', 'scaleDownMaxStep', 'scaleUpCooldown', 'scaleDownCooldown'] as const;
const paceModel = {
  scaleUpMaxStep: 'scale_up_max_step',
  scaleDownMaxStep: 'scale_down_max_step',
  scaleUpCooldown: 'scale_up_cooldown_seconds',
  scaleDownCooldown: 'scale_down_cooldown_seconds'
} as const;
// the floor and the cap that hold a recommendation: a guardrail on the result, not a forecast (0 = not set)
const resourceBounds = [
  { model: 'min_cpu_milli', label: 'minCpu', hint: 'floorHint' },
  { model: 'max_cpu_milli', label: 'maxCpu', hint: 'capHint' },
  { model: 'min_memory_mib', label: 'minMemory', hint: 'floorHint' },
  { model: 'max_memory_mib', label: 'maxMemory', hint: 'capHint' },
  { model: 'min_gpu', label: 'minGpu', hint: 'floorHint' },
  { model: 'max_gpu', label: 'maxGpu', hint: 'capHint' }
] as const;

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

/** what a registered module still lacks, in words, for a tooltip or the notice of the form */
function blockersText(codes?: string[] | null) {
  return (codes ?? []).map(code => t(`page.forecast.modules.blocker_${code}`)).join('；');
}

// ---- what the resource dashboard recommends for this module, put in the form (not saved: the person reads, changes and saves)
const recommendDetail = ref<Api.Overprovision.Detail | null>(null);
const recommendLoading = ref(false);
const recommendWaited = ref(0);
const recommendProgress = ref<ReturnType<typeof progressParams>>(null);
const recommendFailure = ref('');
const recommendChosen = ref<ApplyTarget[]>([]);
const recommendItems = computed(() => applyItems(recommendDetail.value));
/** what the form holds now in each field a recommendation can go in, in the unit of the module (the memory is typed in MiB) */
const recommendCurrent = computed(() => {
  const out: Partial<Record<ApplyField, number>> = {
    pod_cpu_request_milli: form.pod_cpu_request_milli,
    min_cpu_milli: form.min_cpu_milli,
    max_cpu_milli: form.max_cpu_milli,
    fallback_cpu_milli: form.fallback_cpu_milli,
    pod_memory_request_bytes: form.pod_memory_request_mib * MIB,
    min_memory_bytes: form.min_memory_mib * MIB,
    max_memory_bytes: form.max_memory_mib * MIB,
    fallback_memory_bytes: form.fallback_memory_mib * MIB,
    limit_cpu_ratio: form.limit_cpu_ratio,
    limit_memory_ratio: form.limit_memory_ratio,
    min_replicas: form.min_replicas,
    max_replicas: form.max_replicas,
    fallback_replicas: form.fallback_replicas,
    fixed_replicas: form.fixed_replicas_enabled ? form.fixed_replicas : 0
  };
  return out;
});
let recommendSeq = 0;

async function readRecommendation() {
  const target = editing.value;
  if (!target) return;
  recommendSeq += 1;
  const seq = recommendSeq;
  recommendLoading.value = true;
  recommendFailure.value = '';
  recommendWaited.value = 0;
  recommendProgress.value = null;
  try {
    const { data, error } = await fetchGetModuleOverprovision(
      target.id,
      {},
      {
        onWait: (seconds, progress) => {
          recommendWaited.value = seconds;
          recommendProgress.value = progressParams(progress, stage => t(`page.overprovision.readStage_${stage}`));
        },
        cancelled: () => seq !== recommendSeq
      }
    );
    if (seq !== recommendSeq) return;
    recommendDetail.value = data ?? null;
    if (!data) {
      const response = (error as { response?: { data?: { msg?: string } } } | null)?.response;
      recommendFailure.value =
        response?.data?.msg ||
        (error as { message?: string } | null)?.message ||
        t('page.forecast.modules.recommendFailed');
    }
  } finally {
    if (seq === recommendSeq) recommendLoading.value = false;
  }
}

/** the ticked recommendations go in the form: the fields are the ones the person edits below, and nothing is saved */
function fillRecommendation() {
  for (const target of recommendChosen.value) {
    const { key, value } = formField(target);
    (form as Record<string, unknown>)[key] = value;
    if (target.field === 'fixed_replicas') form.fixed_replicas_enabled = true;
  }
  message.success(t('page.forecast.modules.recommendFilled', { n: recommendChosen.value.length }));
}

// ---- the parameters of another module onto this one (a module is switched off to take them; it is one step, and the form is then edited as usual)
const copyFrom = ref<number | null>(null);
const copyGroups = ref<string[]>(['replicas', 'data', 'resources', 'predict', 'sources', 'periods']);
const copyOptions = ref<Array<{ label: string; value: number }>>([]);
const copying = ref(false);
/** what the last copy did: what was taken, and what was left and why (shown under the button, so the reasons are not lost with a toast) */
const copyResult = ref<{ copied: string[]; skipped: Array<{ what: string; reason: string }> } | null>(null);
const COPY_GROUPS = ['replicas', 'data', 'resources', 'predict', 'sources', 'periods'] as const;

async function searchCopySources(keyword = '') {
  const { data } = await fetchGetForecastModules({ page: 1, page_size: 20, keyword: keyword || undefined });
  copyOptions.value = (data?.list ?? [])
    .filter(item => item.id !== editing.value?.id)
    .map(item => ({
      label: `${item.name} (${item.namespace}/${item.workload}${item.cluster ? ` · ${item.cluster}` : ''})`,
      value: item.id
    }));
}

async function copyFromModule() {
  const target = editing.value;
  if (!target || !copyFrom.value) {
    message.warning(t('page.forecast.modules.copyPick'));
    return;
  }
  if (!copyGroups.value.length) {
    message.warning(t('page.forecast.modules.copyGroupsNone'));
    return;
  }
  copying.value = true;
  try {
    const { data, error } = await fetchCopyModuleConfig(target.id, {
      from_id: copyFrom.value,
      groups: copyGroups.value
    });
    if (error || !data) return;
    message.success(t('page.forecast.modules.copyDone', { groups: data.copied.join('、') || '-' }));
    // the form shows what the module has now (what was typed and not saved is replaced), and the list too
    const fresh = await fetchGetForecastModule(target.id);
    if (fresh.data) open(fresh.data);
    copyResult.value = { copied: data.copied ?? [], skipped: data.skipped ?? [] };
    load();
  } finally {
    copying.value = false;
  }
}

function open(row?: Api.Forecast.Module) {
  editing.value = row;
  copyFrom.value = null;
  copyResult.value = null;
  if (row && !row.enabled) searchCopySources();
  cloneSource.value = undefined;
  Object.assign(form, emptyForm());
  if (row) {
    Object.assign(form, {
      ...row,
      pod_memory_request_mib: (row.pod_memory_request_bytes || 0) / MIB,
      target_utilization: row.target_utilization || 0,
      oom_calc_working_set_ratio: row.oom_calc_working_set_ratio || 1,
      oom_calc_limit_ratio: row.oom_calc_limit_ratio || 1,
      oom_calc_history_ratio: row.oom_calc_history_ratio || 1,
      max_shortfall: row.max_shortfall || 0.5,
      min_memory_mib: row.min_memory_bytes / MIB,
      max_memory_mib: row.max_memory_bytes / MIB,
      fallback_memory_mib: row.fallback_memory_bytes / MIB,
      expand_step_ratio: row.expand_step_ratio || 0.25
    });
  }
  visible.value = true;
  loadCapacity(row?.id);
  nextTick(() => {
    periodEditor.value?.load(row?.id);
    triggerEditor.value?.load(row?.id);
    metricsEditor.value?.load(row?.id);
    oomMetricsEditor.value?.load(row?.id);
    jvmMetricsEditor.value?.load(row?.id);
    boardMetricsEditor.value?.load(row?.id);
  });
}

function payloadFromForm(): Api.Forecast.ModulePayload {
  return {
    name: form.name.trim(),
    description: form.description,
    enabled: form.enabled,
    mode: form.mode,
    predict_enabled: form.predict_enabled,
    predict_mode: form.predict_mode,
    predict_algorithm: form.predict_mode === 'fixed' ? form.predict_algorithm : '',
    cluster: form.cluster,
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
    rec_p90_target: form.rec_p90_target,
    rec_p95_target: form.rec_p95_target,
    rec_p99_target: form.rec_p99_target,
    rec_limit_guard: form.rec_limit_guard,
    rec_sustain_minutes: form.rec_sustain_minutes,
    rec_cpu_request_headroom: form.rec_cpu_request_headroom,
    rec_memory_request_headroom: form.rec_memory_request_headroom,
    rec_cpu_limit_factor: form.rec_cpu_limit_factor,
    rec_memory_limit_factor: form.rec_memory_limit_factor,
    oom_calc_working_set_ratio: form.oom_calc_working_set_ratio,
    oom_calc_limit_ratio: form.oom_calc_limit_ratio,
    oom_calc_history_ratio: form.oom_calc_history_ratio,
    floor_ratio: form.floor_ratio,
    max_shortfall: form.max_shortfall,
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
    fixed_replicas: form.fixed_replicas,
    fixed_replicas_enabled: form.fixed_replicas_enabled,
    decision_source: form.decision_source,
    headroom_ratio: form.headroom_ratio,
    limit_cpu_ratio: form.limit_cpu_ratio,
    limit_memory_ratio: form.limit_memory_ratio,
    scale_up_max_step: form.scale_up_max_step,
    scale_down_max_step: form.scale_down_max_step,
    scale_up_cooldown_seconds: form.scale_up_cooldown_seconds,
    scale_down_cooldown_seconds: form.scale_down_cooldown_seconds,
    pod_capacity_rps: form.pod_capacity_rps,
    timezone: form.timezone.trim() || 'Asia/Shanghai',
    min_score: form.min_score,
    max_replicas_mode: form.max_replicas_mode,
    hard_max_replicas: form.hard_max_replicas,
    expand_step_ratio: form.expand_step_ratio,
    min_gpu: form.min_gpu,
    max_gpu: form.max_gpu,
    fallback_gpu: form.fallback_gpu,
    oom_lookback_days: form.oom_lookback_days,
    oom_memory_uplift: form.oom_memory_uplift,
    oom_weight_enabled: form.oom_weight_enabled,
    oom_weight: form.oom_weight,
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
    triggerEditor.value?.load();
    metricsEditor.value?.load();
    oomMetricsEditor.value?.load();
    jvmMetricsEditor.value?.load();
    boardMetricsEditor.value?.load();
  });
}

async function copyConfiguration(sourceId: number, targetId: number) {
  const [sourceList, periodList, triggerList] = await Promise.all([
    fetchGetModuleSources(sourceId),
    fetchGetPeriods(sourceId),
    fetchGetTriggers(sourceId)
  ]);
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
  for (const trigger of triggerList.data || []) {
    const { id: _id, module_id: _moduleId, ...rest } = trigger;
    await fetchCreateTrigger(targetId, rest);
  }
}

async function save() {
  if (!form.name.trim() || !form.namespace.trim() || !form.workload.trim()) {
    message.warning(t('page.forecast.modules.required'));
    return;
  }
  if (form.fixed_replicas_enabled && !(form.fixed_replicas >= 1)) {
    message.warning(t('page.forecast.modules.fixedReplicasRequired'));
    return;
  }
  if (form.predict_enabled && form.predict_mode === 'fixed' && !form.predict_algorithm) {
    message.warning(t('page.forecast.modules.predictAlgorithmRequired'));
    return;
  }
  const editorProblem =
    metricsEditor.value?.problem(form.step_seconds) ||
    oomMetricsEditor.value?.problem(form.step_seconds) ||
    jvmMetricsEditor.value?.problem(form.step_seconds) ||
    boardMetricsEditor.value?.problem(form.step_seconds) ||
    periodEditor.value?.problem() ||
    triggerEditor.value?.problem();
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
      // each part says what failed; the success message is only for a save in which every part went through
      let complete = true;
      if (savedId && (await periodEditor.value?.save(savedId)) === false) {
        complete = false;
        message.warning(t('page.forecast.periods.saveFailed'));
      }
      const metricsSaved = !savedId || (await metricsEditor.value?.save(savedId)) !== false;
      const oomSaved = !savedId || (await oomMetricsEditor.value?.save(savedId)) !== false;
      const jvmSaved = !savedId || (await jvmMetricsEditor.value?.save(savedId)) !== false;
      const boardSaved = !savedId || (await boardMetricsEditor.value?.save(savedId)) !== false;
      // a trigger reads a metric of the module, so the triggers are written after the metrics
      if (savedId && (await triggerEditor.value?.save(savedId)) === false) {
        complete = false;
        message.warning(t('page.forecast.triggers.saveFailed'));
      }
      if (!metricsSaved || !oomSaved || !jvmSaved || !boardSaved) {
        complete = false;
        message.warning(t('page.forecast.moduleMetrics.saveFailed'));
      }
      if (complete) {
        visible.value = false;
        message.success(id ? t('common.modifySuccess') : t('common.addSuccess'));
      } else if (savedId) {
        // the window stays open. The module exists now, so the next save updates it and cannot make a second one; the rows
        // are read again from the server, so what is shown is what is stored and a retry cannot repeat what went through
        if (!id && data) editing.value = data;
        await Promise.all([
          periodEditor.value?.load(savedId),
          triggerEditor.value?.load(savedId),
          metricsEditor.value?.load(savedId),
          oomMetricsEditor.value?.load(savedId),
          jvmMetricsEditor.value?.load(savedId),
          boardMetricsEditor.value?.load(savedId),
          loadCapacity(savedId)
        ]);
      }
      await load();
    }
  } finally {
    saving.value = false;
  }
}

const batchActions = computed(() => [
  { key: 'enable', label: t('common.enable') },
  { key: 'disable', label: t('common.disable') },
  { key: 'copy', label: t('page.forecast.modules.batchCopy') },
  { key: 'delete', label: t('common.delete'), danger: true }
]);

/** the parameters of one module onto the ones that are selected, and the deleted self-registered modules that are not made again */
const batchCopyShow = ref(false);
const tombstonesShow = ref(false);

async function runBatch(action: string) {
  if (action === 'copy') {
    batchCopyShow.value = true;
    return;
  }
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

/**
 * The chips of the table (the run mode, the switch and the state) are made one way: the same size, an icon in front, and one colour for one meaning (grey nothing
 * is running or asked, blue it only recommends, orange it changes the Pod when it is created, green it is on and well).
 */
interface ChipLook {
  type: 'default' | 'info' | 'success' | 'warning' | 'error';
  icon: string;
}
const MODE_LOOK: Record<string, ChipLook> = {
  observe: { type: 'default', icon: 'carbon:view' },
  recommend: { type: 'info', icon: 'carbon:idea' },
  admission: { type: 'warning', icon: 'carbon:security' },
  auto: { type: 'success', icon: 'carbon:automatic' }
};
function chip(look: ChipLook, text: string, title?: string) {
  return h(
    NTag,
    { type: look.type, bordered: false, size: 'small', title },
    {
      icon: () => h(SvgIcon, { icon: look.icon }),
      default: () => text
    }
  );
}

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
  cluster: {
    title: t('page.forecast.modules.cluster'),
    key: 'cluster',
    width: 120,
    resizable: true,
    render: (row: Api.Forecast.Module) => row.cluster || clusters.value.find(c => c.is_default)?.name || '-'
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
    width: 130,
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      chip(MODE_LOOK[row.mode] ?? MODE_LOOK.observe, t(`page.forecast.modules.mode_${row.mode}`))
  },
  enabled: {
    title: t('page.datasource.connections.enabled'),
    key: 'enabled',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      row.enabled
        ? chip({ type: 'success', icon: 'carbon:checkmark-filled' }, t('common.enable'))
        : row.auto_registered
          ? chip(
              { type: 'warning', icon: 'carbon:warning-alt' },
              row.enable_blockers?.length
                ? t('page.forecast.modules.registeredPending')
                : t('page.forecast.modules.registeredReady'),
              blockersText(row.enable_blockers)
            )
          : chip({ type: 'default', icon: 'carbon:subtract-alt' }, t('common.disable'))
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
          chip({ type: 'warning', icon: 'carbon:warning-alt' }, t('page.forecast.modules.bypassing'), row.bypass_reason)
        );
      if (row.summary?.degraded)
        tags.push(
          chip(
            { type: 'error', icon: 'carbon:warning-filled' },
            t('page.forecast.modules.degraded'),
            row.summary.degrade_reasons
          )
        );
      if (row.summary?.oom_floor)
        tags.push(chip({ type: 'error', icon: 'carbon:warning-filled' }, t('page.forecast.recommendations.oomFloor')));
      if (row.summary && row.summary.consecutive_failures > 0)
        tags.push(
          chip(
            { type: 'warning', icon: 'carbon:warning-alt' },
            t('page.forecast.modules.failing', { count: row.summary!.consecutive_failures }),
            row.summary.last_error
          )
        );
      // a module with nothing wrong says so: an empty cell reads as "no state"
      if (!tags.length) {
        if (!row.enabled) {
          tags.push(chip({ type: 'default', icon: 'carbon:subtract-alt' }, t('page.forecast.modules.stateDisabled')));
        } else if (!row.summary?.latest_version) {
          tags.push(
            chip(
              { type: 'info', icon: 'carbon:time' },
              t('page.forecast.modules.stateNoSnapshot'),
              t('page.forecast.modules.stateNoSnapshotHelp')
            )
          );
        } else {
          tags.push(
            chip(
              { type: 'success', icon: 'carbon:checkmark-filled' },
              t('page.forecast.modules.stateHealthy'),
              t('page.forecast.modules.stateHealthyHelp', { version: row.summary.latest_version })
            )
          );
        }
      }
      return h(NSpace, { size: 4, wrap: true }, () => tags);
    }
  },
  // the configuration the workload is meant to run with now: an empty cell is a resource nothing sets
  replicas: {
    title: () => helpTitle(t('page.forecast.modules.colReplicas'), t('page.forecast.modules.actualReplicasHelp')),
    key: 'replicas',
    width: 100,
    align: 'center',
    // only the replicas that run now; what is recommended is on the recommendations page
    render: (row: Api.Forecast.Module) => formatResource('replicas', row.summary?.actual_replicas)
  },
  predict: {
    title: () => helpTitle(t('page.forecast.modules.colPredict'), t('page.forecast.modules.predictEnabledHint')),
    key: 'predict',
    width: 130,
    align: 'center',
    render: (row: Api.Forecast.Module) => {
      if (!row.predict_enabled)
        return h(NTag, { bordered: false, size: 'small' }, () => t('page.forecast.modules.predictOff'));
      if (row.predict_mode === 'none')
        return h(NTag, { bordered: false, size: 'small' }, () => t('page.forecast.modules.predictMode_none_short'));
      if (row.predict_mode === 'fixed')
        return h(NTag, { type: 'info', bordered: false, size: 'small' }, () =>
          t('page.forecast.modules.predictFixedTag', { algorithm: row.predict_algorithm })
        );
      return h(NTag, { type: 'success', bordered: false, size: 'small' }, () =>
        t('page.forecast.modules.predictMode_dynamic_short')
      );
    }
  },
  cpu: {
    title: () => helpTitle(t('page.forecast.modules.colCpu'), t('page.forecast.modules.currentConfigHelp')),
    key: 'cpu',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Module) => formatResource('cpu', row.summary?.cpu_milli)
  },
  memory: {
    title: () => helpTitle(t('page.forecast.modules.colMemory'), t('page.forecast.modules.currentConfigHelp')),
    key: 'memory',
    width: 100,
    align: 'center',
    render: (row: Api.Forecast.Module) => formatResource('memory', row.summary?.memory_bytes)
  },
  gpu: {
    title: () => helpTitle(t('page.forecast.modules.colGpu'), t('page.forecast.modules.currentConfigHelp')),
    key: 'gpu',
    width: 80,
    align: 'center',
    render: (row: Api.Forecast.Module) => formatResource('gpu', row.summary?.gpu)
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
    width: operateWidth([
      t('common.edit'),
      t('common.delete'),
      t('page.forecast.modules.clone'),
      t('page.forecast.modules.need'),
      t('page.forecast.modules.paramsView.button'),
      t('page.forecast.modules.resume')
    ]),
    fixed: 'right',
    align: 'center',
    render: (row: Api.Forecast.Module) =>
      h(NSpace, { justify: 'center', size: 6, wrap: false }, () => [
        h(NButton, { size: 'tiny', type: 'primary', onClick: () => open(row) }, () => t('common.edit')),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () => h(NButton, { size: 'tiny', type: 'error' }, () => t('common.delete')),
            default: () => t('common.confirmDelete')
          }
        ),
        h(NButton, { size: 'tiny', type: 'info', onClick: () => clone(row) }, () => t('page.forecast.modules.clone')),
        h(NButton, { size: 'tiny', onClick: () => (needTarget.value = row) }, () => t('page.forecast.modules.need')),
        h(NButton, { size: 'tiny', onClick: () => openParams(row) }, () =>
          t('page.forecast.modules.paramsView.button')
        ),
        row.bypass
          ? h(NButton, { size: 'tiny', type: 'success', onClick: () => resume(row) }, () =>
              t('page.forecast.modules.resume')
            )
          : h(NButton, { size: 'tiny', type: 'warning', onClick: () => (bypassTarget.value = row) }, () =>
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
  'predict',
  'status',
  'replicas',
  'cpu',
  'memory',
  'gpu',
  'actions'
];

const cfg = useTableColumnConfig({ pageCode: PAGE_CODE, columnMap, defaultKeys: defaultColumnKeys });

const modalTitle = computed(() =>
  editing.value ? t('page.forecast.modules.editTitle') : t('page.forecast.modules.addTitle')
);

onMounted(() => {
  cfg.initColumnConfig();
  loadAlgorithms();
  loadSystemDefaults();
  loadOperatorTimes();
  loadClusters();
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
        <NButton size="small" @click="tombstonesShow = true">{{ t('page.forecast.modules.tombstones') }}</NButton>
        <BatchActions :count="checkedRowKeys.length" :actions="batchActions" @run="runBatch" />
      </template>
    </ListTablePanel>

    <ModuleBatchCopyModal
      v-model:show="batchCopyShow"
      :target-ids="checkedRowKeys"
      @done="
        load();
        checkedRowKeys = [];
      "
    />
    <RegistrationTombstonesModal v-model:show="tombstonesShow" />

    <!-- create / edit -->
    <NModal v-model:show="visible" preset="card" :title="modalTitle" class="edit-modal-wide">
      <div class="max-h-70vh overflow-y-auto pr-8px">
        <NAlert
          v-if="editing?.auto_registered && editing?.enable_blockers?.length"
          type="warning"
          :show-icon="true"
          class="mb-12px"
        >
          <div class="font-medium">{{ t('page.forecast.modules.registeredTitle') }}</div>
          <div class="text-12px leading-20px">{{ t('page.forecast.modules.registeredHelp') }}</div>
          <ul class="m-0 pl-18px text-12px leading-20px">
            <li v-for="code in editing.enable_blockers" :key="code">
              {{ t(`page.forecast.modules.blocker_${code}`) }}
            </li>
          </ul>
        </NAlert>
        <section v-if="editing && !editing.enabled" class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.copyTitle') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.copyDesc') }}</div>
          <div class="flex-col gap-8px">
            <NSelect
              v-model:value="copyFrom"
              filterable
              remote
              clearable
              :options="copyOptions"
              :placeholder="t('page.forecast.modules.copyPick')"
              @search="searchCopySources"
            />
            <NCheckboxGroup v-model:value="copyGroups">
              <NSpace>
                <NCheckbox
                  v-for="g in COPY_GROUPS"
                  :key="g"
                  :value="g"
                  :label="t(`page.forecast.modules.copyGroup_${g}`)"
                />
              </NSpace>
            </NCheckboxGroup>
            <div class="text-12px leading-20px opacity-70">{{ t('page.forecast.modules.copyNotCopied') }}</div>
            <div>
              <NButton type="primary" secondary :loading="copying" :disabled="!copyFrom" @click="copyFromModule">
                {{ t('page.forecast.modules.copyRun') }}
              </NButton>
            </div>
            <div v-if="copyResult" class="text-12px leading-20px">
              <div>{{ t('page.forecast.modules.copyDone', { groups: copyResult.copied.join('、') || '-' }) }}</div>
              <div v-if="copyResult.skipped.length" class="font-medium">
                {{ t('page.forecast.modules.copySkippedTitle') }}
              </div>
              <ul v-if="copyResult.skipped.length" class="m-0 pl-18px">
                <li v-for="item in copyResult.skipped" :key="item.what">{{ item.what }}：{{ item.reason }}</li>
              </ul>
            </div>
          </div>
        </section>
        <section v-if="editing" class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.recommendTitle') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.recommendDesc') }}</div>
          <div class="flex-col gap-8px">
            <div class="flex items-center gap-10px">
              <NButton secondary :loading="recommendLoading" @click="readRecommendation">
                {{ t('page.forecast.modules.recommendRead') }}
              </NButton>
              <span v-if="recommendLoading && recommendWaited > 0" class="text-12px opacity-70">
                {{
                  recommendProgress
                    ? t('page.forecast.modules.recommendWaitingProgress', { n: recommendWaited, ...recommendProgress })
                    : t('page.forecast.modules.recommendWaiting', { n: recommendWaited })
                }}
              </span>
              <span v-if="recommendFailure" class="text-12px text-[#d03050]">{{ recommendFailure }}</span>
            </div>
            <template v-if="recommendDetail && !recommendLoading">
              <div v-if="!recommendItems.length" class="text-12px opacity-70">
                {{ t('page.overprovision.applyEmpty') }}
              </div>
              <template v-else>
                <OverprovisionApplyTable
                  v-model="recommendChosen"
                  :items="recommendItems"
                  :current="recommendCurrent"
                />
                <div>
                  <NButton type="primary" secondary :disabled="!recommendChosen.length" @click="fillRecommendation">
                    {{ t('page.forecast.modules.recommendFill', { n: recommendChosen.length }) }}
                  </NButton>
                </div>
              </template>
            </template>
          </div>
        </section>
        <div class="mod-group">
          <div class="mod-group-title">{{ t('page.forecast.modules.groupBase') }}</div>
          <div class="mod-group-desc">{{ t('page.forecast.modules.groupBaseDesc') }}</div>
        </div>
        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionBasic') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descBasic') }}</div>
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
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.decisionSource') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.decisionSourceHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.decision_source" :options="decisionSourceOptions" />
              <div class="live-note w-full">
                {{ t(`page.forecast.modules.decisionSourceNote_${form.decision_source}`) }}
              </div>
            </NFormItem>
            <NFormItem v-if="clusters.length > 1">
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.cluster') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t('page.forecast.modules.clusterHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.cluster" :options="clusterOptions" />
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
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionData') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.dataHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descData') }}</div>
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
                :presets="[15, 30, 60, 300, 900, 1800, 3600, 86400]"
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
              <NInputNumber v-model:value="form.max_fill_steps" :min="0" :max="10000" :precision="0" class="w-full" />
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
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.moduleMetrics.title') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.moduleMetrics.rules') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descMetrics') }}</div>
          <ModuleMetrics
            ref="metricsEditor"
            scope="general"
            @preview="source => showPreview(editing?.id ?? null, source)"
            @move-display="item => boardMetricsEditor?.bind(item.kind, item.mappingId)"
          />
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.moduleMetrics.boardTitle') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.moduleMetrics.boardRules') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descBoard') }}</div>
          <ModuleDisplayMetrics
            ref="boardMetricsEditor"
            @preview="source => showPreview(editing?.id ?? null, source)"
          />
        </section>

        <div class="mod-group">
          <div class="mod-group-title">{{ t('page.forecast.modules.groupCalc') }}</div>
          <div class="mod-group-desc">{{ t('page.forecast.modules.groupCalcDesc') }}</div>
        </div>
        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionCapacity') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.sectionReplicasHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descCapacity') }}</div>
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
            </template>
          </NForm>

          <div v-if="!editing && !cloneSource" class="cap-note">{{ t('page.forecast.modules.capNew') }}</div>
          <div class="cap-cards">
            <CapacityCard v-for="card in capacityCards" :key="card.key" :card="card" />
          </div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionCoeff') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descCoeff') }}</div>
          <NForm :model="form" label-placement="top">
            <div class="sub-title">{{ t('page.forecast.modules.coeffGroupForecast') }}</div>
            <div class="group-note">{{ t('page.forecast.modules.coeffGroupForecastNote') }}</div>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffReserve')" :doc="docOf('reserve')" />
              </template>
              <NInputNumber v-model:value="form.target_utilization" :min="0" :max="1" :step="0.05" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.headroom')" :doc="docOf('headroom')" />
              </template>
              <NInputNumber v-model:value="form.headroom_ratio" :min="1" :max="10" :step="0.05" class="w-full" />
            </NFormItem>
            <div class="sub-title">{{ t('page.forecast.modules.coeffGroupRequests') }}</div>
            <div class="group-note">{{ t('page.forecast.modules.coeffGroupRequestsNote') }}</div>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffP90')" :doc="docOf('p90')" />
              </template>
              <NInputNumber v-model:value="form.rec_p90_target" :min="0" :max="3" :step="0.05" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffP95')" :doc="docOf('p95')" />
              </template>
              <NInputNumber v-model:value="form.rec_p95_target" :min="0" :max="3" :step="0.05" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffP99')" :doc="docOf('p99')" />
              </template>
              <NInputNumber v-model:value="form.rec_p99_target" :min="0" :max="3" :step="0.05" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffSustain')" :doc="docOf('sustain')" />
              </template>
              <NInputNumber
                v-model:value="form.rec_sustain_minutes"
                :min="0"
                :max="720"
                :precision="0"
                class="w-full"
              />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel
                  :label="t('page.forecast.modules.coeffCpuRequestHeadroom')"
                  :doc="docOf('cpuRequestHeadroom')"
                />
              </template>
              <NInputNumber
                v-model:value="form.rec_cpu_request_headroom"
                :min="0"
                :max="3"
                :step="0.05"
                class="w-full"
              />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel
                  :label="t('page.forecast.modules.coeffMemoryRequestHeadroom')"
                  :doc="docOf('memoryRequestHeadroom')"
                />
              </template>
              <NInputNumber
                v-model:value="form.rec_memory_request_headroom"
                :min="0"
                :max="3"
                :step="0.05"
                class="w-full"
              />
            </NFormItem>
            <div class="sub-title">{{ t('page.forecast.modules.coeffGroupLimits') }}</div>
            <div class="group-note">{{ t('page.forecast.modules.coeffGroupLimitsNote') }}</div>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffCpuLimitFactor')" :doc="docOf('cpuLimitFactor')" />
              </template>
              <NInputNumber v-model:value="form.rec_cpu_limit_factor" :min="0" :max="5" :step="0.05" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel
                  :label="t('page.forecast.modules.coeffMemoryLimitFactor')"
                  :doc="docOf('memoryLimitFactor')"
                />
              </template>
              <NInputNumber
                v-model:value="form.rec_memory_limit_factor"
                :min="0"
                :max="5"
                :step="0.05"
                class="w-full"
              />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffLimitGuard')" :doc="docOf('limitGuard')" />
              </template>
              <NInputNumber v-model:value="form.rec_limit_guard" :min="0" :max="1" :step="0.05" class="w-full" />
            </NFormItem>
            <div class="sub-title">{{ t('page.forecast.modules.coeffGroupOther') }}</div>
            <div class="group-note">{{ t('page.forecast.modules.coeffGroupOtherNote') }}</div>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffShortfall')" :doc="docOf('shortfall')" />
              </template>
              <NInputNumber v-model:value="form.max_shortfall" :min="0.05" :max="0.9" :step="0.05" class="w-full" />
            </NFormItem>
          </NForm>
          <div class="live-note">{{ t('page.forecast.modules.coeffOomMoved') }}</div>
          <div class="coeff-matrix">
            <div class="order-title">{{ t('page.forecast.modules.matrixTitle') }}</div>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>{{ t('page.forecast.modules.matrixForecast') }}</th>
                  <th>{{ t('page.forecast.modules.matrixBoard') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in coeffMatrixRows" :key="row">
                  <th>{{ t(`page.forecast.modules.matrixRow_${row}`) }}</th>
                  <td>{{ t(`page.forecast.modules.matrixForecast_${row}`) }}</td>
                  <td>{{ t(`page.forecast.modules.matrixBoard_${row}`) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="coeff-preview">
            <div class="coeff-preview-title">{{ t('page.forecast.modules.coeffPreview') }}</div>
            <FormulaView :lines="coefficientLines" />
          </div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionSafety') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.sectionSafetyHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descSafety') }}</div>
          <NForm :model="form" label-placement="top">
            <NFormItem v-for="bound in resourceBounds" :key="bound.model">
              <template #label>
                <ParamLabel
                  v-if="boundDocs[bound.model]"
                  :label="t(`page.forecast.modules.${bound.label}`)"
                  :doc="docOf(boundDocs[bound.model] as ParamId)"
                />
                <span v-else class="inline-flex items-center gap-4px">
                  {{ t(`page.forecast.modules.${bound.label}`) }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-320px leading-22px">{{ t(`page.forecast.modules.${bound.hint}`) }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber
                v-model:value="form[bound.model]"
                :min="0"
                :precision="bound.model.endsWith('gpu') ? 0 : undefined"
                class="w-full"
              />
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
                <ParamLabel :label="t('page.forecast.modules.coeffFloorSwitch')" :doc="docOf('floor')" />
              </template>
              <StatusSelect v-model:value="floorOn" />
            </NFormItem>
            <NFormItem v-if="floorOn">
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.coeffFloor') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.coeffFloorHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber v-model:value="form.floor_ratio" :min="0.05" :max="1" :step="0.05" class="w-full" />
            </NFormItem>
          </NForm>
          <div class="live-note">{{ t('page.forecast.modules.floorValueNote') }}</div>
          <div v-if="floorOn" class="live-note">{{ floorNote }}</div>
          <div class="order-box">
            <div class="order-title">{{ t('page.forecast.modules.orderBoundsTitle') }}</div>
            <ol>
              <li v-for="n in 5" :key="n">{{ t(`page.forecast.modules.orderBounds${n}`) }}</li>
            </ol>
          </div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionOom') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.protectionHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descOom') }}</div>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.oomMemoryUplift')" :doc="docOf('oomUplift')" />
              </template>
              <NInputNumber v-model:value="form.oom_memory_uplift" :min="1" :max="3" :step="0.05" class="w-full" />
            </NFormItem>
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
                  {{ t('page.forecast.modules.oomWeightEnabled') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.oomWeightEnabledHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <StatusSelect v-model:value="form.oom_weight_enabled" />
            </NFormItem>
            <NFormItem v-if="form.oom_weight_enabled">
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.oomWeight') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.oomWeightHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber v-model:value="form.oom_weight" :min="0.01" :max="1" :step="0.05" class="w-full" />
            </NFormItem>
            <div class="sub-title">{{ t('page.forecast.modules.oomCoefTitle') }}</div>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffOomWorkingSet')" :doc="docOf('oomWorkingSet')" />
              </template>
              <NInputNumber
                v-model:value="form.oom_calc_working_set_ratio"
                :min="0.1"
                :max="5"
                :step="0.1"
                class="w-full"
              />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffOomLimit')" :doc="docOf('oomLimit')" />
              </template>
              <NInputNumber v-model:value="form.oom_calc_limit_ratio" :min="0.1" :max="5" :step="0.1" class="w-full" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <ParamLabel :label="t('page.forecast.modules.coeffOomHistory')" :doc="docOf('oomHistory')" />
              </template>
              <NInputNumber
                v-model:value="form.oom_calc_history_ratio"
                :min="0.1"
                :max="5"
                :step="0.1"
                class="w-full"
              />
            </NFormItem>
          </NForm>
          <div class="live-note">{{ t('page.forecast.modules.oomCoefDesc') }}</div>
          <div class="mb-6px mt-8px flex items-center gap-6px text-13px opacity-80">
            {{ t('page.forecast.modules.oomMetricsTitle') }}
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.oomMetricsHint') }}</div>
            </IconTooltip>
          </div>
          <ModuleMetrics
            ref="oomMetricsEditor"
            scope="oom"
            @preview="source => showPreview(editing?.id ?? null, source)"
          />
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionJvm') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descJvm') }}</div>
          <NForm :model="form" label-placement="top">
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
          <div class="live-note">
            {{
              form.jvm_heap_pressure > 0
                ? t('page.forecast.modules.jvmFormula')
                : t('page.forecast.modules.jvmDisabled')
            }}
          </div>
          <div class="mb-6px mt-8px flex items-center gap-6px text-13px opacity-80">
            {{ t('page.forecast.modules.jvmMetricsTitle') }}
          </div>
          <ModuleMetrics
            ref="jvmMetricsEditor"
            scope="jvm"
            @preview="source => showPreview(editing?.id ?? null, source)"
          />
        </section>
        <div class="mod-group">
          <div class="mod-group-title">{{ t('page.forecast.modules.groupSafety') }}</div>
          <div class="mod-group-desc">{{ t('page.forecast.modules.groupSafetyDesc') }}</div>
        </div>
        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionBounds') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descBounds') }}</div>
          <NForm :model="form" label-placement="top">
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
                  {{ t('page.forecast.modules.maxReplicasMode') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.maxReplicasModeHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NSelect v-model:value="form.max_replicas_mode" :options="maxModeOptions" />
            </NFormItem>
            <template v-if="form.max_replicas_mode === 'dynamic'">
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.forecast.modules.hardMaxReplicas') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.hardMaxReplicasHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NInputNumber v-model:value="form.hard_max_replicas" :min="0" :precision="0" class="w-full" />
              </NFormItem>
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.forecast.modules.expandStepRatio') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.expandStepRatioHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NInputNumber v-model:value="form.expand_step_ratio" :min="0.01" :max="5" :step="0.05" class="w-full" />
              </NFormItem>
            </template>
          </NForm>
          <div class="live-note">{{ boundsNote }}</div>
          <div class="order-box">
            <div class="order-title">{{ t('page.forecast.modules.replicaOrderTitle') }}</div>
            <ol>
              <li v-for="n in 6" :key="n">{{ t(`page.forecast.modules.replicaOrder${n}`) }}</li>
            </ol>
          </div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionPace') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.paceHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descPace') }}</div>
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
          <div class="live-note">{{ paceNote.up }}</div>
          <div class="live-note">{{ paceNote.down }}</div>
          <div class="live-note">{{ t('page.forecast.modules.paceOrder') }}</div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionFallback') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.modules.fallbackHint') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descFallbackNew') }}</div>
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
          </NForm>
          <div class="order-box">
            <div class="order-title">{{ t('page.forecast.modules.fallbackFlowTitle') }}</div>
            <ol>
              <li v-for="step in fallbackFlow" :key="step">{{ step }}</li>
            </ol>
          </div>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionApply') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descApply') }}</div>
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
        </section>

        <div class="mod-group">
          <div class="mod-group-title">{{ t('page.forecast.modules.groupStrategy') }}</div>
          <div class="mod-group-desc">{{ t('page.forecast.modules.groupStrategyDesc') }}</div>
        </div>
        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionPredict') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descPredict') }}</div>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.predictEnabled') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.predictEnabledHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <StatusSelect v-model:value="form.predict_enabled" />
            </NFormItem>
            <template v-if="form.predict_enabled">
              <NFormItem>
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.forecast.modules.predictMode') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.predictModeHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NSelect v-model:value="form.predict_mode" :options="predictModeOptions" />
              </NFormItem>
              <NFormItem v-if="form.predict_mode === 'fixed'">
                <template #label>
                  <span class="inline-flex items-center gap-4px">
                    {{ t('page.forecast.modules.predictAlgorithm') }}
                    <IconTooltip icon="mdi-help-circle" placement="top">
                      <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.predictAlgorithmHint') }}</div>
                    </IconTooltip>
                  </span>
                </template>
                <NSelect v-model:value="form.predict_algorithm" filterable :options="algorithmOptions" />
              </NFormItem>
            </template>
          </NForm>
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionPeriodsStrategy') }}</span>
            <IconTooltip icon="mdi-help-circle" placement="top">
              <div class="max-w-420px leading-22px">{{ t('page.forecast.periods.rules') }}</div>
            </IconTooltip>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descPeriodsStrategy') }}</div>
          <NForm :model="form" label-placement="top">
            <NFormItem :label="t('page.forecast.modules.timezone')">
              <NInput v-model:value="form.timezone" placeholder="UTC / Asia/Shanghai" />
            </NFormItem>
          </NForm>
          <PeriodEditor ref="periodEditor" />
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionTriggers') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descTriggers') }}</div>
          <TriggerEditor ref="triggerEditor" />
        </section>

        <section class="mod-sec">
          <div class="mod-sec-title">
            <span>{{ t('page.forecast.modules.sectionOrder') }}</span>
          </div>
          <div class="mod-sec-desc">{{ t('page.forecast.modules.descOrder') }}</div>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.fixedReplicasEnabled') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">
                      {{ t('page.forecast.modules.fixedReplicasEnabledHint') }}
                    </div>
                  </IconTooltip>
                </span>
              </template>
              <StatusSelect v-model:value="form.fixed_replicas_enabled" />
            </NFormItem>
            <NFormItem>
              <template #label>
                <span class="inline-flex items-center gap-4px">
                  {{ t('page.forecast.modules.fixedReplicas') }}
                  <IconTooltip icon="mdi-help-circle" placement="top">
                    <div class="max-w-360px leading-22px">{{ t('page.forecast.modules.fixedReplicasHint') }}</div>
                  </IconTooltip>
                </span>
              </template>
              <NInputNumber
                v-model:value="form.fixed_replicas"
                :min="0"
                :precision="0"
                :disabled="!form.fixed_replicas_enabled"
                class="w-full"
              />
            </NFormItem>
          </NForm>
          <div class="live-note">{{ fixedNote }}</div>
          <div class="order-box">
            <div class="order-title">{{ t('page.forecast.modules.orderTitle') }}</div>
            <ol>
              <li v-for="n in 5" :key="n">{{ t(`page.forecast.modules.order${n}`) }}</li>
            </ol>
          </div>
        </section>
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

    <!-- what the module needs, read before it is configured to act -->
    <ModuleParamsModal v-model:show="paramsShow" :module="paramsTarget" :system="paramsSystem" />
    <ModuleNeedModal
      :module-id="needTarget?.id ?? null"
      :name="needTarget?.name"
      @close="needTarget = undefined"
      @applied="load"
    />

    <!-- step result -->
  </div>
</template>

<style scoped>
.mod-sec {
  margin-bottom: 14px;
  padding: 10px 14px 4px;
  border: 1px solid rgba(128, 128, 128, 0.22);
  border-radius: 8px;
}

.mod-sec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.mod-sec-desc {
  margin: 2px 0 8px;
  font-size: 12px;
  line-height: 18px;
  opacity: 0.7;
}

/* the fields of a section sit side by side, as many as the width holds, so a section is not a column a screen high */
.mod-sec :deep(.n-form) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  column-gap: 16px;
  margin-top: 8px;
}

.sub-title {
  grid-column: 1 / -1;
  margin: 4px 0 6px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}

.cap-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  margin: 2px 0 10px;
}

.cap-note,
.live-note {
  margin: 4px 0 8px;
  font-size: 12px;
  line-height: 18px;
  opacity: 0.75;
}

.mod-group {
  margin: 4px 0 8px;
  padding: 6px 10px;
  border-left: 4px solid #2080f0;
  border-radius: 4px;
  background: rgba(32, 128, 240, 0.08);
}

.mod-group-title {
  font-size: 14px;
  font-weight: 700;
}

.mod-group-desc {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.75;
}

.order-box {
  margin: 4px 0 10px;
  padding: 8px 12px;
  border: 1px dashed rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  font-size: 12px;
  line-height: 20px;
}

.order-title {
  margin-bottom: 2px;
  font-weight: 600;
  opacity: 0.8;
}

.order-box ol {
  margin: 0;
  padding-left: 20px;
  list-style: decimal;
}

.coeff-preview {
  margin: 2px 0 10px;
}

.group-note {
  grid-column: 1 / -1;
  margin: -2px 0 6px;
  font-size: 12px;
  line-height: 18px;
  opacity: 0.7;
}

.coeff-matrix {
  margin: 4px 0 10px;
  padding: 8px 12px;
  border: 1px dashed rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  font-size: 12px;
  line-height: 20px;
  overflow-x: auto;
}

.coeff-matrix table {
  width: 100%;
  border-collapse: collapse;
}

.coeff-matrix th,
.coeff-matrix td {
  padding: 4px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  text-align: left;
  vertical-align: top;
}

.coeff-matrix thead th {
  border-top: 0;
  font-weight: 600;
  opacity: 0.8;
}

.coeff-matrix tbody th {
  white-space: nowrap;
  font-weight: 600;
}

.coeff-preview-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}
</style>
