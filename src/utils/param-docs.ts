import { formatDecimal } from './format.ts';
import { type FormulaLine, type Token, coef, name, num, op, res } from './formula.ts';

/**
 * The explanation of one parameter of module management: what it is, what it does, the formula it stands in, an example worked out with the figures the form holds right
 * now, and where it applies (which resource, which screen). The page shows it in the "?" of the parameter; nothing here is a figure of its own: every number of an example is
 * the one typed in the form (or, where the parameter is not set, the one that is then used), and the sample inputs (a peak of 4, a use of 3) are marked as samples.
 */
export interface ParamDoc {
  /** what the parameter is */
  definition: string;
  /** what it does in the calculation */
  role: string;
  /** the formula it stands in, one step to a line */
  formula: FormulaLine[];
  /** the same formula with figures put in, one step to a line */
  example: FormulaLine[];
  /** which resource and which result it applies to, and when it takes effect */
  scope: string;
}

/** the parameters of the form that have a document */
export type ParamId =
  | 'reserve'
  | 'headroom'
  | 'p90'
  | 'p95'
  | 'p99'
  | 'cpuRequestHeadroom'
  | 'memoryRequestHeadroom'
  | 'cpuLimitFactor'
  | 'memoryLimitFactor'
  | 'limitGuard'
  | 'sustain'
  | 'oomUplift'
  | 'oomWorkingSet'
  | 'oomLimit'
  | 'oomHistory'
  | 'floor'
  | 'shortfall'
  | 'minCpu'
  | 'minMemory';

/** the values of the form the documents read */
export interface DocForm {
  headroom_ratio: number;
  target_utilization: number;
  rec_p90_target: number;
  rec_p95_target: number;
  rec_p99_target: number;
  rec_limit_guard: number;
  rec_sustain_minutes: number;
  rec_cpu_request_headroom: number;
  rec_memory_request_headroom: number;
  rec_cpu_limit_factor: number;
  rec_memory_limit_factor: number;
  oom_memory_uplift: number;
  oom_calc_working_set_ratio: number;
  oom_calc_limit_ratio: number;
  oom_calc_history_ratio: number;
  floor_ratio: number;
  max_shortfall: number;
  min_cpu_milli: number;
  min_memory_mib: number;
  pod_cpu_request_milli: number;
  jvm_heap_pressure?: number;
}

/** what the document needs from the page: the text of a key, and the figures the system settings give where the module sets none */
export interface DocContext {
  t: (key: string, named?: Record<string, unknown>) => string;
  /** the system's share the percentile takes (0.8 = 80%) and the system's Limits margin and guard, for a parameter the module leaves at 0 */
  system: { p90: number; p95: number; p99: number; limitFactor: number; limitGuard: number; sustain: number };
}

const fx = (value: number, digits = 4) => formatDecimal(value, digits);
const times = op('×');
const over = op('÷');
const eq = op('=');

/** a coefficient of the module, or the figure that is used when it is not set (marked with the source) */
function used(value: number, unset: number, title: string): Token {
  return coef(fx(value > 0 ? value : unset), title);
}

/** a line of the document: the step and what it is made of */
const line = (label: string, ...tokens: Token[]): FormulaLine => ({ label, tokens });

/** the figure a percentile target takes: the module's, else the system's */
function targetOf(id: 'p90' | 'p95' | 'p99', f: DocForm, ctx: DocContext) {
  const own = { p90: f.rec_p90_target, p95: f.rec_p95_target, p99: f.rec_p99_target }[id];
  return own > 0 ? own : ctx.system[id];
}

/** a sample use of a Pod that the examples are worked on; it is a sample, not a figure of the module */
export const SAMPLE = {
  peak: 4,
  use: 3,
  total: 20,
  limit: 4,
  workingSet: 2,
  stated: 4000,
  memoryNeed: 8,
  /** a calculated need below what the floor holds, and a measured shortfall above the cap */
  calculated: 1500,
  shortfall: 0.7
};

/** the coefficient the examples of the floor use while the floor is off: what turning it on starts from */
export const FLOOR_START = 0.5;

/** the document of a parameter, with the examples worked out from the form */
export function paramDoc(id: ParamId, f: DocForm, ctx: DocContext): ParamDoc {
  const { t } = ctx;
  const n = (key: string) => t(`page.forecast.params.n.${key}`);
  const text = (key: string) => t(`page.forecast.params.${id}.${key}`);
  const reserve = f.target_utilization > 0 && f.target_utilization <= 1 ? f.target_utilization : 1;
  const headroom = f.headroom_ratio >= 1 ? f.headroom_ratio : 1;
  const base = { definition: text('def'), role: text('role'), scope: text('scope') };
  const sample = (value: number) => num(fx(value));

  switch (id) {
    case 'reserve':
      return {
        ...base,
        formula: [
          line(
            n('recommended'),
            name(n('recommendedValue')),
            eq,
            name(n('peak')),
            times,
            name(n('headroom')),
            over,
            name(n('reserve'))
          ),
          line(n('podCapacity'), name(n('podLoad')), eq, name(n('podRequest')), times, name(n('reserve')))
        ],
        example: [
          line(
            t('page.forecast.params.sample'),
            sample(SAMPLE.peak),
            times,
            coef(fx(headroom)),
            over,
            coef(fx(reserve)),
            eq,
            res(fx((SAMPLE.peak * headroom) / reserve))
          ),
          line(
            n('podCapacity'),
            sample(SAMPLE.stated),
            op('m'),
            times,
            coef(fx(reserve)),
            eq,
            res(`${fx(SAMPLE.stated * reserve, 0)} m`)
          )
        ]
      };
    case 'headroom':
      return {
        ...base,
        formula: [
          line(
            n('recommended'),
            name(n('recommendedValue')),
            eq,
            name(n('peak')),
            times,
            name(n('headroom')),
            over,
            name(n('reserve'))
          )
        ],
        example: [
          line(n('beforeReserve'), sample(SAMPLE.peak), times, coef(fx(headroom)), eq, res(fx(SAMPLE.peak * headroom))),
          line(
            n('afterReserve'),
            sample(SAMPLE.peak * headroom),
            over,
            coef(fx(reserve)),
            eq,
            res(fx((SAMPLE.peak * headroom) / reserve))
          )
        ]
      };
    case 'p90':
    case 'p95':
    case 'p99': {
      const target = targetOf(id, f, ctx);
      const label = id.toUpperCase();
      return {
        ...base,
        formula: [
          line(
            n('requests'),
            name(n('requestsNeed')),
            eq,
            name('max'),
            op('('),
            name('P90'),
            over,
            name(n('target')),
            op(','),
            name('P95'),
            over,
            name(n('target')),
            op(','),
            name('P99'),
            over,
            name(n('target')),
            op(')')
          )
        ],
        example: [line(label, sample(SAMPLE.use), over, coef(fx(target)), eq, res(fx(SAMPLE.use / target)))]
      };
    }
    case 'cpuRequestHeadroom':
    case 'memoryRequestHeadroom': {
      const h = id === 'cpuRequestHeadroom' ? f.rec_cpu_request_headroom : f.rec_memory_request_headroom;
      return {
        ...base,
        formula: [
          line(
            n('requests'),
            name(n('requestsRecommended')),
            eq,
            name(n('requestsNeed')),
            times,
            op('('),
            num('1'),
            op('+'),
            name(n('requestHeadroom')),
            op(')')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            sample(SAMPLE.peak),
            times,
            op('('),
            num('1'),
            op('+'),
            coef(fx(h)),
            op(')'),
            eq,
            res(fx(SAMPLE.peak * (1 + h)))
          )
        ]
      };
    }
    case 'cpuLimitFactor':
    case 'memoryLimitFactor': {
      const own = id === 'cpuLimitFactor' ? f.rec_cpu_limit_factor : f.rec_memory_limit_factor;
      const h = own > 0 ? own : ctx.system.limitFactor;
      return {
        ...base,
        formula: [
          line(
            n('limits'),
            name(n('limitsRecommended')),
            eq,
            name('max'),
            op('('),
            name(n('requestsRecommended')),
            op(','),
            name('P99'),
            times,
            name(n('limitFactor')),
            op(')')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            name('max'),
            op('('),
            sample(SAMPLE.peak),
            op(','),
            sample(SAMPLE.use),
            times,
            used(own, ctx.system.limitFactor, n('systemValue')),
            op(')'),
            eq,
            res(fx(Math.max(SAMPLE.peak, SAMPLE.use * h)))
          )
        ]
      };
    }
    case 'sustain': {
      const minutes = f.rec_sustain_minutes > 0 ? f.rec_sustain_minutes : ctx.system.sustain;
      // a peak of one point of 5 minutes (4 cores) in a use of 2 cores, held for the window
      const points = Math.max(Math.round(minutes / 5), 1);
      const held = (4 + 2 * (points - 1)) / points;
      return {
        ...base,
        formula: [
          line(n('sustained'), name(n('sustainedUse')), eq, name(n('mean')), op('('), name(n('lastMinutes')), op(')'))
        ],
        example: [
          line(
            n('sampleNeed'),
            op('('),
            sample(4),
            op('+'),
            sample(2),
            times,
            num(String(points - 1)),
            op(')'),
            over,
            num(String(points)),
            eq,
            res(`${fx(held)} ${t('page.forecast.params.n.cores')}`)
          ),
          line(
            n('longRun'),
            op('('),
            sample(4),
            times,
            num(String(points)),
            op(')'),
            over,
            num(String(points)),
            eq,
            res(`4 ${t('page.forecast.params.n.cores')}`)
          )
        ]
      };
    }
    case 'limitGuard': {
      const g = f.rec_limit_guard > 0 ? f.rec_limit_guard : ctx.system.limitGuard;
      return {
        ...base,
        formula: [
          line(
            n('replicas'),
            name(n('replicasNeed')),
            op('≥'),
            op('⌈'),
            name(n('p99Total')),
            over,
            op('('),
            name(n('limit')),
            times,
            name(n('guard')),
            op(')'),
            op('⌉')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            op('⌈'),
            sample(SAMPLE.total),
            over,
            op('('),
            sample(SAMPLE.limit),
            times,
            used(f.rec_limit_guard, ctx.system.limitGuard, n('systemValue')),
            op(')'),
            op('⌉'),
            eq,
            res(fx(Math.ceil(SAMPLE.total / (SAMPLE.limit * g)), 0))
          )
        ]
      };
    }
    case 'oomUplift':
    case 'oomWorkingSet':
    case 'oomLimit':
    case 'oomHistory': {
      const a = f.oom_calc_working_set_ratio || 1;
      const b = f.oom_calc_limit_ratio || 1;
      const c = f.oom_calc_history_ratio || 1;
      const u = f.oom_memory_uplift || 1;
      return {
        ...base,
        formula: [
          line(
            n('memory'),
            name(n('recommendedMemory')),
            op('≥'),
            name('max'),
            op('('),
            name(n('workingSet')),
            times,
            name(n('coefWorkingSet')),
            op(','),
            name(n('memoryLimit')),
            times,
            name(n('coefLimit')),
            op(','),
            name(n('history')),
            times,
            name(n('coefHistory')),
            op(')'),
            times,
            name(n('uplift'))
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            name('max'),
            op('('),
            sample(SAMPLE.workingSet),
            times,
            coef(fx(a)),
            op(')'),
            times,
            coef(fx(u)),
            eq,
            res(`${fx(SAMPLE.workingSet * a * u)} GiB`)
          ),
          line(
            n('other'),
            name('max'),
            op('('),
            sample(SAMPLE.workingSet * a),
            op(','),
            sample(SAMPLE.workingSet * 2 * b),
            op(','),
            sample(SAMPLE.workingSet * c),
            op(')'),
            times,
            coef(fx(u)),
            eq,
            res(`${fx(Math.max(SAMPLE.workingSet * a, SAMPLE.workingSet * 2 * b, SAMPLE.workingSet * c) * u)} GiB`)
          )
        ]
      };
    }
    case 'floor': {
      // off (0) the example still shows what the switch does: it starts from the first coefficient it takes
      const ratio = f.floor_ratio > 0 ? f.floor_ratio : FLOOR_START;
      return {
        ...base,
        formula: [
          line(
            n('recommended'),
            name(n('recommendedValue')),
            eq,
            name('max'),
            op('('),
            name(n('calculated')),
            op(','),
            name(n('statedRequest')),
            times,
            name(n('floorCoef')),
            op(')')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            sample(SAMPLE.stated),
            op('m'),
            times,
            coef(fx(ratio)),
            eq,
            res(`${fx(SAMPLE.stated * ratio, 0)} m`)
          ),
          line(
            n('applied'),
            name('max'),
            op('('),
            sample(SAMPLE.calculated),
            op('m'),
            op(','),
            sample(SAMPLE.stated * ratio),
            op('m'),
            op(')'),
            eq,
            res(`${fx(Math.max(SAMPLE.calculated, SAMPLE.stated * ratio), 0)} m`)
          )
        ]
      };
    }
    case 'shortfall': {
      const s = f.max_shortfall > 0 && f.max_shortfall < 1 ? f.max_shortfall : 0.5;
      const measured = SAMPLE.shortfall;
      const counted = Math.min(measured, s);
      return {
        ...base,
        formula: [
          line(
            n('scale'),
            name(n('forecastScale')),
            eq,
            num('1'),
            over,
            op('('),
            num('1'),
            op('−'),
            name('min'),
            op('('),
            name(n('measuredShortfall')),
            op(','),
            name(n('shortfallCap')),
            op(')'),
            op(')')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            num('1'),
            over,
            op('('),
            num('1'),
            op('−'),
            name('min'),
            op('('),
            sample(measured),
            op(','),
            coef(fx(s)),
            op(')'),
            op(')'),
            eq,
            res(`${fx(1 / (1 - counted))} ×`)
          ),
          line(
            n('uncapped'),
            num('1'),
            over,
            op('('),
            num('1'),
            op('−'),
            sample(measured),
            op(')'),
            eq,
            res(`${fx(1 / (1 - measured))} ×`)
          )
        ]
      };
    }
    case 'minCpu':
    case 'minMemory': {
      const floor = id === 'minCpu' ? f.min_cpu_milli : f.min_memory_mib;
      const unit = id === 'minCpu' ? 'm' : 'MiB';
      const low = floor > 0 ? Math.round(floor * 0.67) : 2000;
      return {
        ...base,
        formula: [
          line(
            n('applied'),
            name(n('finalValue')),
            eq,
            name('max'),
            op('('),
            name(n('calculated')),
            op(','),
            name(n('floorValue')),
            op(')')
          )
        ],
        example: [
          line(
            n('sampleNeed'),
            name('max'),
            op('('),
            sample(low),
            op(','),
            coef(`${fx(floor > 0 ? floor : 3000, 0)}`),
            op(')'),
            eq,
            res(`${fx(floor > 0 ? Math.max(low, floor) : 3000, 0)} ${unit}`)
          )
        ]
      };
    }
  }
}
