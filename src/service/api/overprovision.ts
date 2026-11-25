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
export function fetchGetOverprovisionCluster(datasourceId?: number) {
  // a cluster that cannot be read is told on the page, in its place, and not by a message over everything
  return request<Api.Overprovision.Cluster>({
    url: `${base}/overprovision/cluster`,
    method: 'get',
    params: { datasource_id: datasourceId },
    headers: { 'X-Silent-Error': '1' }
  });
}

/** the clusters the platform manages (the data sources that have cluster metric templates declared) and how many there are */
export function fetchGetOverprovisionClusters() {
  return request<Api.Overprovision.ClusterList>({
    url: `${base}/overprovision/clusters`,
    method: 'get',
    headers: { 'X-Silent-Error': '1' }
  });
}

/** the requests and limits of one Pod of every enabled module, each asked of Prometheus now */
export function fetchGetOverprovisionResources() {
  return request<Api.Overprovision.ResourceList>({
    url: `${base}/overprovision/resources`,
    method: 'get',
    headers: { 'X-Silent-Error': '1' }
  });
}

/** the periodic AI advice of the dashboard: the task, the newest report and the newest run (a failed one is seen beside the report before it) */
export function fetchGetAiAdvice() {
  return request<Api.Overprovision.AiAdvice>({
    url: `${base}/overprovision/ai-advice`,
    method: 'get',
    headers: { 'X-Silent-Error': '1' }
  });
}

/** switches the periodic advice on (one task for the platform, every day at 8) */
export function fetchEnableAiAdvice(lang: string) {
  return request<Api.Overprovision.AiAdvice>({
    url: `${base}/overprovision/ai-advice/enable`,
    method: 'post',
    data: { lang }
  });
}

/** queues a run of the advice task now */
export function fetchRunAiAdvice() {
  return request<string>({ url: `${base}/overprovision/ai-advice/run`, method: 'post' });
}
