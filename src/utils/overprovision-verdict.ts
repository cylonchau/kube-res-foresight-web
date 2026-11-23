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

/** the figure now against the recommended one: positive amount = more than needed (can be given back), negative = short */
export function adjustmentOf(current: number, recommended: number): Adjustment | null {
  if (!(current > 0) || !(recommended > 0)) return null;
  const diff = current - recommended;
  // a difference under a thousandth of the figure is rounding, not an adjustment
  if (Math.abs(diff) < current * 0.001) return { direction: 'same', amount: 0, share: 0 };
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
