/**
 * The figures behind the "normal and busy hours" block of the module resource dashboard: how long a bar is, what colour a cell is, and what the capacity of the normal replicas is
 * made of. They are kept apart from the component so that the proportions can be tested: a bar is as long as its figure, from zero, and a busier hour is never drawn shorter.
 */

/** The share of the full height (0 to 100) a bar takes: its figure over the largest one, from zero. A figure of 0 is no bar; a bar is never given length it does not have. */
export function barPercent(value: number, largest: number): number {
  if (!(value > 0) || !(largest > 0)) return 0;
  return Math.min((value / largest) * 100, 100);
}

/** The colours: small is green, large is orange (and red a long way above), no data is grey. */
export const LOAD_COLORS = {
  normal: 'rgb(24, 160, 88)',
  high: 'rgb(240, 140, 40)',
  none: 'rgba(128, 128, 128, 0.25)'
} as const;

/**
 * The colour of a cell of use: ratio is the use over what the normal replicas carry, negative where there is no data. Up to the capacity it is green, the deeper the closer to
 * it; above the capacity it is orange and goes to red at twice the capacity.
 */
export function loadColor(ratio: number): string {
  if (ratio < 0 || !Number.isFinite(ratio)) return 'rgba(128, 128, 128, 0.15)';
  if (ratio > 1) {
    const over = Math.min(ratio - 1, 1);
    return `rgba(240, ${Math.round(140 - over * 90)}, 40, ${(0.65 + over * 0.35).toFixed(2)})`;
  }
  return `rgba(24, 160, 88, ${(0.12 + 0.6 * ratio).toFixed(2)})`;
}

/**
 * What the normal replicas carry, taken apart: the capacity is the normal count of replicas, times the Requests of one Pod, times the share of the Requests the use is wanted to take
 * (the target). The Requests of one Pod is not sent: it is worked back from the capacity, which is how the platform made it.
 */
export function capacityParts(capacity: number, normal: number, target: number) {
  if (!(capacity > 0) || !(normal > 0) || !(target > 0)) return null;
  return { normal, request: capacity / (normal * target), target, capacity };
}
