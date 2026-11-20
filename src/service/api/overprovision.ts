import { request } from '../request';

const base = '/api/v1';

/** the over-provisioning dashboard from the newest stored results of a window (one of 15m, 30m, 1h, 1d, 7d, 15d, 30d; the baseline when omitted) */
export function fetchGetOverprovision(window?: string) {
  return request<Api.Overprovision.Board>({ url: `${base}/overprovision`, method: 'get', params: { window } });
}

/** analyse the modules now (one module, or every enabled one) and store the results; it holds to the budget of a manual step */
export function fetchRunOverprovision(moduleId?: number) {
  return request<Api.Overprovision.RunResult>({
    url: `${base}/overprovision/run`,
    method: 'post',
    params: { module_id: moduleId },
    headers: { 'X-Long-Request': '1' }
  });
}

/** one module analysed live over a window, or over a custom range (RFC 3339), with its chart series, JVM metrics and stored history */
export function fetchGetModuleOverprovision(id: number, params: { window?: string; from?: string; to?: string }) {
  return request<Api.Overprovision.Detail>({ url: `${base}/modules/${id}/overprovision`, method: 'get', params });
}

/** what the cluster of the data source of a module has to give and has given out (nodes, allocatable, the requests of the Running Pods), read live */
export function fetchGetOverprovisionCluster(moduleId?: number) {
  // a cluster that cannot be read is told on the page, in its place, and not by a message over everything
  return request<Api.Overprovision.Cluster>({
    url: `${base}/overprovision/cluster`,
    method: 'get',
    params: { module_id: moduleId },
    headers: { 'X-Silent-Error': '1' }
  });
}

/** the P50, P90, P95, P99 and the maximum of the metrics of a module, asked of the Prometheus data source now (quantile_over_time over the PromQL of its mappings) */
export function fetchGetModulePrometheus(
  id: number,
  params: { window?: string; from?: string; to?: string; scope?: 'core' | 'more' }
) {
  return request<Api.Overprovision.PromStats>({
    url: `${base}/modules/${id}/overprovision/prometheus`,
    method: 'get',
    params,
    headers: { 'X-Silent-Error': '1', 'X-Long-Request': '1' }
  });
}
