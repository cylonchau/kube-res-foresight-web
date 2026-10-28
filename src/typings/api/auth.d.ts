declare namespace Api {
  /**
   * namespace Auth
   *
   * backend api module: "auth"
   */
  namespace Auth {
    interface LoginToken {
      token: string;
      refreshToken: string;
      accessExpiresIn?: number;
      refreshExpiresIn?: number;
    }

    interface LoginCaptcha {
      captcha_id: string;
      captcha_image: string;
      expires_in: number;
    }

    interface UserInfo {
      userId: string;
      userName: string;
      nickName: string;
      email: string;
      phone: string;
      /** the ways to reach the user: any type name and its value */
      contacts: Array<{ type: string; value: string }>;
      otpEnabled: boolean;
      /** Saved account-level UI language preference, e.g. "zh-CN"/"en-US". Empty = no preference set. */
      language: string;
      roles: string[];
      buttons: string[];
      /** This session's own most recent successful login time/IP — shown on the dashboard's
       * "this login" card. Absent (undefined) when no login has been recorded yet. */
      lastLoginAt?: string | null;
      lastLoginIp?: string;
    }

    interface OtpResult {
      secret: string;
      qr_code_data: string;
    }
  }
}
