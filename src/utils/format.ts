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

/** A ratio in 0..1 as a percentage with `digits` decimals, two unless a page says otherwise (56.20%). */
export function formatPercent(ratio: number | null | undefined, digits = 2) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '-';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** A score or an accuracy: two decimals, never a long fraction. */
export function formatScore(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

/**
 * The value of one field of a configuration, written the one way every list writes it: CPU as a manifest does ('500m', '1.5 核'),
 * memory in Mi or Gi, a replica count and GPU count as whole numbers. A field that is not set is '' (empty), never 0 or '-'.
 */
export function formatResource(field: string, value: number | null | undefined, gpuWord = '卡') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  switch (field) {
    case 'cpu':
      return formatCpuMilli(value);
    case 'memory':
    case 'memory_floor':
      return formatMemoryBytes(value);
    case 'gpu':
      return `${formatDecimal(value, 0)} ${gpuWord}`;
    default:
      return formatDecimal(value, 0);
  }
}

const MIB = 1024 * 1024;

/**
 * A CPU request in millicores the way it is set and read: 420 -> '420m', 1500 -> '1.5 核', 2000 -> '2 核'. The unit word is a
 * parameter so a page in another language can pass its own.
 */
export function formatCpuMilli(milli: number | null | undefined, coreWord = '核') {
  if (milli === null || milli === undefined || !Number.isFinite(milli)) return '-';
  if (Math.abs(milli) < 1000) return `${formatDecimal(milli, 0)}m`;
  return `${formatDecimal(milli / 1000, 2)} ${coreWord}`;
}

/**
 * A memory request in bytes the way a manifest writes it: 335544320 -> '320Mi', 2147483648 -> '2Gi'. Whole MiB stay in Mi unless
 * they are an exact number of GiB; a value that is not a whole number of MiB shows one decimal of Mi, never raw bytes.
 */
export function formatMemoryBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  const mib = bytes / MIB;
  if (Number.isInteger(mib)) return mib !== 0 && mib % 1024 === 0 ? `${mib / 1024}Gi` : `${mib}Mi`;
  return `${formatDecimal(mib, 1)}Mi`;
}
