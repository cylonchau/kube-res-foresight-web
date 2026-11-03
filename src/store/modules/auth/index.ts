import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { defineStore } from 'pinia';
import { useLoading } from '@sa/hooks';
import {
  fetchGetUserInfo,
  fetchLogin,
  fetchLoginCaptcha,
  fetchLoginOTP,
  fetchLogout,
  fetchSessionStatus
} from '@/service/api';
import { useRouterPush } from '@/hooks/common/router';
import { localStg } from '@/utils/storage';
import { SetupStoreId } from '@/enum';
import { $t } from '@/locales';
import { formatDateTime } from '@/utils/date';
import { useAssistantStore } from '../assistant';
import { useRouteStore } from '../route';
import { useTabStore } from '../tab';
import { useAppStore } from '../app';
import { clearAuthStorage, getToken } from './shared';

/** How often the "am I still logged in" liveness check is polled while authenticated. See
 * fetchSessionStatus's doc comment — this is what lets a session kicked by a same-client-type
 * login elsewhere be noticed within this interval instead of only on the user's next action. */
const SESSION_STATUS_POLL_INTERVAL = 30_000;
let sessionStatusTimer: ReturnType<typeof setInterval> | null = null;

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const route = useRoute();
  const authStore = useAuthStore();
  const routeStore = useRouteStore();
  const tabStore = useTabStore();
  const { toLogin, redirectFromLogin } = useRouterPush(false);
  const { loading: loginLoading, startLoading, endLoading } = useLoading();

  const token = ref('');
  const tempAuthData = ref<{ loginTicket?: string }>({});
  const captchaRequired = ref(false);
  const loginCaptcha = reactive({ id: '', image: '' });

  async function refreshLoginCaptcha(userName: string) {
    if (!userName.trim()) return;
    const { data, error } = await fetchLoginCaptcha(userName);
    if (!error && data) {
      loginCaptcha.id = data.captcha_id;
      loginCaptcha.image = data.captcha_image;
    }
  }

  const userInfo: Api.Auth.UserInfo = reactive({
    userId: '',
    userName: '',
    nickName: '',
    email: '',
    phone: '',
    contacts: [],
    otpEnabled: false,
    source: 'local',
    language: '',
    roles: [],
    buttons: []
  });

  /** is super role in static route */
  const isStaticSuper = computed(() => {
    const { VITE_AUTH_ROUTE_MODE, VITE_STATIC_SUPER_ROLE } = import.meta.env;

    return VITE_AUTH_ROUTE_MODE === 'static' && userInfo.roles.includes(VITE_STATIC_SUPER_ROLE);
  });

  /** Is login */
  const isLogin = computed(() => Boolean(token.value));

  /** Reset auth store */
  async function resetStore() {
    recordUserId();

    stopSessionStatusPolling();

    clearAuthStorage();

    authStore.$reset();
    // the conversation with the assistant belongs to the person who logged in
    useAssistantStore().reset();

    if (!route.meta.constant) {
      await toLogin();
    }

    tabStore.cacheTabs();
    routeStore.resetStore();
  }

  /**
   * Starts polling the session liveness endpoint every SESSION_STATUS_POLL_INTERVAL while
   * logged in. A no-op if already running. Failures are handled entirely by the shared
   * request pipeline (fetchSessionStatus's own 401 goes through the same refresh-then-logout
   * flow as any other request), so nothing needs to be done with its result here.
   */
  function startSessionStatusPolling() {
    if (sessionStatusTimer) return;
    sessionStatusTimer = setInterval(() => {
      if (isLogin.value) fetchSessionStatus();
    }, SESSION_STATUS_POLL_INTERVAL);
  }

  function stopSessionStatusPolling() {
    if (sessionStatusTimer) {
      clearInterval(sessionStatusTimer);
      sessionStatusTimer = null;
    }
  }

  async function logout() {
    const refreshToken = localStg.get('refreshToken');
    if (refreshToken) {
      await fetchLogout(refreshToken);
    }
    await resetStore();
  }

  /** Record the user ID of the previous login session Used to compare with the current user ID on next login */
  function recordUserId() {
    if (!userInfo.userId) {
      return;
    }

    // Store current user ID locally for next login comparison
    localStg.set('lastLoginUserId', userInfo.userId);
  }

  /**
   * Check if current login user is different from previous login user If different, clear all tabs
   *
   * @returns {boolean} Whether to clear all tabs
   */
  function checkTabClear(): boolean {
    if (!userInfo.userId) {
      return false;
    }

    const lastLoginUserId = localStg.get('lastLoginUserId');

    // Clear all tabs if current user is different from previous user
    if (!lastLoginUserId || lastLoginUserId !== userInfo.userId) {
      localStg.remove('globalTabs');
      tabStore.clearTabs();

      localStg.remove('lastLoginUserId');
      return true;
    }

    localStg.remove('lastLoginUserId');
    return false;
  }

  /**
   * Login
   *
   * @param userName User name
   * @param password Password
   * @param [redirect=true] Whether to redirect after login. Default is `true`
   */
  async function login(userName: string, password: string, redirect = true, captchaCode = '', force = false) {
    startLoading();

    const { data: loginRes, error } = await fetchLogin(userName, password, loginCaptcha.id, captchaCode, force);

    if (!error) {
      const pass = await loginByToken(loginRes);

      if (pass) {
        // Check if the tab needs to be cleared
        const isClear = checkTabClear();
        let needRedirect = redirect;

        if (isClear) {
          // If the tab needs to be cleared,it means we don't need to redirect.
          needRedirect = false;
        }
        await redirectFromLogin(needRedirect);

        window.$notification?.success({
          title: $t('page.login.common.loginSuccess'),
          content: $t('page.login.common.welcomeBack', { userName: userInfo.userName }),
          duration: 4500
        });
        tempAuthData.value = {};
        captchaRequired.value = false;
        loginCaptcha.id = '';
        loginCaptcha.image = '';
      }
    } else {
      // Prioritize backend business code
      const backendCode = (error as any).response?.data?.code || error?.code;

      if (String(backendCode) === '50102') {
        const loginTicket =
          (error as any).login_ticket ||
          (error as any).response?.data?.data?.login_ticket ||
          (error as any).data?.login_ticket;
        tempAuthData.value = { loginTicket };
        const { toggleLoginModule } = useRouterPush(false);
        toggleLoginModule('otp-login');
      } else {
        const errorData = (error as any).response?.data?.data || (error as any).data || {};
        if (errorData.session_conflict || String(backendCode) === '50124') {
          promptSessionConflict(errorData.active_session, () => login(userName, password, redirect, captchaCode, true));
        } else if (errorData.captcha_required || String(backendCode) === '50117') {
          captchaRequired.value = true;
          await refreshLoginCaptcha(userName);
        }
      }
    }

    endLoading();
  }

  /**
   * Shows the "already signed in elsewhere, kick it and continue?" confirmation the backend's
   * ErrSessionConflict (see checkSessionConflict / pkg/app/query/code.go) prompts for. onConfirm
   * retries the same login call with force=true, which the backend uses to revoke the
   * conflicting session before issuing new tokens.
   */
  function promptSessionConflict(
    activeSession: { clientIp?: string; userAgent?: string; lastUsedAt?: string } | undefined,
    onConfirm: () => void
  ) {
    const time = activeSession?.lastUsedAt ? formatDateTime(activeSession.lastUsedAt) : '-';
    const ip = activeSession?.clientIp || '-';
    window.$dialog?.warning({
      title: $t('page.login.common.sessionConflictTitle'),
      content: $t('page.login.common.sessionConflictContent', { ip, time }),
      positiveText: $t('page.login.common.sessionConflictConfirm'),
      negativeText: $t('common.cancel'),
      onPositiveClick: onConfirm
    });
  }

  /**
   * Login by OTP
   *
   * @param otpCode OTP code
   * @param [redirect=true] Whether to redirect after login. Default is `true`
   */
  async function loginByOTP(otpCode: string, redirect = true, force = false) {
    if (!tempAuthData.value.loginTicket) {
      const { toggleLoginModule } = useRouterPush(false);
      toggleLoginModule('pwd-login');
      return;
    }

    startLoading();

    const { data: loginToken, error } = await fetchLoginOTP(tempAuthData.value.loginTicket, otpCode, force);

    if (!error) {
      const pass = await loginByToken(loginToken);

      if (pass) {
        // Check if the tab needs to be cleared
        const isClear = checkTabClear();
        let needRedirect = redirect;

        if (isClear) {
          needRedirect = false;
        }
        await redirectFromLogin(needRedirect);

        window.$notification?.success({
          title: $t('page.login.common.loginSuccess'),
          content: $t('page.login.common.welcomeBack', { userName: userInfo.userName }),
          duration: 4500
        });
        tempAuthData.value = {};
      }
    } else {
      const backendCode = (error as any).response?.data?.code || error?.code;
      const errorData = (error as any).response?.data?.data || (error as any).data || {};
      if (errorData.session_conflict || String(backendCode) === '50124') {
        promptSessionConflict(errorData.active_session, () => loginByOTP(otpCode, redirect, true));
      } else {
        resetStore();
      }
    }

    endLoading();
  }

  async function loginByToken(loginToken: Api.Auth.LoginToken) {
    // 1. stored in the localStorage, the later requests need it in headers
    localStg.set('token', loginToken.token);
    localStg.set('refreshToken', loginToken.refreshToken);

    // 2. get user info
    const pass = await getUserInfo();

    if (pass) {
      token.value = loginToken.token;
      startSessionStatusPolling();

      return true;
    }

    return false;
  }

  async function getUserInfo() {
    const { data: info, error } = await fetchGetUserInfo();

    if (!error) {
      // update store
      Object.assign(userInfo, info);

      // A saved account-level language preference wins over whatever the
      // browser/local storage currently has — that's the whole point of
      // storing it server-side instead of only in localStg (it follows the
      // user across devices/browsers). No preference saved yet just leaves
      // system-detected/local language alone.
      const lang = info.language as App.I18n.LangType | '';
      if (lang && lang !== localStg.get('lang')) {
        useAppStore().changeLocale(lang, false);
      }

      return true;
    }

    return false;
  }

  async function initUserInfo() {
    const maybeToken = getToken();

    if (maybeToken) {
      token.value = maybeToken;
      const pass = await getUserInfo();

      if (!pass) {
        resetStore();
      } else {
        startSessionStatusPolling();
      }
    }
  }

  return {
    token,
    userInfo,
    isStaticSuper,
    isLogin,
    loginLoading,
    tempAuthData,
    captchaRequired,
    loginCaptcha,
    refreshLoginCaptcha,
    resetStore,
    logout,
    login,
    loginByOTP,
    initUserInfo
  };
});
