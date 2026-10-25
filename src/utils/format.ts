/**
 * Number and resource formatting shared by every list, chart and detail of the forecasting pages: at most three decimals,
 * and a resource in the unit a person reads (64 MiB, not 67108864 bytes; 250 mCPU or 1.5 cores).
 */

/** A number with at most `digits` decimals and no trailing zeros; '-' for a missing or non-finite value. */
export function formatDecimal(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

/** Bytes in the largest binary unit that keeps the number at or above 1: 67108864 -> '64 MiB'. */
export function formatBytes(bytes: number | null | undefined, digits = 3) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatDecimal(bytes < 0 ? -value : value, digits)} ${BYTE_UNITS[unit]}`;
}

/** CPU given in cores: below one core it reads in mCPU (0.25 -> '250 mCPU'), otherwise in cores ('1.5 cores'). */
export function formatCores(cores: number | null | undefined, digits = 3) {
  if (cores === null || cores === undefined || !Number.isFinite(cores)) return '-';
  if (Math.abs(cores) < 1 && cores !== 0) return `${formatDecimal(cores * 1000, 0)} mCPU`;
  return `${formatDecimal(cores, digits)} ${Math.abs(cores) === 1 ? 'core' : 'cores'}`;
}

/** CPU given in millicores (a Pod request or limit). */
export function formatMilli(milli: number | null | undefined) {
  if (milli === null || milli === undefined || !Number.isFinite(milli)) return '-';
  if (Math.abs(milli) >= 1000) return formatCores(milli / 1000);
  return `${formatDecimal(milli, 0)} mCPU`;
}

/**
 * A metric value with its unit as the platform stores it (cores, bytes, requests/s, ...): cores and bytes are converted
 * to a readable unit, anything else keeps its unit and three decimals.
 */
export function formatMetric(value: number | null | undefined, unit?: string | null, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  switch ((unit || '').toLowerCase()) {
    case 'cores':
    case 'core':
      return formatCores(value, digits);
    case 'bytes':
    case 'byte':
    case 'b':
      return formatBytes(value, digits);
    case 'millicores':
    case 'm':
      return formatMilli(value);
    case '':
    case 'value':
      return formatDecimal(value, digits);
    default:
      return `${formatDecimal(value, digits)} ${unit}`;
  }
}

/** A ratio in 0..1 as a percentage with at most `digits` decimals. */
export function formatPercent(ratio: number | null | undefined, digits = 1) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '-';
  return `${formatDecimal(ratio * 100, digits)}%`;
}
