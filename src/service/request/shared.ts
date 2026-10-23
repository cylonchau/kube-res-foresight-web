import { useAuthStore } from '@/store/modules/auth';
import { localStg } from '@/utils/storage';
import { fetchRefreshToken } from '../api';
import type { RequestInstanceState } from './type';

let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function accessTokenExpiresAt(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return Number(claims.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function getAuthorization() {
  const token = localStg.get('token');
  const Authorization = token ? `Bearer ${token}` : null;

  return Authorization;
}

/** refresh token */
async function handleRefreshToken() {
  const { resetStore } = useAuthStore();

  const rToken = localStg.get('refreshToken') || '';
  const { error, data } = await fetchRefreshToken(rToken);
  if (!error) {
    localStg.set('token', data.token);
    localStg.set('refreshToken', data.refreshToken);
    return true;
  }

  resetStore();

  return false;
}

export function accessTokenNeedsRefresh(token: string, skewMs = 30_000) {
  const expiresAt = accessTokenExpiresAt(token);
  return expiresAt > 0 && expiresAt <= Date.now() + skewMs;
}

export function scheduleAccessTokenRefresh(state: RequestInstanceState) {
  if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer);
  const token = localStg.get('token') || '';
  const expiresAt = accessTokenExpiresAt(token);
  if (!expiresAt) return;
  const delay = Math.max(0, expiresAt - Date.now() - 30_000);
  proactiveRefreshTimer = setTimeout(
    async () => {
      proactiveRefreshTimer = null;
      const success = await handleExpiredRequest(state);
      if (success) scheduleAccessTokenRefresh(state);
    },
    Math.min(delay, 2_147_000_000)
  );
}

export async function handleExpiredRequest(state: RequestInstanceState) {
  if (!state.refreshTokenPromise) {
    state.refreshTokenPromise = handleRefreshToken();
  }

  const success = await state.refreshTokenPromise;

  setTimeout(() => {
    state.refreshTokenPromise = null;
  }, 1000);

  return success;
}

export function showErrorMsg(state: RequestInstanceState, message: string) {
  if (!state.errMsgStack?.length) {
    state.errMsgStack = [];
  }

  const isExist = state.errMsgStack.includes(message);

  if (!isExist) {
    state.errMsgStack.push(message);

    window.$message?.error(message, {
      onLeave: () => {
        state.errMsgStack = state.errMsgStack.filter(msg => msg !== message);

        setTimeout(() => {
          state.errMsgStack = [];
        }, 5000);
      }
    });
  }
}
