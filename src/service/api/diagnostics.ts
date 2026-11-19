import { request } from '../request';

/** the pool of connections, the big tables, their indexes, the running statements and the busiest writers */
export function fetchGetDatabaseDiagnostics() {
  return request<Api.Diagnostics.Database>({ url: '/api/v1/diagnostics/database', method: 'get', timeout: 30 * 1000 });
}
