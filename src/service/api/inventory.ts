import { request } from '../request';

const base = '/api/v1';

/** the nodes of the cluster as the newest report of the operator saw them */
export function fetchGetInventoryNodes() {
  return request<Api.Inventory.Nodes>({ url: `${base}/inventory/nodes`, method: 'get' });
}

/** the number of nodes, and of those ready, at every report of the last hours */
export function fetchGetInventoryNodeTrend(hours: number) {
  return request<Api.Inventory.NodeTrendPoint[]>({
    url: `${base}/inventory/nodes/trend`,
    method: 'get',
    params: { hours }
  });
}

/** what every node uses and has been asked for now, asked of the Prometheus data source; a source that cannot be read is told in place */
export function fetchGetInventoryNodeUsage() {
  return request<Api.Inventory.NodeUsage>({
    url: `${base}/inventory/nodes/usage`,
    method: 'get',
    headers: { 'X-Silent-Error': '1' }
  });
}

/** the workload of a module as the operator reported it: containers, Pods, HPA, the history of its configuration and the trend of its replicas */
export function fetchGetModuleInventory(id: number, hours: number) {
  return request<Api.Inventory.Workload>({ url: `${base}/modules/${id}/inventory`, method: 'get', params: { hours } });
}

/** the address of the Grafana and the dashboard in it, which the pages link to */
export function fetchGetGrafanaSettings() {
  return request<Api.Grafana.Settings>({
    url: `${base}/grafana/settings`,
    method: 'get',
    headers: { 'X-Silent-Error': '1' }
  });
}
