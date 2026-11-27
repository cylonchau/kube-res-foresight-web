import { request } from '../request';

const base = '/api/v1/node-pools';

export function fetchGetNodePools(params?: Api.NodePool.SearchParams) {
  return request<Api.NodePool.PoolList>({ url: base, method: 'get', params });
}

export function fetchCreateNodePool(data: Api.NodePool.Payload) {
  return request<Api.NodePool.Pool>({ url: base, method: 'post', data });
}

export function fetchUpdateNodePool(id: number, data: Api.NodePool.Payload) {
  return request<Api.NodePool.Pool>({ url: `${base}/${id}`, method: 'put', data });
}

export function fetchDeleteNodePool(id: number) {
  return request({ url: `${base}/${id}`, method: 'delete' });
}

export function fetchBatchDeleteNodePools(ids: number[]) {
  return request({ url: `${base}/batch-delete`, method: 'post', data: { ids } });
}
