/**
 * Percentiles are never a fixed list: a statistic is "p<number>" for any number above 0 and below 100 (p40, p41, p95, p99.9), kept in at
 * most 8 characters. The same rule as the platform's (pkg/multimetric).
 */
const LEVEL = /^p(\d{1,2}(?:\.\d+)?)$/;
const MAX_LENGTH = 8;

/** whether the text is a percentile statistic the platform accepts */
export function isPercentileStat(value: string): boolean {
  const match = LEVEL.exec(value);
  if (!match || value.length > MAX_LENGTH) return false;
  const n = Number(match[1]);
  return n > 0 && n < 100;
}

/** a level in (0, 1) as the name people use: 0.9 is "P90", 0.41 is "P41", 0.995 is "P99.5" */
export function percentName(level?: number | null, fallback = 0.9): string {
  const q = level && level > 0 && level < 1 ? level : fallback;
  return `P${Math.round(q * 1000) / 10}`;
}
