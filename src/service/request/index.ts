import { CanceledError, type AxiosResponse } from 'axios';
import { BACKEND_ERROR_CODE, createFlatRequest, createRequest } from '@sa/axios';
import { useAuthStore } from '@/store/modules/auth';
import { localStg } from '@/utils/storage';
import { getServiceBaseURL } from '@/utils/service';
import { $t } from '@/locales';
import {
  accessTokenNeedsRefresh,
  getAuthorization,
  handleExpiredRequest,
  scheduleAccessTokenRefresh,
  showErrorMsg
} from './shared';
import type { RequestInstanceState } from './type';

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
const { baseURL, otherBaseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);
/** the base of the platform API, for the one request that is not made through axios (a file saved from the response) */
export const serviceBaseURL = baseURL;
const publicAuthUrls = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/login/captcha',
  '/api/v1/auth/login/otp',
  '/api/v1/auth/refresh'
]);

// The shared axios default is 10 seconds, which a list over a large table (millions of rows, a count and a sort) can pass
// without anything being wrong: the page failed with a time-out while the server was still working. Requests get a minute;
// the pages that are slow are fixed at the server (pagination, bounded counts), not by waiting longer.
const REQUEST_TIMEOUT_MS = 60 * 1000;

export const request = createFlatRequest(
  {
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      apifoxToken: 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2',
      // Lets the backend tell this web console's requests apart from access-key API calls — used for
      // single-session-per-client-type enforcement and the operation-log source filter.
      'X-kube-res-foresight-Client': 'web'
    }
  },
  {
    defaultState: {
      errMsgStack: [],
      refreshTokenPromise: null
    } as RequestInstanceState,
    transform(response: AxiosResponse<App.Service.Response<any>>) {
      return response.data.data;
    },
    async onRequest(config) {
      const isRefreshRequest = config.url === '/api/v1/auth/refresh';
      const isPublicAuthRequest = publicAuthUrls.has(config.url || '');
      let token = localStg.get('token') || '';
      if (!isRefreshRequest && token && accessTokenNeedsRefresh(token)) {
        const success = await handleExpiredRequest(request.state);
        if (!success) {
          throw new CanceledError('auth_refresh_failed');
        }
        token = localStg.get('token') || '';
      }
      if (!isRefreshRequest) scheduleAccessTokenRefresh(request.state);
      const Authorization = getAuthorization();
      if (Authorization) {
        Object.assign(config.headers, { Authorization });
      } else {
        delete config.headers.Authorization;
        if (!isPublicAuthRequest) {
          const authStore = useAuthStore();
          await authStore.resetStore();
          throw new CanceledError('auth_required');
        }
      }

      return config;
    },
    isBackendSuccess(response) {
      // when the backend response code is "0000"(default), it means the request is success
      // to change this logic by yourself, you can modify the `VITE_SERVICE_SUCCESS_CODE` in `.env` file
      const successCode = import.meta.env.VITE_SERVICE_SUCCESS_CODE || '10000';
      return String(response.data.code) === successCode;
    },
    async onBackendFail(response, instance) {
      const authStore = useAuthStore();
      const responseCode = String(response.data.code);

      function handleLogout() {
        authStore.resetStore();
      }

      function logoutAndCleanup() {
        handleLogout();
        window.removeEventListener('beforeunload', handleLogout);

        request.state.errMsgStack = request.state.errMsgStack.filter(msg => msg !== response.data.msg);
      }

      // when the backend response code is in `logoutCodes`, it means the user will be logged out and redirected to login page
      const logoutCodes = import.meta.env.VITE_SERVICE_LOGOUT_CODES?.split(',') || [];
      if (logoutCodes.includes(responseCode)) {
        handleLogout();
        return null;
      }

      // when the backend response code is in `modalLogoutCodes`, it means the user will be logged out by displaying a modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [];
      if (modalLogoutCodes.includes(responseCode) && !request.state.errMsgStack?.includes(response.data.msg)) {
        request.state.errMsgStack = [...(request.state.errMsgStack || []), response.data.msg];

        // prevent the user from refreshing the page
        window.addEventListener('beforeunload', handleLogout);

        window.$dialog?.error({
          title: $t('common.error'),
          content: response.data.msg,
          positiveText: $t('common.confirm'),
          maskClosable: false,
          closeOnEsc: false,
          onPositiveClick() {
            logoutAndCleanup();
          },
          onClose() {
            logoutAndCleanup();
          }
        });

        return null;
      }

      // when the backend response code is in `expiredTokenCodes`, it means the token is expired, and refresh token
      // the api `refreshToken` can not return error code in `expiredTokenCodes`, otherwise it will be a dead loop, should return `logoutCodes` or `modalLogoutCodes`
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [];
      if (expiredTokenCodes.includes(responseCode)) {
        const success = await handleExpiredRequest(request.state);
        if (success) {
          Object.assign(response.config.headers, { Authorization: getAuthorization() });
          return instance.request(response.config) as Promise<AxiosResponse>;
        }
        return null;
      }

      return null;
    },
    async onError(error) {
      if (
        error.code === 'ERR_CANCELED' ||
        error.message === 'auth_required' ||
        error.message === 'auth_refresh_failed'
      ) {
        return;
      }
      const requestUrl = error.config?.url || '';
      const isLoginRequest = ['/api/v1/auth/login', '/api/v1/auth/login/otp'].includes(requestUrl);
      const isRefreshRequest = requestUrl === '/api/v1/auth/refresh';

      // Proactive refresh owns cleanup/redirect. Do not leak the refresh-token
      // failure as an "Invalid or expired token" toast on the login page.
      if (isRefreshRequest) return;

      // A 401 returned by the login endpoints is a visible login failure, not an
      // expired session. Do not reset the store and swallow its backend message.
      if (error.response?.status === 401 && !isLoginRequest) {
        // A stray 401 doesn't necessarily mean the session is dead — it can be
        // clock skew between browser and server, a request that raced the
        // proactive refresh timer, or any other transient hiccup. Try one
        // refresh (deduped with the proactive path via state.refreshTokenPromise)
        // before tearing down the whole session: if it succeeds, the token is
        // fresh again and the user stays logged in — this one call still failed
        // and surfaces as an error to whoever awaited it, but that's far better
        // than an unconditional forced logout for what was often nothing more
        // than a transient blip. Only a genuinely dead/revoked refresh token
        // (handleRefreshToken already calls resetStore() itself in that case)
        // falls through to the hard logout below.
        if (localStg.get('refreshToken')) {
          const refreshed = await handleExpiredRequest(request.state);
          if (refreshed) return;
        }

        const authStore = useAuthStore();
        // The backend's standard response envelope (pkg/app/query.Response) only ever
        // sends `msg`, never `message` — see pkg/app/query/code.go.
        const message = error.response?.data?.msg;
        if (message) showErrorMsg(request.state, message);
        await authStore.resetStore();
        return;
      }

      // a caller that shows the failure itself (the chat puts it in the conversation) asks for no pop-up; an expired session was handled above
      if (String(error.config?.headers?.['X-Silent-Error'] ?? '') === '1') return;

      let message = error.message;
      let backendErrorCode = '';

      // get backend error message and code
      // (the backend's standard response envelope only ever sends `msg`, never `message`)
      if (error.response?.data?.msg) {
        message = error.response.data.msg;
        backendErrorCode = String(error.response.data.code || '');
      } else if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.msg || message;
        backendErrorCode = String(error.response?.data?.code || '');
      }

      // the error message is displayed in the modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [];
      if (modalLogoutCodes.includes(backendErrorCode)) {
        return;
      }

      // when the token is expired, refresh token and retry request, so no need to show error message
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [];
      if (expiredTokenCodes.includes(backendErrorCode)) {
        return;
      }

      // 50102 (OTP required) and 50124 (session conflict) are both handled by
      // a dedicated UI (OTP step / kick-confirm dialog) in the auth store —
      // showing the generic error toast on top of those would be redundant.
      if (!['50102', '50124'].includes(backendErrorCode)) {
        showErrorMsg(request.state, message);
      }
    }
  }
);

export const demoRequest = createRequest(
  {
    baseURL: otherBaseURL.demo
  },
  {
    transform(response: AxiosResponse<App.Service.DemoResponse>) {
      return response.data.result;
    },
    async onRequest(config) {
      const { headers } = config;

      // set token
      const token = localStg.get('token');
      const Authorization = token ? `Bearer ${token}` : null;
      Object.assign(headers, { Authorization });

      return config;
    },
    isBackendSuccess(response) {
      // when the backend response code is "200", it means the request is success
      // you can change this logic by yourself
      return response.data.status === '200';
    },
    async onBackendFail(_response) {
      // when the backend response code is not "200", it means the request is fail
      // for example: the token is expired, refresh token and retry request
    },
    onError(error) {
      // when the request is fail, you can show error message

      let message = error.message;

      // show backend error message
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.message || message;
      }

      window.$message?.error(message);
    }
  }
);
