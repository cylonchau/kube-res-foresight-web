import { request } from '../request';

/** get role list */
export function fetchRoleList(params?: Api.System.RoleSearchParams) {
  return request<Api.System.RoleList>({
    url: '/api/v1/roles',
    method: 'get',
    params
  });
}

/** get all roles (unpaged) */
export function fetchAllRoles() {
  return request<Api.System.Role[]>({
    url: '/api/v1/roles/all',
    method: 'get'
  });
}

/** create role */
export function createRole(data: any) {
  return request({
    url: '/api/v1/roles',
    method: 'post',
    data
  });
}

/** update role */
export function updateRole(id: number, data: any) {
  return request({
    url: `/api/v1/roles/${id}`,
    method: 'put',
    data
  });
}

/** delete role */
export function deleteRole(id: number) {
  return request({
    url: `/api/v1/roles/${id}`,
    method: 'delete'
  });
}

/** batch delete roles */
export function batchDeleteRole(ids: number[]) {
  return request({
    url: '/api/v1/roles/batch-delete',
    method: 'post',
    data: { ids }
  });
}
