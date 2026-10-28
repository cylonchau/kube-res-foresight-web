import { request } from '../request';

/**
 * Login
 *
 * @param userName User name
 * @param password Password
 * @param force When true, kicks any other active web session for this account instead of
 *   the backend returning a session-conflict error — set after the user confirms the
 *   "already signed in elsewhere, continue?" prompt.
 */
export function fetchLogin(
  userName: string,
  password: string,
  captchaId?: string,
  captchaCode?: string,
  force = false
) {
  return request<Api.Auth.LoginToken & { login_ticket?: string }>({
    url: '/api/v1/auth/login',
    method: 'post',
    data: {
      username: userName,
      password,
      captcha_id: captchaId,
      captcha_code: captchaCode,
      force
    }
  });
}

export function fetchLoginCaptcha(userName: string) {
  return request<Api.Auth.LoginCaptcha>({
    url: '/api/v1/auth/login/captcha',
    method: 'get',
    params: { username: userName }
  });
}

/**
 * Login by OTP
 *
 * @param ticket Login ticket
 * @param otpCode OTP code
 * @param force See fetchLogin's `force` parameter.
 */
export function fetchLoginOTP(ticket: string, otpCode: string, force = false) {
  return request<Api.Auth.LoginToken>({
    url: '/api/v1/auth/login/otp',
    method: 'post',
    data: {
      login_ticket: ticket,
      otp_code: otpCode,
      force
    }
  });
}

/**
 * Cheap authenticated liveness check, polled every ~30s while logged in so a session that
 * gets kicked by a same-client-type login elsewhere is noticed well before the user's next
 * real action. All the actual logic lives in JWTAuthMiddleware's existing per-request
 * session-family check — this endpoint itself is a no-op success when the session is valid.
 */
export function fetchSessionStatus() {
  return request({ url: '/api/v1/auth/session-status', method: 'get' });
}

/** Get user info */
export function fetchGetUserInfo() {
  return request<Api.Auth.UserInfo>({ url: '/api/v1/auth/info' });
}

/** Save the current user's UI language preference so it follows their account */
export function fetchUpdateLanguage(language: string) {
  return request({ url: '/api/v1/auth/language', method: 'put', data: { language } });
}

/**
 * Refresh token
 *
 * @param refreshToken Refresh token
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: '/api/v1/auth/refresh',
    method: 'post',
    data: {
      refresh_token: refreshToken
    }
  });
}

export function fetchLogout(refreshToken: string) {
  return request({
    url: '/api/v1/auth/logout',
    method: 'post',
    data: { refresh_token: refreshToken }
  });
}

/**
 * return custom backend error
 *
 * @param code error code
 * @param msg error message
 */
export function fetchCustomBackendError(code: string, msg: string) {
  return request({ url: '/auth/error', params: { code, msg } });
}

/** Generate OTP secret and QR code */
export function fetchGenerateOTP() {
  return request<Api.Auth.OtpResult>({
    url: '/api/v1/auth/otp/generate',
    method: 'post'
  });
}

/**
 * Bind OTP
 *
 * @param secret OTP secret
 * @param code OTP code
 */
export function fetchBindOTP(secret: string, code: string) {
  return request({
    url: '/api/v1/auth/otp/bind',
    method: 'post',
    data: { secret, code }
  });
}

/**
 * Unbind OTP
 *
 * @param code OTP code
 */
export function fetchUnbindOTP(code: string) {
  return request({
    url: '/api/v1/auth/otp/unbind',
    method: 'post',
    data: { code }
  });
}

/**
 * Update password
 *
 * @param oldPassword Old password
 * @param password New password
 */
export function fetchUpdatePassword(oldPassword: string, password: string) {
  return request({
    url: '/api/v1/auth/password',
    method: 'put',
    data: { old_password: oldPassword, password }
  });
}

/**
 * Update user profile
 *
 * @param email Email
 * @param phone Phone
 */
export function fetchUpdateProfile(contacts: Array<{ type: string; value: string }>) {
  return request({
    url: '/api/v1/auth/profile',
    method: 'put',
    data: { contacts }
  });
}
