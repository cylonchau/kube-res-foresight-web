import { request } from '../request';

export function fetchGetDatasources(params?: Api.Datasource.DatasourceSearchParams) {
  return request<Api.Datasource.DatasourceList>({ url: '/api/v1/datasources', method: 'get', params });
}

export function fetchGetDatasourceOptions() {
  return request<Api.Datasource.DatasourceOption[]>({ url: '/api/v1/datasources/options', method: 'get' });
}

export function fetchCreateDatasource(data: Api.Datasource.DatasourcePayload) {
  return request<Api.Datasource.Datasource>({ url: '/api/v1/datasources', method: 'post', data });
}

export function fetchUpdateDatasource(id: number, data: Api.Datasource.DatasourcePayload) {
  return request<Api.Datasource.Datasource>({ url: `/api/v1/datasources/${id}`, method: 'put', data });
}

export function fetchDeleteDatasource(id: number) {
  return request({ url: `/api/v1/datasources/${id}`, method: 'delete' });
}

export function fetchBatchDeleteDatasources(ids: number[]) {
  return request({ url: '/api/v1/datasources/batch-delete', method: 'post', data: { ids } });
}

export function fetchTestDatasource(id: number) {
  return request<Api.Datasource.TestResult>({ url: `/api/v1/datasources/${id}/test`, method: 'post' });
}

export function fetchGetMetricMappings(params?: Api.Datasource.MetricMappingSearchParams) {
  return request<Api.Datasource.MetricMappingList>({ url: '/api/v1/metric-mappings', method: 'get', params });
}

export function fetchCreateMetricMapping(data: Api.Datasource.MetricMappingPayload) {
  return request<Api.Datasource.MetricMapping>({ url: '/api/v1/metric-mappings', method: 'post', data });
}

export function fetchUpdateMetricMapping(id: number, data: Api.Datasource.MetricMappingPayload) {
  return request<Api.Datasource.MetricMapping>({ url: `/api/v1/metric-mappings/${id}`, method: 'put', data });
}

export function fetchDeleteMetricMapping(id: number) {
  return request({ url: `/api/v1/metric-mappings/${id}`, method: 'delete' });
}

export function fetchBatchDeleteMetricMappings(ids: number[]) {
  return request({ url: '/api/v1/metric-mappings/batch-delete', method: 'post', data: { ids } });
}

export function fetchGetMetricCatalog() {
  return request<Api.Datasource.MetricCatalog>({ url: '/api/v1/metrics/catalog', method: 'get' });
}

export function fetchGetMetricPresets(params?: { keyword?: string; metric?: string; level?: string }) {
  return request<{ list: Api.Datasource.Preset[]; total: number }>({
    url: '/api/v1/metric-presets',
    method: 'get',
    params
  });
}

export function fetchApplyMetricPreset(
  id: string,
  data: { datasource_id: number; name?: string; step_seconds?: number; query?: string }
) {
  return request<Api.Datasource.MetricMapping>({ url: `/api/v1/metric-presets/${id}/apply`, method: 'post', data });
}
