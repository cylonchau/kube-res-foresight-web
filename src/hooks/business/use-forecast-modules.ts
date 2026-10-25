import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchGetForecastModules } from '@/service/api';

/** The forecast modules a list page filters by: the options for a select and the name of a module id. */
export function useForecastModules() {
  const modules = ref<Api.Forecast.Module[]>([]);

  const moduleOptions = computed(() =>
    modules.value.map(item => ({ label: `${item.name} (${item.namespace}/${item.workload})`, value: item.id }))
  );

  const moduleName = (id: number) => modules.value.find(item => item.id === id)?.name || String(id);

  async function loadModules() {
    const { data } = await fetchGetForecastModules({ page: 1, page_size: 200 });
    modules.value = data?.list || [];
    return modules.value;
  }

  return { modules, moduleOptions, moduleName, loadModules };
}

/** Time windows offered by every list and chart of the forecasting pages, in hours back from now. */
export const WINDOW_HOURS = [6, 24, 24 * 7, 24 * 30];

/** The options of the time window select, labelled "last N hours". One set serves every page, so filters read alike. */
export function useWindowOptions() {
  const { t } = useI18n();
  return computed(() =>
    WINDOW_HOURS.map(value => ({ label: t('page.forecast.history.lastHours', { hours: value }), value }))
  );
}

/** RFC3339 start of a "last N hours" window, for the `from` parameter of the list APIs. */
export function windowStart(hours: number | null | undefined) {
  if (!hours) return undefined;
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/** The kinds of metric that normally feed a resource and are forecast. */
export const FORECAST_METRICS: Api.Forecast.MetricKind[] = ['cpu', 'memory', 'gpu', 'rps'];

/** The kinds that give context or a pressure signal: the OOM and heap rules read some, the rest are optional. */
export const AUX_METRICS: Api.Forecast.AuxMetric[] = [
  'oom',
  'oom_working_set',
  'latency',
  'jvm_heap_used',
  'jvm_heap_max',
  'jvm_nonheap_used',
  'jvm_gc_pause',
  'jvm_threads',
  'k8s_cpu_requests',
  'k8s_cpu_limits',
  'k8s_mem_requests',
  'k8s_mem_limits',
  'k8s_cpu_throttle',
  'cpu_util',
  'memory_util',
  'gpu_util',
  'gpu_memory_total',
  'network_conn',
  'network_error'
];

/** Every kind a metric source can be made from. */
export const SOURCE_KINDS: Api.Forecast.MetricKind[] = [
  'cpu',
  'memory',
  'gpu',
  'gpu_memory',
  'rps',
  'replicas',
  'network_rx',
  'network_tx',
  'custom',
  ...AUX_METRICS
];

export const SOURCE_RESOURCES: Api.Forecast.SourceResource[] = ['cpu', 'memory', 'gpu', 'replicas', 'signal'];
export const SOURCE_STATS: Api.Forecast.SourceStat[] = ['avg', 'p50', 'p90', 'p95', 'p99', 'max', 'sum', 'last'];

/** The resource a kind normally feeds; mirrors model.DefaultResource. */
export function defaultResource(kind: string): Api.Forecast.SourceResource {
  switch (kind) {
    case 'cpu':
      return 'cpu';
    case 'memory':
      return 'memory';
    case 'gpu':
    case 'gpu_memory':
      return 'gpu';
    case 'rps':
      return 'replicas';
    default:
      return 'signal';
  }
}

/** Whether a kind is fixed to its own resource (cpu, memory and gpu kinds feed nothing else). */
export function resourceLocked(kind: string) {
  return ['cpu', 'memory', 'gpu', 'gpu_memory'].includes(kind);
}

/** Where a kind's values normally come from; mirrors model.DefaultBasis. */
export function defaultBasis(kind: string): Api.Forecast.SourceBasis {
  return [
    'oom',
    'oom_working_set',
    'replicas',
    'k8s_cpu_requests',
    'k8s_cpu_limits',
    'k8s_mem_requests',
    'k8s_mem_limits'
  ].includes(kind)
    ? 'history'
    : 'forecast';
}

/** The keys of the module's enabled metric sources. */
export function mappedMetrics(module: Api.Forecast.Module | undefined | null): string[] {
  return (module?.sources || []).filter(source => source.enabled).map(source => source.key);
}

/** The enabled sources whose values are forecast (the ones that have a history chart, backtests and predictions). */
export function forecastSources(module: Api.Forecast.Module | undefined | null) {
  return (module?.sources || []).filter(source => source.enabled && source.basis === 'forecast');
}

/**
 * The metric choices of a filter: the forecast sources of the chosen module, or, with no module chosen, every source
 * key any module has (a key means the same kind in every module, so one list serves).
 */
export function sourceMetricOptions(modules: Api.Forecast.Module[], moduleId: number | null | undefined) {
  const picked = moduleId ? modules.filter(item => item.id === moduleId) : modules;
  const seen = new Map<string, string>();
  for (const module of picked) {
    for (const source of forecastSources(module)) {
      if (!seen.has(source.key)) seen.set(source.key, moduleId ? source.name : source.key);
    }
  }
  return [...seen].map(([value, label]) => ({ label, value }));
}

/** The `from` and `to` parameters (RFC3339) of a [start, end] range picked with the time range field; empty when not set. */
export function rangeParams(range: [number, number] | null | undefined): { from?: string; to?: string } {
  if (!range) return {};
  return { from: new Date(range[0]).toISOString(), to: new Date(range[1]).toISOString() };
}

/** A range of the last N hours as the picker holds it, for the default of a page. */
export function lastHours(hours: number): [number, number] {
  const end = Date.now();
  return [end - hours * 3600 * 1000, end];
}
