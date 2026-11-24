import { amountText } from './amount.ts';
import { formatDecimal, formatPercent } from './format.ts';

/**
 * A formula written out for people: one line of tokens for each step, with the numbers, the names and the coefficients each in its own kind, so the page shows it
 * typeset (a name, an operator, a figure, the coefficient that was divided by) and never as one run of text. The figures are those the calculation was made with: the
 * use measured, and the coefficients of the module or of the system.
 */
export type TokenKind = 'name' | 'num' | 'op' | 'coef' | 'res' | 'text';

export interface Token {
  text: string;
  kind: TokenKind;
  /** what the token is (a hint when it is hovered): where a coefficient comes from */
  title?: string;
}

export interface FormulaLine {
  /** what the line says it is (a step): "Recommended Requests", "= with the figures" ... */
  label: string;
  tokens: Token[];
}

export const tok = (text: string, kind: TokenKind = 'text', title?: string): Token => ({ text, kind, title });
export const name = (text: string) => tok(text, 'name');
export const op = (text: string) => tok(text, 'op');
export const num = (text: string) => tok(text, 'num');
export const coef = (text: string, title?: string) => tok(text, 'coef', title);
export const res = (text: string) => tok(text, 'res');

/** tokens joined by a separator token */
export function joined(groups: Token[][], sep: Token): Token[] {
  return groups.flatMap((group, index) => (index ? [sep, ...group] : group));
}

const pct = (v: number) => formatDecimal(v, 4);

export interface FormulaWords {
  requests: string;
  limits: string;
  recommended: string;
  withFigures: string;
  floorOom: string;
  floorThrottle: string;
  coefSource: string;
  headroom: string;
  requestHeadroom: string;
  use: string;
}

/**
 * The recommendation of one resource of the dashboard as lines: the recommended Requests is the largest of what the P90, P95 and P99 use each ask for (the use divided
 * by the share of the Requests the percentile is wanted to take), and the recommended Limits is that or the P99 with its margin, whichever is more. The figures are
 * the ones of the result; the shares are those of the module (or the system, where the module sets none).
 */
export function recommendationLines(
  r: Api.Overprovision.Result,
  params: Api.Overprovision.Params,
  words: FormulaWords
): FormulaLine[] {
  const resource = r.resource === 'memory' ? 'memory' : 'cpu';
  const show = (v: number) => amountText(resource, v);
  const rows = [
    { name: 'P90', use: r.usage.p90, target: params.p90.target },
    { name: 'P95', use: r.usage.p95, target: params.p95.target },
    { name: 'P99', use: r.usage.p99, target: params.p99.target }
  ].filter(row => row.target > 0);
  if (!rows.length || !(r.usage.points > 0)) return [];
  const needs = rows.map(row => row.use / row.target);
  const top = Math.max(...needs);
  // each resource has its own margins: the Requests margin is the module's, the Limits margin the module's or else the system's
  const requestMargin = (resource === 'memory' ? params.memory_request_headroom : params.cpu_request_headroom) || 0;
  const limitFactor =
    (resource === 'memory' ? params.memory_limit_factor : params.cpu_limit_factor) || params.limit_factor;
  const withMargin = requestMargin > 0 ? top * (1 + requestMargin) : top;
  const marginTokens = (figure: boolean): Token[] =>
    requestMargin > 0
      ? [
          op('×'),
          op('('),
          num('1'),
          op('+'),
          coef(formatPercent(requestMargin, 0), words.requestHeadroom),
          op(')'),
          ...(figure ? [op('='), res(show(withMargin))] : [])
        ]
      : [];
  const lines: FormulaLine[] = [
    {
      label: words.requests,
      tokens: [
        name(words.recommended),
        op('='),
        name('max'),
        op('('),
        ...joined(
          rows.map(row => [name(row.name), op('÷'), coef(pct(row.target), words.coefSource)]),
          op(',')
        ),
        op(')'),
        ...marginTokens(false)
      ]
    },
    {
      label: words.withFigures,
      tokens: [
        op('='),
        name('max'),
        op('('),
        ...joined(
          rows.map((row, i) => [
            num(show(row.use)),
            op('÷'),
            coef(pct(row.target), words.coefSource),
            op('='),
            num(show(needs[i]))
          ]),
          op(',')
        ),
        op(')'),
        ...(requestMargin > 0 ? [op('='), num(show(top))] : []),
        ...(requestMargin > 0 ? marginTokens(true) : [op('='), res(show(top))])
      ]
    }
  ];
  if (r.reasons.includes('oom'))
    lines.push({
      label: words.floorOom,
      tokens: [
        name(words.recommended),
        op('≥'),
        name('max'),
        op('('),
        num(show(r.oom_working_set)),
        op('×'),
        coef(pct(params.oom_uplift), words.coefSource),
        op(','),
        num(show(r.request)),
        op(')')
      ]
    });
  if (r.reasons.includes('throttled'))
    lines.push({ label: words.floorThrottle, tokens: [name(words.recommended), op('≥'), num(show(r.request))] });
  if (r.suggested > 0) {
    const peak = r.usage.p99 * limitFactor;
    lines.push({
      label: words.limits,
      tokens: [
        name('Limits'),
        op('='),
        name('max'),
        op('('),
        name(words.recommended),
        op(','),
        name('P99'),
        op('×'),
        coef(formatPercent(limitFactor, 0), words.headroom),
        op(')'),
        op('='),
        name('max'),
        op('('),
        num(show(r.suggested)),
        op(','),
        num(show(peak)),
        op(')'),
        op('='),
        res(show(r.suggested_limit))
      ]
    });
  }
  return lines;
}

export interface CoefficientForm {
  headroom_ratio: number;
  target_utilization: number;
  rec_p90_target: number;
  rec_p95_target: number;
  rec_p99_target: number;
  rec_limit_guard: number;
  rec_cpu_request_headroom: number;
  rec_memory_request_headroom: number;
  rec_cpu_limit_factor: number;
  rec_memory_limit_factor: number;
  oom_memory_uplift: number;
  oom_calc_working_set_ratio: number;
  oom_calc_limit_ratio: number;
  oom_calc_history_ratio: number;
  floor_ratio: number;
}

export interface PreviewWords {
  cpu: string;
  memory: string;
  peak: string;
  headroom: string;
  reserve: string;
  oom: string;
  workingSet: string;
  limit: string;
  history: string;
  uplift: string;
  floor: string;
  statedRequest: string;
  board: string;
  boardLimits: string;
  cpuRequests: string;
  memoryRequests: string;
  cpuLimits: string;
  memoryLimits: string;
  requestHeadroom: string;
  limitFactor: string;
  system: string;
  keepsNeed: string;
}

/** a coefficient as it stands in the form, and a note when it is not set (it counts as 1) */
const value = (v: number, unset: number) => (v > 0 ? formatDecimal(v, 4) : formatDecimal(unset, 4));

/**
 * The formulas of module management, written with the coefficients the form holds right now: the lines change as a coefficient is typed, so what is set and what is
 * calculated with are the same figure (a coefficient is divided by where the line says "÷", never written into the code).
 */
export function moduleFormulaLines(f: CoefficientForm, w: PreviewWords): FormulaLine[] {
  const reserve = coef(value(f.target_utilization, 1), w.reserve);
  const headroom = coef(value(f.headroom_ratio, 1), w.headroom);
  const lines: FormulaLine[] = [
    { label: w.cpu, tokens: [name(w.cpu), op('='), name(w.peak), op('×'), headroom, op('÷'), reserve] },
    { label: w.memory, tokens: [name(w.memory), op('='), name(w.peak), op('×'), headroom, op('÷'), reserve] },
    {
      label: w.oom,
      tokens: [
        name(w.memory),
        op('≥'),
        name('max'),
        op('('),
        name(w.workingSet),
        op('×'),
        coef(value(f.oom_calc_working_set_ratio, 1), w.oom),
        op(','),
        name(w.limit),
        op('×'),
        coef(value(f.oom_calc_limit_ratio, 1), w.oom),
        op(','),
        name(w.history),
        op('×'),
        coef(value(f.oom_calc_history_ratio, 1), w.oom),
        op(')'),
        op('×'),
        coef(value(f.oom_memory_uplift, 1.2), w.uplift)
      ]
    }
  ];
  if (f.floor_ratio > 0)
    lines.push({
      label: w.floor,
      tokens: [
        name(`${w.cpu} / ${w.memory}`),
        op('≥'),
        name(w.statedRequest),
        op('×'),
        coef(formatDecimal(f.floor_ratio, 4), w.floor)
      ]
    });
  const target = (v: number) => coef(v > 0 ? formatDecimal(v, 4) : w.system, v > 0 ? w.reserve : w.system);
  const requests = (label: string, margin: number): FormulaLine => ({
    label,
    tokens: [
      name(label),
      op('='),
      name('max'),
      op('('),
      name('P90'),
      op('÷'),
      target(f.rec_p90_target),
      op(','),
      name('P95'),
      op('÷'),
      target(f.rec_p95_target),
      op(','),
      name('P99'),
      op('÷'),
      target(f.rec_p99_target),
      op(')'),
      ...(margin > 0
        ? [op('×'), op('('), num('1'), op('+'), coef(formatDecimal(margin, 4), w.requestHeadroom), op(')')]
        : [])
    ]
  });
  const limits = (label: string, requestsLabel: string, margin: number): FormulaLine => ({
    label,
    tokens: [
      name(label),
      op('='),
      name('max'),
      op('('),
      name(requestsLabel),
      op(','),
      name('P99'),
      op('×'),
      coef(margin > 0 ? formatDecimal(margin, 4) : w.system, margin > 0 ? w.limitFactor : w.system),
      op(')')
    ]
  });
  lines.push(requests(w.cpuRequests, f.rec_cpu_request_headroom));
  lines.push(requests(w.memoryRequests, f.rec_memory_request_headroom));
  lines.push(limits(w.cpuLimits, w.cpuRequests, f.rec_cpu_limit_factor));
  lines.push(limits(w.memoryLimits, w.memoryRequests, f.rec_memory_limit_factor));
  return lines;
}
