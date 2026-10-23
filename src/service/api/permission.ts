import { request } from '../request';

/** get all permissions (tree or list) */
export function fetchAllPermissions() {
  return request<Api.System.Menu[]>({
    url: '/api/v1/permissions',
    method: 'get'
  });
}

/** create permission */
export function createPermission(data: any) {
  return request({
    url: '/api/v1/permissions',
    method: 'post',
    data
  });
}

/** update permission */
export function updatePermission(id: number, data: any) {
  return request({
    url: `/api/v1/permissions/${id}`,
    method: 'put',
    data
  });
}

/** delete permission */
export function deletePermission(id: number) {
  return request({
    url: `/api/v1/permissions/${id}`,
    method: 'delete'
  });
}
