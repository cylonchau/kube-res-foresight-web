import { request } from '../request';

const base = '/api/v1';

/** one module analysed live over a window, or over a custom range (RFC 3339), read from Prometheus, with its chart series, JVM metrics and the query of each metric */
export function fetchGetModuleOverprovision(id: number, params: { window?: string; from?: string; to?: string }) {
  // a module that cannot be read is told on the page, in its place, with a retry
  return request<Api.Overprovision.Detail>({
    url: `${base}/modules/${id}/overprovision`,
    method: 'get',
    params,
    headers: { 'X-Silent-Error': '1' }
  });
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
