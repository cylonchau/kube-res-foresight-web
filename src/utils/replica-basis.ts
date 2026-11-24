import { amountText } from './amount.ts';
import { formatDecimal, formatPercent } from './format.ts';
import { type FormulaLine, coef, name, num, op, res } from './formula.ts';

/**
 * The basis of a recommended replica count as formulas, one step to a line: for each percentile the use of all the replicas divided by the Requests of a Pod and the share
 * the percentile is wanted to take (the coefficient of the module, or the system's where the module sets none), the guard of the Limits, and the count that is the largest of
 * them rounded up. The figures are the ones the plan of the platform was made with, so the page, the question to the AI and the mail show the same calculation.
 */
export interface ReplicaBasisWords {
  totalUse: string;
  requests: string;
  limits: string;
  guard: string;
  result: string;
  replicas: string;
  coefSource: string;
  guardSource: string;
  limitGuard: string;
  /** "Requests of one Pod", "Limits of one Pod" and the unit of a count of Pods, so a figure of cores, a share and a number of replicas are never taken for each other */
  podRequests: string;
  podLimits: string;
  replicasUnit: string;
}

export function replicaBasisLines(
  need: Api.Overprovision.ReplicaNeed,
  params: Api.Overprovision.Params,
  w: ReplicaBasisWords
): FormulaLine[] {
  // a plan of one percentile alone counts that one only (the parts say it); the three together count all of them
  const resource = need.resource === 'memory' ? 'memory' : 'cpu';
  const show = (v: number) => amountText(resource, v);
  const fx = (v: number) => formatDecimal(v, 2);
  const counted = need.parts.filter(part => part.counted !== false);
  const lines: FormulaLine[] = counted.map(part => ({
    label: part.name,
    tokens: [
      name(w.totalUse),
      num(show(part.total)),
      op('÷'),
      op('('),
      name(w.podRequests),
      num(show(need.request)),
      op('×'),
      coef(formatPercent(part.target, 0), w.coefSource),
      op(')'),
      op('='),
      res(`${fx(part.needed)} ${w.replicasUnit}`)
    ]
  }));
  const guard = params.peak_near_limit;
  if (need.limit > 0 && need.limit_needed > 0) {
    // the guard is of the peak as it was measured (raw), not of the use held for the sustain window
    const p99part = need.parts.find(part => part.name === 'P99');
    const p99 = p99part?.raw || p99part?.total || 0;
    lines.push({
      label: w.limitGuard,
      tokens: [
        name(`P99 ${w.totalUse}`),
        num(show(p99)),
        op('÷'),
        op('('),
        name(w.podLimits),
        num(show(need.limit)),
        op('×'),
        coef(formatPercent(guard, 0), w.guardSource),
        op(')'),
        op('='),
        res(`${fx(need.limit_needed)} ${w.replicasUnit}`)
      ]
    });
  }
  const values = [...counted.map(part => part.needed), ...(need.limit_needed > 0 ? [need.limit_needed] : [])];
  lines.push({
    label: w.result,
    tokens: [
      name(w.replicas),
      op('='),
      op('⌈'),
      name('max'),
      op('('),
      ...values.flatMap((v, i) => (i ? [op(','), num(fx(v))] : [num(fx(v))])),
      op(')'),
      op('⌉'),
      op('='),
      res(`${need.needed} ${w.replicasUnit}`)
    ]
  });
  return lines;
}
