import { request } from '../request';

export function fetchGetMenus() {
  return request<any>({
    url: '/api/v1/permissions',
    method: 'get'
  });
}

export function fetchCreateMenu(data: any) {
  return request<any>({
    url: '/api/v1/permissions',
    method: 'post',
    data
  });
}

export function fetchUpdateMenu(id: number, data: any) {
  return request<any>({
    url: `/api/v1/permissions/${id}`,
    method: 'put',
    data
  });
}

export function fetchDeleteMenu(id: number) {
  return request<any>({
    url: `/api/v1/permissions/${id}`,
    method: 'delete'
  });
}
