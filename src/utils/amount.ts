import { formatBytes, formatCores } from './format.ts';

/**
 * The figures of the Requests and the Limits as they are: the value Prometheus gave (and the one the platform recommends, which the platform has already rounded up to
 * a figure a Pod spec can say) with at most two decimals and no trailing zeros, so a Requests of 4 cores is "4 cores" and a Limits of 16 GiB is "16 GiB". Nothing is
 * rounded to a whole core or GiB here: the page must show what the spec says. The table of the page and the question of the AI analysis write the same figure.
 */
export type AmountResource = 'cpu' | 'memory';

/** the text of an amount of CPU (cores) or memory (bytes): "250 mCPU", "4 cores", "512 MiB", "9.94 GiB"; "-" for anything that is not a positive number */
export function amountText(resource: AmountResource, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '-';
  return resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);
}

/** the amount of one Pod times the replicas, as text ("-" when either is missing) */
export function totalText(resource: AmountResource, value: number | null | undefined, replicas: number): string {
  if (!(replicas > 0)) return '-';
  return amountText(resource, (value ?? 0) * replicas);
}

/**
 * How many Pods the figure of all the replicas is of: the Pods that Prometheus summed (the total divided by the figure of one Pod), which is not always the ready replicas
 * (a Pod that is still starting has its Requests and is not ready); the ready replicas when Prometheus gave no total.
 */
export function podsOf(pod: number, total: number | undefined, replicas: number): number {
  if (pod > 0 && total && total > 0) {
    const n = Math.round(total / pod);
    if (n >= 1) return n;
  }
  return Math.max(replicas, 0);
}

/** the figure of all the replicas: what Prometheus summed when it gave a total, else the figure of one Pod times the ready replicas */
export function allText(
  resource: AmountResource,
  pod: number | null | undefined,
  total: number | undefined,
  replicas: number
): string {
  if (total && total > 0) return amountText(resource, total);
  return totalText(resource, pod, replicas);
}
