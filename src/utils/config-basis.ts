import { amountText } from './amount.ts';
import { formatDecimal, formatPercent } from './format.ts';
import { type FormulaLine, type Token, coef, name, num, op, res } from './formula.ts';

/**
 * The basis of the recommended Requests and Limits of one Pod (the way where the replicas stay), one step to a line: what each percentile of the use of ONE Pod asks
 * for (the use divided by the share the percentile is wanted to take), the largest of them with the margin, the floors of an OOM kill and of throttling, the rounding to a
 * figure a spec can say, and the Limits. A caliber (P90, P95 or P99) lists that percentile alone; "all" lists the three and takes the largest. Units stay apart: the use
 * and the Requests are cores or bytes, the shares are percentages, and nothing here is a count of replicas.
 */
export type Caliber = 'all' | 'P90' | 'P95' | 'P99';

export interface ConfigBasisWords {
  podUse: string;
  largest: string;
  rounded: string;
  requests: string;
  limits: string;
  limitsLine: string;
  floorOom: string;
  floorThrottle: string;
  coefSource: string;
  requestHeadroom: string;
  limitFactor: string;
  current: string;
}

export function configBasisLines(
  r: Api.Overprovision.Result,
  params: Api.Overprovision.Params,
  caliber: Caliber,
  w: ConfigBasisWords
): FormulaLine[] {
  const resource = r.resource === 'memory' ? 'memory' : 'cpu';
  const show = (v: number) => amountText(resource, v);
  const pct = (v: number) => formatPercent(v, 0);
  const candidates = (r.candidates ?? []).filter(c => caliber === 'all' || c.name === caliber);
  if (!candidates.length) return [];
  const requestMargin = (resource === 'memory' ? params.memory_request_headroom : params.cpu_request_headroom) || 0;
  const limitFactor =
    (resource === 'memory' ? params.memory_limit_factor : params.cpu_limit_factor) || params.limit_factor;
  const lines: FormulaLine[] = candidates.map(c => ({
    label: c.name,
    tokens: [
      name(w.podUse),
      num(show(c.use)),
      op('÷'),
      coef(pct(c.target), w.coefSource),
      op('='),
      res(show(c.use / c.target))
    ]
  }));

  const decides = candidates.reduce((top, c) => (c.needed > top.needed ? c : top), candidates[0]);
  const needs = candidates.map(c => c.use / c.target);
  const needList: Token[] = needs.flatMap((v, i) => (i ? [op(','), num(show(v))] : [num(show(v))]));
  const largest: Token[] = [
    name(w.requests),
    op('='),
    ...(candidates.length > 1 ? [name('max'), op('('), ...needList, op(')')] : needList),
    ...(requestMargin > 0
      ? [op('×'), op('('), num('1'), op('+'), coef(pct(requestMargin), w.requestHeadroom), op(')')]
      : []),
    op('='),
    res(show(decides.needed))
  ];
  // one percentile with no margin has nothing to take the largest of: the next line (rounded) says it all
  if (candidates.length > 1 || requestMargin > 0) lines.push({ label: w.largest, tokens: largest });

  let floor = 0;
  if (r.reasons.includes('oom')) {
    floor = Math.max(r.oom_working_set * params.oom_uplift, r.request);
    lines.push({
      label: w.floorOom,
      tokens: [
        name(w.requests),
        op('≥'),
        name('max'),
        op('('),
        num(show(r.oom_working_set)),
        op('×'),
        coef(formatDecimal(params.oom_uplift, 4), w.coefSource),
        op(','),
        name(w.current),
        num(show(r.request)),
        op(')'),
        op('='),
        res(show(floor))
      ]
    });
  }
  if (r.reasons.includes('throttled')) {
    floor = Math.max(floor, r.request);
    lines.push({ label: w.floorThrottle, tokens: [name(w.requests), op('≥'), name(w.current), num(show(r.request))] });
  }
  const point =
    caliber === 'all'
      ? { suggested: r.needed, limit: r.suggested_limit }
      : { suggested: decides.suggested, limit: decides.suggested_limit };
  lines.push({
    label: w.rounded,
    tokens: [
      name(w.requests),
      op('='),
      op('⌈'),
      name('max'),
      op('('),
      num(show(decides.needed)),
      ...(floor > 0 ? [op(','), num(show(floor))] : []),
      op(')'),
      op('⌉'),
      op('='),
      res(show(point.suggested))
    ]
  });
  // the Limits is made of the Requests that is recommended in the end (a Requests the verdict keeps at what it is now is the one it counts) and of the raw P99, not the
  // sustained one; it is rounded up like the Requests
  const requestsOfLimits = caliber === 'all' && r.suggested > 0 ? r.suggested : point.suggested;
  lines.push({
    label: w.limitsLine,
    tokens: [
      name(w.limits),
      op('='),
      op('⌈'),
      name('max'),
      op('('),
      num(show(requestsOfLimits)),
      op(','),
      name('P99'),
      num(show(r.usage.p99)),
      op('×'),
      coef(pct(limitFactor), w.limitFactor),
      op(')'),
      op('⌉'),
      op('='),
      res(show(point.limit))
    ]
  });
  return lines;
}
