import { amountText } from './amount.ts';
import { formatPercent } from './format.ts';
import { adjustmentOf, adjustmentText } from './overprovision-verdict.ts';

/**
 * The two ways to bring the use of a module to where the bands want it, as the page, the AI question and the mail write them:
 *
 * - the replicas change and the Pod keeps the Requests it has (the replica plan of the platform): this comes first, because it touches no Pod spec;
 * - the replicas stay and the Requests and Limits of a Pod change (the recommendation of the platform).
 *
 * One colour means one thing wherever it is written: green is reasonable (nothing to change), orange is more than needed (fewer replicas, a Requests to lower), red is less
 * than needed (more replicas, a Requests to raise), blue is only information (limited by OOM or throttling, or not known).
 */
export type Level = 'ok' | 'warn' | 'bad' | 'info';

/** the colour of a direction of the replicas: fewer is what the over-provisioned give back (orange), more is what the under-provisioned lack (red) */
export const directionLevel = (direction: string): Level =>
  direction === 'in' ? 'warn' : direction === 'out' ? 'bad' : direction === 'same' ? 'ok' : 'info';

/** the colour of the verdict on a Requests */
export const statusLevel = (status: string | null | undefined): Level =>
  status === 'over' ? 'warn' : status === 'under' ? 'bad' : status === 'ok' ? 'ok' : 'info';

export interface ReplicaView {
  /** the replicas the cluster has now (0 = not known) and the number recommended (0 = no plan) */
  current: number;
  recommended: number;
  direction: Api.Overprovision.ReplicaPlan['direction'];
  /** recommended - current, and its share of the current */
  delta: number;
  share: number;
  primary: Api.Overprovision.ReplicaPlan['primary'];
  reasons: string[];
  formula: string;
  binding: string;
  /** the constraints the module sets on its replicas (module management) */
  limits: Api.Overprovision.ReplicaLimits;
  ready: number;
  /** where the replicas now come from, when they were measured (unix seconds) and the fewest and the most of the period */
  from: string;
  at: number;
  min: number;
  max: number;
}

/** the replicas of the cluster and the plan for them; null when the analysis has neither */
export function replicaView(detail: Api.Overprovision.Detail | null | undefined): ReplicaView | null {
  if (!detail) return null;
  const plan = (detail.recommend ?? detail.windows[0])?.replica_plan ?? null;
  const current = Math.max(detail.replicas ?? 0, 0);
  if (!plan && !(current > 0)) return null;
  return {
    current,
    recommended: plan && plan.needed > 0 ? plan.needed : 0,
    direction: plan?.direction ?? 'unknown',
    delta: plan?.delta ?? 0,
    share: plan?.share ?? 0,
    primary: plan?.primary ?? 'none',
    reasons: plan?.reasons ?? [],
    formula: plan?.formula ?? '',
    binding: plan?.binding ?? '',
    limits: plan?.limits ?? { min: 0, max: 0, scale_up_step: 0, scale_down_step: 0 },
    ready: detail.replicas_ready ?? 0,
    from: detail.replicas_from ?? '',
    at: detail.replicas_at ?? 0,
    min: detail.replicas_min ?? 0,
    max: detail.replicas_max ?? 0
  };
}

/** by how many replicas, and the share of the replicas now ("2" and "16.7%") */
export const replicaDeltaParts = (view: ReplicaView) => ({
  n: Math.abs(view.delta),
  share: formatPercent(view.share, 1)
});

const resourceOf = (r: Api.Overprovision.Result) => (r.resource === 'memory' ? 'memory' : 'cpu');

/** one row of the table of the two ways: the replicas and the Requests of one Pod, now and recommended */
export interface SchemeRow {
  key: 'replicas' | 'config';
  /** this is the way to take first */
  first: boolean;
  replicasNow: string;
  replicasRec: string;
  /** the Requests of one Pod ("-" when there is none) */
  cpuNow: string;
  cpuRec: string;
  memNow: string;
  memRec: string;
  level: Level;
}

/**
 * The rows of the table of the two ways. The first keeps the Pod: its Requests are the ones now and the replicas are the plan's. The second keeps the replicas: its
 * Requests are the recommended ones of the platform.
 */
export function schemeRows(detail: Api.Overprovision.Detail | null | undefined): SchemeRow[] {
  const view = replicaView(detail);
  if (!detail || !view) return [];
  const win = detail.recommend ?? detail.windows[0];
  const cpu = win?.cpu ?? null;
  const mem = win?.memory ?? null;
  const count = (n: number) => (n > 0 ? String(n) : '-');
  const nowOf = (r: Api.Overprovision.Result | null) => (r ? amountText(resourceOf(r), r.request) : '-');
  const recOf = (r: Api.Overprovision.Result | null) => (r ? amountText(resourceOf(r), r.suggested) : '-');
  const configLevel = (): Level => {
    const levels = [cpu, mem].filter(Boolean).map(r => statusLevel((r as Api.Overprovision.Result).status));
    if (levels.includes('bad')) return 'bad';
    if (levels.includes('warn')) return 'warn';
    return levels.includes('info') ? 'info' : 'ok';
  };
  return [
    {
      key: 'replicas',
      first: view.primary === 'replicas',
      replicasNow: count(view.current),
      replicasRec: count(view.recommended),
      cpuNow: nowOf(cpu),
      cpuRec: nowOf(cpu),
      memNow: nowOf(mem),
      memRec: nowOf(mem),
      level: directionLevel(view.direction)
    },
    {
      key: 'config',
      first: view.primary === 'config',
      replicasNow: count(view.current),
      replicasRec: count(view.current),
      cpuNow: nowOf(cpu),
      cpuRec: recOf(cpu),
      memNow: nowOf(mem),
      memRec: recOf(mem),
      level: configLevel()
    }
  ];
}

/** the amount of one Pod that a Requests is more or less than recommended, "0.5 cores (12.5%)", or '' when it cannot be said or there is nothing to change */
export function requestsGap(r: Api.Overprovision.Result | null | undefined): string {
  if (!r) return '';
  const a = adjustmentOf(r.request, r.suggested);
  return a && a.direction !== 'same' ? adjustmentText(resourceOf(r), a) : '';
}
