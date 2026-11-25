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

export function fetchGetClusterChanges(id: number, params: Api.Cluster.ChangeSearchParams) {
  return request<Api.Cluster.ChangeList>({ url: `/api/v1/clusters/${id}/changes`, method: 'get', params });
}

/** one change with the events about its object around that time and the changes of other objects tied to it */
export function fetchGetClusterChange(id: number, changeId: number) {
  return request<Api.Cluster.ChangeExplanation>({ url: `/api/v1/clusters/${id}/changes/${changeId}`, method: 'get' });
}
