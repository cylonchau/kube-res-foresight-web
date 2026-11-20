/**
 * The links between the resource dashboard of the platform and the dashboard of Grafana (P10 A3, A4). Grafana's variables are filled from the page
 * (`var-namespace`, `var-workload`, ...) and its time range is the window of the page; the other way, Grafana opens the page with the same names in the query.
 */

export interface GrafanaSettingsLike {
  base_url: string;
  dashboard_uid: string;
  cluster: string;
  configured: boolean;
}

export interface GrafanaTarget {
  namespace?: string;
  workload?: string;
  pod?: string;
  node?: string;
  container?: string;
}

/** a window of the page ('7d', '1h' ...) or a custom range (two RFC 3339 times) */
export interface GrafanaRange {
  window?: string;
  from?: string;
  to?: string;
}

const WINDOW = /^(\d+)([mhd])$/;

/** Grafana's `from` and `to` for the range of the page; the last 6 hours when the range is not known */
export function grafanaRange(range?: GrafanaRange): { from: string; to: string } {
  if (range?.from && range.to) {
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) return { from: String(from), to: String(to) };
  }
  if (range?.window && WINDOW.test(range.window)) return { from: `now-${range.window}`, to: 'now' };
  return { from: 'now-6h', to: 'now' };
}

/**
 * The address of the dashboard of Grafana for a target, or null while there is no Grafana address (the pages show no link then). A variable that is not
 * given is left out, so Grafana keeps its own default (All).
 */
export function grafanaUrl(
  settings: GrafanaSettingsLike | null | undefined,
  target: GrafanaTarget = {},
  range?: GrafanaRange
) {
  if (!settings?.configured || !settings.base_url) return null;
  const query = new URLSearchParams();
  query.set('orgId', '1');
  if (settings.cluster) query.set('var-cluster', settings.cluster);
  for (const key of ['namespace', 'workload', 'pod', 'node', 'container'] as const) {
    const value = target[key];
    if (value) query.set(`var-${key}`, value);
  }
  const { from, to } = grafanaRange(range);
  query.set('from', from);
  query.set('to', to);
  const base = settings.base_url.replace(/\/+$/, '');
  return `${base}/d/${encodeURIComponent(settings.dashboard_uid)}?${query.toString()}`;
}

/** what the page takes from the query when Grafana (or a bookmark) opens it */
export interface RouteSelection {
  namespace?: string;
  workload?: string;
  moduleId?: number;
  window?: string;
}

const WINDOWS = ['15m', '30m', '1h', '1d', '7d', '15d', '30d'];

function single(value: unknown): string | undefined {
  const text = Array.isArray(value) ? undefined : typeof value === 'string' ? value.trim() : undefined;
  // Grafana fills a variable that has "All" as `.*`, and several chosen values as `a|b`: neither names one thing
  if (!text || text === '.*' || text === '$__all' || /[|*]/.test(text)) return undefined;
  return text;
}

/** the namespace, workload, module and window of the query of the route; what does not name exactly one thing is ignored */
export function parseRouteSelection(query: Record<string, unknown>): RouteSelection {
  const out: RouteSelection = {};
  const namespace = single(query.namespace);
  const workload = single(query.workload);
  if (namespace) out.namespace = namespace;
  if (workload) out.workload = workload;
  const module = Number(single(query.module));
  if (Number.isInteger(module) && module > 0) out.moduleId = module;
  const window = single(query.window);
  if (window && WINDOWS.includes(window)) out.window = window;
  return out;
}
