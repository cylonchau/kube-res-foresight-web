/**
 * Amounts of CPU (cores) and memory (bytes) as whole numbers, for the table of the Requests and the Limits and for the question of the AI analysis, so the two
 * write the same figure. A figure under a core is whole millicores, from a core up whole cores; under a GiB it is whole MiB, from a GiB up whole GiB.
 * A recommendation is rounded up (never less than what the use needs), a figure that is read is rounded to the nearest.
 */
export type AmountResource = 'cpu' | 'memory';
export type AmountRounding = 'nearest' | 'up';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
/** a hair under an integer must not become the next one when it is rounded up (0.96 x 1000 is 960.0000000000001) */
const EPS = 1e-6;

const whole = (value: number, rounding: AmountRounding) =>
  rounding === 'up' ? Math.ceil(value - EPS) : Math.round(value);

/** the value rounded to its whole unit, in cores for the CPU and bytes for the memory; 0 for anything that is not a positive number */
export function wholeAmount(resource: AmountResource, value: number, rounding: AmountRounding = 'nearest'): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (resource === 'cpu') {
    const milli = whole(value * 1000, rounding);
    return milli >= 1000 ? whole(value, rounding) : milli / 1000;
  }
  const mib = whole(value / MIB, rounding);
  return mib >= 1024 ? whole(value / GIB, rounding) * GIB : mib * MIB;
}

/** the text of an amount that is already whole (see wholeAmount): "960 mCPU", "4 cores", "512 MiB", "7 GiB"; "-" for nothing */
export function amountText(resource: AmountResource, value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (resource === 'cpu') {
    if (value < 1) return `${Math.round(value * 1000)} mCPU`;
    const n = Math.round(value);
    return `${n} ${n === 1 ? 'core' : 'cores'}`;
  }
  if (value < GIB) return `${Math.round(value / MIB)} MiB`;
  return `${Math.round(value / GIB)} GiB`;
}

/** the value rounded, as text */
export function wholeText(resource: AmountResource, value: number, rounding: AmountRounding = 'nearest'): string {
  return amountText(resource, wholeAmount(resource, value, rounding));
}
