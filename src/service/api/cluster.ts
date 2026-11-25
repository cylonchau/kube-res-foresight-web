import { request } from '../request';

export function fetchGetClusters() {
  return request<Api.Cluster.ClusterList>({ url: '/api/v1/clusters', method: 'get' });
}

export function fetchCreateCluster(data: Api.Cluster.ClusterPayload) {
  return request<Api.Cluster.Cluster>({ url: '/api/v1/clusters', method: 'post', data });
}

export function fetchUpdateCluster(id: number, data: Api.Cluster.ClusterPayload) {
  return request<Api.Cluster.Cluster>({ url: `/api/v1/clusters/${id}`, method: 'put', data });
}

export function fetchDeleteCluster(id: number) {
  return request({ url: `/api/v1/clusters/${id}`, method: 'delete' });
}

/** the access keys that can be bound to a cluster, with the cluster each is bound to now */
export function fetchGetClusterKeys() {
  return request<Api.Cluster.KeyChoiceList>({ url: '/api/v1/cluster-keys', method: 'get' });
}

export function fetchGetClusterEvents(id: number, params: Api.Cluster.EventSearchParams) {
  return request<Api.Cluster.EventList>({ url: `/api/v1/clusters/${id}/events`, method: 'get', params });
}
