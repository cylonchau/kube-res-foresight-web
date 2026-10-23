import { request } from '../request';

/** get user list */
export function fetchUserList(params?: Api.System.UserSearchParams) {
  return request<Api.System.UserList>({
    url: '/api/v1/users',
    method: 'get',
    params
  });
}

/** create user */
export function createUser(data: any) {
  return request({
    url: '/api/v1/users',
    method: 'post',
    data
  });
}

/** update user */
export function updateUser(id: number, data: any) {
  return request({
    url: `/api/v1/users/${id}`,
    method: 'put',
    data
  });
}

/** delete user */
export function deleteUser(id: number) {
  return request({
    url: `/api/v1/users/${id}`,
    method: 'delete'
  });
}

/** batch delete user */
export function batchDeleteUser(ids: number[]) {
  return request({
    url: '/api/v1/users/batch-delete',
    method: 'post',
    data: { ids }
  });
}

/** reset user otp */
export function resetUserOTP(id: number) {
  return request({
    url: `/api/v1/users/otp/reset/${id}`,
    method: 'post'
  });
}
