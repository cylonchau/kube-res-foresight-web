declare namespace Api {
  namespace System {
    /** system config */
    interface Config {
      /** config key */
      config_key: string;
      /** config value */
      config_value: string;
      /** config name */
      config_name: string;
      /** remark */
      remark: string;
    }

    /** one active login session — "which device(s) is this user online with" */
    interface UserActiveSession {
      clientIp: string;
      userAgent: string;
      lastUsedAt: string | null;
    }

    /** user */
    interface User {
      /** user id */
      id: number;
      /** username */
      username: string;
      /** nickname */
      nickName: string;
      /** where the account is authenticated: local or ldap */
      source: 'local' | 'ldap';
      /** the ways to reach the user: any type name and its value */
      contacts: Array<{ type: string; value: string }>;
      /** user status */
      status: boolean;
      /** user roles */
      roles: Role[];
      /** create time */
      createdAt: string;
      /** update time */
      updatedAt: string;
      /** avatar URL */
      avatar?: string;
      /** whether OTP/2FA is enabled */
      otpEnabled?: boolean;
      /** most recent successful login time */
      lastLoginAt: string | null;
      /** IP address of the most recent successful login */
      lastLoginIp: string;
      /** whether the user has an active session within the last 15 minutes */
      isOnline: boolean;
      /** active login sessions — one per device/client currently signed in */
      activeSessions: UserActiveSession[];
    }

    /** user search params */
    interface UserSearchParams {
      page?: number;
      page_size?: number;
      pageSize?: number;
      username?: string;
      nick_name?: string;
      nickName?: string;
      status?: boolean;
      source?: string;
    }

    /** user list */
    interface UserList {
      list: User[];
      total: number;
      page: number;
      pageSize: number;
    }

    /** one permission entry nested in a role's `permissions` (backend RolePermissionDTO,
     * mirrors model.Permission's exact field set — distinct from the snake_case shape
     * returned by the standalone /permissions endpoint, see `Menu` below) */
    interface RolePermission {
      id: number;
      createdAt: string;
      updatedAt: string;
      name: string;
      code: string;
      type: string;
      parentId: number;
      feRoute: string;
      feComponent: string;
      sort: number;
      icon: string;
      isLink: boolean;
      isCache: boolean;
      visible: boolean;
      status: boolean;
      beApis: string;
      position: string;
      btnType: string;
    }

    /** role (backend RoleDTO, see pkg/apis/role.go) */
    interface Role {
      /** role id */
      id: number;
      /** create time */
      createdAt: string;
      /** update time */
      updatedAt: string;
      /** role name */
      name: string;
      /** role code */
      code: string;
      /** role status */
      status: boolean;
      /** role remark */
      remark: string;
      /** granted permissions, only present where the backend chooses to include them */
      permissions?: RolePermission[];
    }

    /** role search params */
    interface RoleSearchParams {
      page?: number;
      page_size?: number;
      pageSize?: number;
      role_name?: string;
      roleName?: string;
      role_code?: string;
      roleCode?: string;
      status?: boolean;
    }

    /** role list */
    interface RoleList {
      list: Role[];
      total: number;
      page: number;
      pageSize: number;
    }

    /** menu / permission tree */
    interface Menu {
      id: number;
      routeCode: string;
      routeName: string;
      pid: number;
      type: 'CATALOG' | 'MENU' | 'BUTTON';
      icon: string;
      path: string;
      status: boolean;
      order: number;
      children?: Menu[];
    }

    /** task definition */
    interface Task {
      /** task id */
      id: number;
      /** task type */
      task_type: string;
      /** cron expression */
      cron_expr: string;
      /** enabled status */
      enabled: boolean;
      /** last run time */
      last_run_time: string;
      /** next run time */
      next_run_time: string;
      /** description */
      description: string;
      /** parameters (JSON string) */
      params: string;
      max_retry: number;
      retry_forever: boolean;
      retry_initial_seconds: number;
      retry_backoff_factor: number;
      retry_max_seconds: number;
      execution_interval_seconds: number;
      watch_interval_seconds: number;
    }

    /** job instance (execution log) */
    interface Job {
      /** job id */
      id: number;
      /** job type */
      job_type: string;
      /** target type */
      target_type: string;
      /** target id */
      target_id: number;
      /** status: pending | running | success | failed */
      status: string;
      /** scheduled time */
      scheduled_at: string | null;
      /** start time */
      started_at: string | null;
      /** finish time */
      finished_at: string | null;
      /** result or error msg */
      result: string;
      /** retry count */
      retry_count: number;
    }

    /** task list */
    interface TaskList {
      list: Task[];
      total: number;
    }

    /** job list */
    interface JobList {
      list: Job[];
      total: number;
    }

    /** one operation log entry — a mutating admin/API request, see model.OperationLog */
    interface OperationLog {
      id: number;
      created_at: string;
      /** source: "page" (web console) | "api" (access-key/secret) */
      client_type: 'page' | 'api';
      user_id: number;
      username: string;
      method: string;
      path: string;
      module: string;
      status_code: number;
      client_ip: string;
      user_agent: string;
      params: string;
      body: string;
      duration_ms: number;
      error_msg: string;
    }

    /** one login attempt — see model.LoginAuditLog */
    interface LoginLog {
      id: number;
      created_at: string;
      username: string;
      client_ip: string;
      success: boolean;
      method: string;
      reason: string;
      user_agent: string;
    }

    interface LoginLogList {
      list: LoginLog[];
      total: number;
      page: number;
      pageSize: number;
    }

    /** operation log list */
    interface OperationLogList {
      list: OperationLog[];
      total: number;
      page: number;
      pageSize: number;
    }
  }
}
