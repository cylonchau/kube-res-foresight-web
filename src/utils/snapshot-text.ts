/**
 * The reason a recommendation was kept as a snapshot comes from the server as a short English phrase (replicas 3 -> 5). The pages
 * are in Chinese, so the phrase is read back into a message key and its figures here instead of being shown as it is.
 */
export interface SnapshotReasonText {
  key: string;
  params: Record<string, string>;
}

const FIXED: Array<[RegExp, string]> = [
  [/^first recommendation of the module$/, 'why_first'],
  [/^CPU or memory changed$/, 'why_resources'],
  [/^GPU changed$/, 'why_gpu'],
  [/^source of a value changed$/, 'why_source'],
  [/^degraded$/, 'why_degraded'],
  [/^recovered from degradation$/, 'why_recovered'],
  [/^OOM protection changed$/, 'why_oom'],
  [/^replica ceiling changed$/, 'why_ceiling'],
  [/^periodic/, 'why_periodic'],
  [/^replicas, resources or algorithm changed/, 'why_backfill'],
  [/^the current recommendation$/, 'why_current']
];

const WITH_FIGURES: Array<[RegExp, string, string[]]> = [
  [/^mode (\S+) -> (\S+)$/, 'why_mode', ['from', 'to']],
  [/^replicas (\d+) -> (\d+)$/, 'why_replicas', ['from', 'to']],
  [/^Pod resource spec v(\d+) -> v(\d+)$/, 'why_spec', ['from', 'to']],
  [/^algorithm (\S+) -> (\S+)$/, 'why_algorithm', ['from', 'to']]
];

export function snapshotReasonText(reason: string | null | undefined): SnapshotReasonText {
  const text = (reason || '').trim();
  for (const [pattern, key] of FIXED) {
    if (pattern.test(text)) return { key, params: {} };
  }
  for (const [pattern, key, names] of WITH_FIGURES) {
    const match = pattern.exec(text);
    if (match) return { key, params: Object.fromEntries(names.map((name, index) => [name, match[index + 1]])) };
  }
  return { key: 'why_other', params: { text } };
}
