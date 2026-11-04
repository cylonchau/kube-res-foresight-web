import { formatBytes, formatDecimal } from '@/utils/format';

const BYTE_NAMES = ['bytes', 'byte', 'b'];

/**
 * The value axis of a chart in the unit of its metric. A size in bytes reads in the unit of its largest value, with the ticks on
 * round numbers of that unit (70 GiB, 75 GiB, 80 GiB) and not as 80000000000; anything else keeps plain decimals under the name of
 * its unit. `values` are the numbers the axis will show, which decide the unit and the distance between the ticks.
 */
export function valueAxisFor(unit: string, values: number[]) {
  if (!BYTE_NAMES.includes((unit || '').toLowerCase())) {
    return { name: unit, axisLabel: { formatter: (v: number) => formatDecimal(v, 3) } };
  }
  const axis: { name: string; axisLabel: { formatter: (v: number) => string }; interval?: number } = {
    name: '',
    axisLabel: { formatter: (v: number) => formatBytes(v, 2) }
  };
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return axis;
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const power = Math.min(5, Math.max(0, Math.floor(Math.log2(Math.max(Math.abs(low), Math.abs(high), 1)) / 10)));
  const base = 1024 ** power;
  const span = (high - low) / base;
  if (!(span > 0)) return axis;
  // about five ticks, each 1, 2 or 5 times a power of ten of the unit
  const rough = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find(factor => factor * magnitude >= rough) ?? 10) * magnitude;
  axis.interval = step * base;
  return axis;
}
