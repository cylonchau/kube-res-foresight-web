/**
 * What the resource dashboard recommends, as figures a module can take: for each recommendation (the Requests of the CPU and of the memory, the ratio of their Limits to their
 * Requests, the replicas) the fields of the module it can be put in, the first of them being the usual one. The figures are the dashboard's own (the analysis of the
 * recommendation period); nothing is worked out here but the unit a field is kept in (millicores, bytes, a count, a ratio).
 */

const MIB = 1024 * 1024;

/** the fields of a module a recommendation can be put in (the names of the API) */
export type ApplyField =
  | 'pod_cpu_request_milli'
  | 'min_cpu_milli'
  | 'max_cpu_milli'
  | 'fallback_cpu_milli'
  | 'pod_memory_request_bytes'
  | 'min_memory_bytes'
  | 'max_memory_bytes'
  | 'fallback_memory_bytes'
  | 'limit_cpu_ratio'
  | 'limit_memory_ratio'
  | 'min_replicas'
  | 'max_replicas'
  | 'fallback_replicas'
  | 'fixed_replicas';

export type ApplyKind = 'cpu' | 'memory' | 'ratio' | 'replicas';

export interface ApplyTarget {
  field: ApplyField;
  /** the value in the unit the module keeps the field in */
  value: number;
}

export interface ApplyItem {
  /** cpuRequests, memoryRequests, cpuLimits, memoryLimits, replicas, normalReplicas or peakReplicas */
  key: string;
  kind: ApplyKind;
  /** the recommendation as the dashboard says it: cores, bytes, a ratio or a count */
  recommended: number;
  /** where it can go; the first is the usual one */
  targets: ApplyTarget[];
}

const cpu = (cores: number) => Math.round(cores * 1000);
const memory = (bytes: number) => Math.max(Math.round(bytes / MIB), 1) * MIB;

function resultOf(window: Api.Overprovision.Window | null | undefined, resource: 'cpu' | 'memory') {
  const result = window?.[resource];
  return result && result.suggested > 0 ? result : null;
}

/** the recommendations of the analysis of a module, as items; none when the dashboard recommends nothing yet */
export function applyItems(detail: Api.Overprovision.Detail | null | undefined): ApplyItem[] {
  const window = detail?.recommend ?? detail?.windows?.[0];
  if (!window) return [];
  const items: ApplyItem[] = [];

  const c = resultOf(window, 'cpu');
  if (c) {
    const milli = cpu(c.suggested);
    items.push({
      key: 'cpuRequests',
      kind: 'cpu',
      recommended: c.suggested,
      targets: (['pod_cpu_request_milli', 'min_cpu_milli', 'max_cpu_milli', 'fallback_cpu_milli'] as const).map(
        field => ({ field, value: milli })
      )
    });
    if (c.suggested_limit >= c.suggested) {
      const ratio = Math.max(Math.round((c.suggested_limit / c.suggested) * 100) / 100, 1);
      items.push({
        key: 'cpuLimits',
        kind: 'ratio',
        recommended: c.suggested_limit,
        targets: [{ field: 'limit_cpu_ratio', value: ratio }]
      });
    }
  }

  const m = resultOf(window, 'memory');
  if (m) {
    const bytes = memory(m.suggested);
    items.push({
      key: 'memoryRequests',
      kind: 'memory',
      recommended: m.suggested,
      targets: (
        ['pod_memory_request_bytes', 'min_memory_bytes', 'max_memory_bytes', 'fallback_memory_bytes'] as const
      ).map(field => ({ field, value: bytes }))
    });
    if (m.suggested_limit >= m.suggested) {
      const ratio = Math.max(Math.round((m.suggested_limit / m.suggested) * 100) / 100, 1);
      items.push({
        key: 'memoryLimits',
        kind: 'ratio',
        recommended: m.suggested_limit,
        targets: [{ field: 'limit_memory_ratio', value: ratio }]
      });
    }
  }

  const plan = window.replica_plan;
  if (plan && plan.needed > 0) {
    const n = Math.round(plan.needed);
    items.push({
      key: 'replicas',
      kind: 'replicas',
      recommended: n,
      targets: (['fallback_replicas', 'min_replicas', 'max_replicas', 'fixed_replicas'] as const).map(field => ({
        field,
        value: n
      }))
    });
  }
  const profile = window.load_profile;
  if (profile && profile.normal > 0) {
    items.push({
      key: 'normalReplicas',
      kind: 'replicas',
      recommended: profile.normal,
      targets: [{ field: 'min_replicas', value: Math.round(profile.normal) }]
    });
  }
  if (profile && profile.peak > 0) {
    items.push({
      key: 'peakReplicas',
      kind: 'replicas',
      recommended: profile.peak,
      targets: [{ field: 'max_replicas', value: Math.round(profile.peak) }]
    });
  }
  return items;
}

/** what is sent to the module for the chosen targets: only these fields (turning the fixed replicas on is part of choosing them) */
export function payloadOf(
  chosen: ApplyTarget[]
): Partial<Record<ApplyField | 'fixed_replicas_enabled', number | boolean>> {
  const out: Partial<Record<ApplyField | 'fixed_replicas_enabled', number | boolean>> = {};
  for (const target of chosen) {
    out[target.field] = target.value;
    if (target.field === 'fixed_replicas') out.fixed_replicas_enabled = true;
  }
  return out;
}

/** the field of the module form a field of the API is typed in (the memory fields are in MiB there), and the value in its unit */
export function formField(target: ApplyTarget): { key: string; value: number } {
  if (target.field.endsWith('_memory_request_bytes') || target.field.endsWith('_memory_bytes')) {
    return { key: target.field.replace('_bytes', '_mib'), value: target.value / MIB };
  }
  return { key: target.field, value: target.value };
}
