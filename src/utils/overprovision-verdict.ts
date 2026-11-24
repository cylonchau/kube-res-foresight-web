import { amountText } from './amount.ts';
import { formatPercent } from './format.ts';

/**
 * What the analysis says of a Requests or a Limits in numbers: how much of it is more than the use needs (over-provisioned) or less (under-provisioned), as an amount
 * of one Pod and as a share of what it is now. A reasonable request says it too: "reasonable" alone is not an answer when the use supports a smaller one.
 */
export type Direction = 'over' | 'under' | 'same';

export interface Adjustment {
  direction: Direction;
  /** the amount of one Pod that is more (over) or less (under) than the recommendation; 0 for same */
  amount: number;
  /** the amount as a share of the figure now (0 to 1 and over) */
  share: number;
}

const resourceOf = (resource: string) => (resource === 'memory' ? 'memory' : 'cpu');

/**
 * One step of the rounding a recommendation is made with (CPU: 10 mCPU under a core, 50 mCPU from it; memory: 16 MiB under a GiB, 64 MiB from it): a recommended figure is
 * rounded up to it, so a figure that is a step above the one now is the rounding of the same number, not a shortage.
 */
export function roundingStep(resource: string, value: number): number {
  if (resource === 'memory') return value < 1024 ** 3 ? 16 * 1024 ** 2 : 64 * 1024 ** 2;
  return value < 1 ? 0.01 : 0.05;
}

/**
 * the figure now against the recommended one: positive amount = more than needed (can be given back), negative = short. With the resource named, a difference of no more than
 * one step of the rounding is no adjustment ("short by 64 MiB" of 6 GiB is 6.01 GiB rounded up to the step of 64 MiB).
 */
export function adjustmentOf(current: number, recommended: number, resource?: string): Adjustment | null {
  if (!(current > 0) || !(recommended > 0)) return null;
  const diff = current - recommended;
  // a difference under a thousandth of the figure is rounding, not an adjustment
  if (Math.abs(diff) < current * 0.001) return { direction: 'same', amount: 0, share: 0 };
  if (resource && Math.abs(diff) <= roundingStep(resource, current) + 1e-9)
    return { direction: 'same', amount: 0, share: 0 };
  return { direction: diff > 0 ? 'over' : 'under', amount: Math.abs(diff), share: Math.abs(diff) / current };
}

/** "0.5 cores (12.5%)" */
export function adjustmentText(resource: string, adjustment: Adjustment): string {
  return `${amountText(resourceOf(resource), adjustment.amount)} (${formatPercent(adjustment.share, 1)})`;
}

/** the use of a percentile against the request: "80.5%" or "-" */
export function shareText(share: number | undefined | null): string {
  return share === undefined || share === null || !(share > 0) ? '-' : formatPercent(share, 1);
}
