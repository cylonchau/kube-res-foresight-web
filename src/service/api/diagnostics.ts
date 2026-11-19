import { request } from '../request';

/** the pool of connections, the big tables, their indexes, the running statements and the busiest writers */
export function fetchGetDatabaseDiagnostics() {
  return request<Api.Diagnostics.Database>({ url: '/api/v1/diagnostics/database', method: 'get', timeout: 30 * 1000 });
}

/** the baseline of the time of every route over the last hours, the layer the time is in, the runs of the process and what the numbers say */
export function fetchGetRequestDiagnostics(hours: number) {
  return request<Api.Diagnostics.Requests>({
    url: '/api/v1/diagnostics/requests',
    method: 'get',
    params: { hours },
    timeout: 30 * 1000
  });
}
