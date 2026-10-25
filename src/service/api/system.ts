import { request } from '../request';

/**
 * Get all system configurations
 */
export function fetchGetConfigs() {
  return request<Api.System.Config[]>({
    url: '/api/v1/configs',
    method: 'get'
  });
}

/**
 * Get one system configuration
 * @param key The config key
 */
export function fetchGetConfig(key: string) {
  return request<Api.System.Config>({
    url: `/api/v1/configs/${key}`,
    method: 'get',
    // System settings are runtime controls. Never let a browser/proxy reuse a value from
    // before an administrator changed it.
    params: { _ts: Date.now() },
    headers: { 'Cache-Control': 'no-cache' }
  });
}

/**
 * Update a system configuration value
 * @param key The config key
 * @param configValue The new value
 */
export function fetchUpdateConfig(key: string, configValue: string) {
  return request({
    url: `/api/v1/configs/${key}`,
    method: 'put',
    data: { config_value: configValue }
  });
}

/**
 * Get column metadata for a model via reflection
 * @param model Model name
 */
export function fetchColumnsMeta(model: string) {
  return request<Array<{ key: string; title: string; configurable: boolean }>>({
    url: '/api/v1/columns/meta',
    method: 'get',
    params: { model }
  });
}

/**
 * Get user's saved column preferences for a view
 * @param view View identifier
 */
export function fetchGetUserColumnConfig(view: string) {
  return request<{ config: string }>({
    url: '/api/v1/columns/config',
    method: 'get',
    params: { view_name: view }
  });
}

/**
 * Update user's column preferences for a view
 * @param view View identifier
 * @param config JSON string of preferences
 */
export function fetchUpdateUserColumnConfig(view: string, config: string) {
  return request({
    url: '/api/v1/columns/config',
    method: 'post',
    data: { view_name: view, config: normalizeColumnConfigWidths(config) }
  });
}

/** Keep persisted widths stable and database-friendly across every list page. */
function normalizeColumnConfigWidths(config: string) {
  try {
    const parsed = JSON.parse(config);

    const normalize = (value: unknown, parentKey = ''): unknown => {
      if (Array.isArray(value)) return value.map(item => normalize(item));
      if (!value || typeof value !== 'object') return value;

      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if ((key === 'width' || parentKey === 'widths') && Number.isFinite(Number(item))) {
            return [key, Math.round(Number(item))];
          }
          return [key, normalize(item, key)];
        })
      );
    };

    return JSON.stringify(normalize(parsed));
  } catch {
    return config;
  }
}

/**
 * Get all task definitions
 * @param params Filters (page, pageSize, keyword)
 */
export function fetchGetTasks(params?: any) {
  return request<Api.System.TaskList>({
    url: '/api/v1/tasks',
    method: 'get',
    params
  });
}

/**
 * Update a task definition
 * @param id Task ID
 * @param data Task data (cron_expr, enabled, description)
 */
export function fetchUpdateTask(id: number, data: Partial<Api.System.Task>) {
  return request({
    url: `/api/v1/tasks/${id}`,
    method: 'put',
    data
  });
}

/**
 * Get all job logs
 * @param params Filters (page, pageSize, job_type, etc.)
 */
export function fetchGetJobs(params?: any) {
  return request<Api.System.JobList>({
    url: '/api/v1/jobs',
    method: 'get',
    params
  });
}

/**
 * Get operation log entries ("系统管理/操作日志")
 * @param params Filters (page, page_size, client_type, keyword, status, start_time, end_time)
 */
export function fetchGetOperationLogs(params?: any) {
  return request<Api.System.OperationLogList>({
    url: '/api/v1/operation-logs',
    method: 'get',
    params
  });
}

/**
 * Get login attempts ("系统管理/登录日志")
 * @param params Filters (page, page_size, username, client_ip, result, reason, method, start_time, end_time, sort_by, sort_order)
 */
export function fetchGetLoginLogs(params?: any) {
  return request<Api.System.LoginLogList>({ url: '/api/v1/login-logs', method: 'get', params });
}

/** Permanently deletes every operation log entry. */
export function fetchClearOperationLogs() {
  return request({ url: '/api/v1/operation-logs', method: 'delete' });
}

/**
 * Reset a job for manual retry
 * @param id Job ID
 */
export function fetchResetJob(id: number) {
  return request({
    url: '/api/v1/jobs/reset',
    method: 'post',
    data: { id }
  });
}

/**
 * Reset several jobs for manual retry in one call.
 *
 * Jobs a worker has already claimed are skipped server-side, so the response reports how many
 * were actually requeued.
 *
 * @param ids Job IDs
 */
export function fetchBatchResetJobs(ids: number[]) {
  return request<{ requested: number; reset: number }>({
    url: '/api/v1/jobs/batch-reset',
    method: 'post',
    data: { ids }
  });
}

/** The job types this deployment actually has, for the execution-record filter. */
export function fetchGetJobTypes() {
  return request<string[]>({
    url: '/api/v1/jobs/types',
    method: 'get'
  });
}

/** Generic API credentials. */
export function fetchGetSecretKeys(params?: any) {
  return request<any>({ url: '/api/v1/secret-keys', method: 'get', params });
}

export function fetchGetSecretKeyPermissionOptions() {
  return request<any[]>({ url: '/api/v1/secret-keys/permission-options', method: 'get' });
}

export function fetchCreateSecretKey(data: any) {
  return request<any>({ url: '/api/v1/secret-keys', method: 'post', data });
}

export function fetchUpdateSecretKey(id: number, data: any) {
  return request<any>({ url: `/api/v1/secret-keys/${id}`, method: 'put', data });
}

export function fetchDeleteSecretKey(id: number) {
  return request({ url: `/api/v1/secret-keys/${id}`, method: 'delete' });
}
