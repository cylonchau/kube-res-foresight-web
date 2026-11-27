import { formatBytes, formatCores, formatDecimal, formatPercent } from './format.ts';

/**
 * Every parameter of a module as it is in force, in the groups module management has them, for the "Parameters" window: what each one is now, with the unit, and where the figure comes
 * from (the module's own, or the system setting a module follows where it leaves a figure at 0). It reads the module row only; nothing is worked out.
 */
export type ParamKind =
  | 'cpuMilli'
  | 'bytes'
  | 'count'
  | 'multiple'
  | 'share'
  | 'minutes'
  | 'seconds'
  | 'hours'
  | 'days'
  | 'text'
  | 'bool';

/** where the figure in force comes from: the module, the system setting (the module leaves it at 0 or has no such field), or the rule is off / not set */
export type ParamSource = 'module' | 'system' | 'off';

export interface ParamRow {
  key: string;
  /** the figure with its unit, already written */
  value: string;
  source: ParamSource;
}

export interface ParamGroup {
  key: string;
  rows: ParamRow[];
}

/** the settings of the system a module follows (the shares are 0 to 1 and over, 0 = not read) */
export interface SystemParams {
  p90: number;
  p95: number;
  p99: number;
  p90Low: number;
  p90High: number;
  p95Low: number;
  p95High: number;
  p99Low: number;
  p99High: number;
  limitFactor: number;
  limitGuard: number;
  sustain: number;
  throttle: number;
  baseline: number;
  severe: number;
  moderate: number;
}

export const EMPTY_SYSTEM: SystemParams = {
  p90: 0,
  p95: 0,
  p99: 0,
  p90Low: 0,
  p90High: 0,
  p95Low: 0,
  p95High: 0,
  p99Low: 0,
  p99High: 0,
  limitFactor: 0,
  limitGuard: 0,
  sustain: 0,
  throttle: 0,
  baseline: 0,
  severe: 0,
  moderate: 0
};

export interface ParamWords {
  /** unit words and the words of a value that is not a number: minutes, seconds, hours, days, on, off, not set, system */
  unit: (kind: 'minutes' | 'seconds' | 'hours' | 'days') => string;
  on: string;
  off: string;
  notSet: string;
  /** an enumerated value (a mode, a policy): its name */
  enumName: (field: string, value: string) => string;
}

/** a figure of a kind, written with its unit; 0 is "not set" for the kinds where 0 means that */
export function writeParam(kind: ParamKind, value: number | string | boolean, words: ParamWords): string {
  if (kind === 'bool') return value ? words.on : words.off;
  if (kind === 'text') return String(value || words.notSet);
  const n = Number(value) || 0;
  switch (kind) {
    case 'cpuMilli':
      return n > 0 ? formatCores(n / 1000, 2) : words.notSet;
    case 'bytes':
      return n > 0 ? formatBytes(n, 2) : words.notSet;
    case 'count':
      return n > 0 ? String(n) : words.notSet;
    case 'multiple':
      return n > 0 ? `× ${formatDecimal(n, 4)}` : words.notSet;
    case 'share':
      return n > 0 ? formatPercent(n, 1).replace(/\.0%$/, '%') : words.notSet;
    case 'minutes':
    case 'seconds':
    case 'hours':
    case 'days':
      return n > 0 ? `${n} ${words.unit(kind)}` : words.notSet;
    default:
      return String(value);
  }
}

type Module = Api.Forecast.Module;

interface Descriptor {
  field: keyof Module | string;
  kind: ParamKind;
  /** the system figure a module that leaves this at 0 follows */
  system?: keyof SystemParams;
  /** a figure that only the system has: always shown from it */
  systemOnly?: boolean;
  /** a figure where 0 is a value (not "not set") */
  zeroIsValue?: boolean;
  /** an enumerated value: the words name it */
  enumField?: boolean;
}

const GROUPS: Array<{ key: string; rows: Descriptor[] }> = [
  {
    key: 'current',
    rows: [
      { field: 'pod_cpu_request_milli', kind: 'cpuMilli' },
      { field: 'pod_memory_request_bytes', kind: 'bytes' },
      { field: 'limit_cpu_ratio', kind: 'multiple' },
      { field: 'limit_memory_ratio', kind: 'multiple' },
      { field: 'summary.actual_replicas', kind: 'count' },
      { field: 'summary.ready_replicas', kind: 'count' },
      { field: 'summary.cpu_milli', kind: 'cpuMilli' },
      { field: 'summary.memory_bytes', kind: 'bytes' },
      { field: 'summary.replicas', kind: 'count' }
    ]
  },
  {
    key: 'replicas',
    rows: [
      { field: 'decision_source', kind: 'text', enumField: true },
      { field: 'replica_mode', kind: 'text', enumField: true },
      { field: 'fixed_replicas_enabled', kind: 'bool' },
      { field: 'fixed_replicas', kind: 'count' },
      { field: 'min_replicas', kind: 'count' },
      { field: 'max_replicas', kind: 'count' },
      { field: 'min_cpu_milli', kind: 'cpuMilli' },
      { field: 'max_cpu_milli', kind: 'cpuMilli' },
      { field: 'min_memory_bytes', kind: 'bytes' },
      { field: 'max_memory_bytes', kind: 'bytes' }
    ]
  },
  {
    key: 'capacity',
    rows: [
      { field: 'capacity_mode', kind: 'text', enumField: true },
      { field: 'target_utilization', kind: 'share' },
      { field: 'pod_capacity_rps', kind: 'count' },
      { field: 'headroom_ratio', kind: 'multiple' }
    ]
  },
  {
    key: 'recommend',
    rows: [
      { field: 'rec_p90_target', kind: 'share', system: 'p90' },
      { field: 'rec_p95_target', kind: 'share', system: 'p95' },
      { field: 'rec_p99_target', kind: 'share', system: 'p99' },
      { field: 'p90_low', kind: 'share', system: 'p90Low', systemOnly: true },
      { field: 'p90_high', kind: 'share', system: 'p90High', systemOnly: true },
      { field: 'p95_low', kind: 'share', system: 'p95Low', systemOnly: true },
      { field: 'p95_high', kind: 'share', system: 'p95High', systemOnly: true },
      { field: 'p99_low', kind: 'share', system: 'p99Low', systemOnly: true },
      { field: 'p99_high', kind: 'share', system: 'p99High', systemOnly: true },
      { field: 'rec_sustain_minutes', kind: 'minutes', system: 'sustain' },
      { field: 'rec_cpu_request_headroom', kind: 'share' },
      { field: 'rec_memory_request_headroom', kind: 'share' },
      { field: 'rec_cpu_limit_factor', kind: 'multiple', system: 'limitFactor' },
      { field: 'rec_memory_limit_factor', kind: 'multiple', system: 'limitFactor' },
      { field: 'rec_limit_guard', kind: 'share', system: 'limitGuard' },
      { field: 'floor_ratio', kind: 'share' },
      { field: 'baseline', kind: 'days', system: 'baseline', systemOnly: true },
      { field: 'severe', kind: 'share', system: 'severe', systemOnly: true },
      { field: 'moderate', kind: 'share', system: 'moderate', systemOnly: true }
    ]
  },
  {
    key: 'oom',
    rows: [
      { field: 'oom_lookback_days', kind: 'days' },
      { field: 'oom_memory_uplift', kind: 'multiple' },
      { field: 'oom_weight_enabled', kind: 'bool' },
      { field: 'oom_weight', kind: 'share' },
      { field: 'oom_calc_working_set_ratio', kind: 'multiple' },
      { field: 'oom_calc_limit_ratio', kind: 'multiple' },
      { field: 'oom_calc_history_ratio', kind: 'multiple' },
      { field: 'jvm_heap_pressure', kind: 'share' },
      { field: 'throttle', kind: 'share', system: 'throttle', systemOnly: true }
    ]
  },
  {
    key: 'pace',
    rows: [
      { field: 'scale_up_max_step', kind: 'count' },
      { field: 'scale_down_max_step', kind: 'count' },
      { field: 'scale_up_cooldown_seconds', kind: 'seconds' },
      { field: 'scale_down_cooldown_seconds', kind: 'seconds' },
      { field: 'recover_cycles', kind: 'count' }
    ]
  },
  {
    key: 'safety',
    rows: [
      { field: 'bypass', kind: 'bool' },
      { field: 'fallback_cpu_milli', kind: 'cpuMilli' },
      { field: 'fallback_memory_bytes', kind: 'bytes' },
      { field: 'fallback_replicas', kind: 'count' },
      { field: 'ttl_seconds', kind: 'seconds' },
      { field: 'max_missing_ratio', kind: 'share' },
      { field: 'fallback_min_history_ratio', kind: 'share' },
      { field: 'min_score', kind: 'count', zeroIsValue: true },
      { field: 'max_shortfall', kind: 'share' }
    ]
  },
  {
    key: 'predict',
    rows: [
      { field: 'predict_enabled', kind: 'bool' },
      { field: 'predict_mode', kind: 'text', enumField: true },
      { field: 'predict_algorithm', kind: 'text' },
      { field: 'lookback_hours', kind: 'hours' },
      { field: 'horizon_minutes', kind: 'minutes' },
      { field: 'step_seconds', kind: 'seconds' },
      { field: 'window_steps', kind: 'count' },
      { field: 'run_interval_minutes', kind: 'minutes' },
      { field: 'min_points', kind: 'count' },
      { field: 'max_fill_steps', kind: 'count' },
      { field: 'timezone', kind: 'text' }
    ]
  }
];

/** the figures that a share of the system is written as 0 to 1 but a module stores as a percentage: none; the system's shares are already 0 to 1 */
function pick(m: Module, field: string): number | string | boolean | null | undefined {
  if (field.startsWith('summary.')) {
    const key = field.slice('summary.'.length) as keyof Api.Forecast.ModuleSummary;
    return m.summary ? (m.summary[key] as number | null) : null;
  }
  return (m as unknown as Record<string, number | string | boolean>)[field];
}

/** all the parameters of a module in the order of module management, each with its figure in force and where it comes from */
export function moduleParamGroups(m: Module, system: SystemParams, words: ParamWords): ParamGroup[] {
  return GROUPS.map(group => ({
    key: group.key,
    rows: group.rows.map<ParamRow>(d => {
      const raw = d.systemOnly ? 0 : pick(m, String(d.field));
      if (d.enumField)
        return { key: String(d.field), value: words.enumName(String(d.field), String(raw ?? '')), source: 'module' };
      if (raw === null || raw === undefined) {
        return { key: String(d.field), value: words.notSet, source: 'off' };
      }
      const own = Number(raw) || 0;
      if (d.kind !== 'bool' && d.kind !== 'text' && d.system && (d.systemOnly || own <= 0)) {
        const fromSystem = system[d.system];
        return {
          key: String(d.field),
          value: fromSystem > 0 ? writeParam(d.kind, fromSystem, words) : words.notSet,
          source: fromSystem > 0 ? 'system' : 'off'
        };
      }
      const value = writeParam(d.kind, raw as number | string | boolean, words);
      const off = d.kind === 'text' ? !raw : d.kind !== 'bool' && own <= 0 && !d.zeroIsValue;
      return { key: String(d.field), value: d.zeroIsValue && own === 0 ? '0' : value, source: off ? 'off' : 'module' };
    })
  }));
}
