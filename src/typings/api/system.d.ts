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
      /** email */
      email: string;
      /** phone number */
      phone: string;
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
      /** Telegram binding, if this user has bound one */
      telegramBinding?: {
        id: number;
        telegramUserId: number;
        telegramUsername: string;
        firstName: string;
        lastName: string;
        photoUrl: string;
        status: boolean;
      } | null;
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
      /** source: "page" (web console) | "tma" (Telegram Mini App) | "api" (access-key/secret) */
      client_type: 'page' | 'tma' | 'api';
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

    /** operation log list */
    interface OperationLogList {
      list: OperationLog[];
      total: number;
      page: number;
      pageSize: number;
    }
  }

  namespace Telegram {
    /** current user's own Telegram binding status */
    interface BindingStatus {
      is_bound: boolean;
      binding?: BindingInfo;
      bot_username?: string;
    }

    interface BindingInfo {
      telegram_user_id: number;
      telegram_username: string;
      first_name: string;
      last_name: string;
      photo_url: string;
      bound_at: string;
    }

    interface BindGenerateResp {
      token: string;
      deep_link: string;
      expires_at: string;
    }

    /** one active login session — "which device is this user online with" */
    interface AdminSessionItem {
      client_ip: string;
      user_agent: string;
      last_used_at: string | null;
    }

    /** one row of the admin bindings management list */
    interface AdminBindingItem {
      id: number;
      created_at: string;
      user_id: number;
      username: string;
      nick_name: string;
      telegram_user_id: number;
      telegram_username: string;
      first_name: string;
      last_name: string;
      status: boolean;
      bound_at: string;
      last_login_at: string | null;
      is_online: boolean;
      active_sessions: AdminSessionItem[];
    }

    interface ClientAccount {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      phone_number: string;
      api_id: number;
      telegram_user_id: number;
      telegram_username: string;
      telegram_first_name: string;
      telegram_last_name: string;
      authorized: boolean;
      enabled: boolean;
      connected: boolean;
      /** reported by the Telegram Agent: connected | disconnected | error */
      connection_status: string;
      /** the TG Agent that runs the account ("" = not claimed yet) */
      agent_id: string;
      last_connected_at: string | null;
      last_message_at: string | null;
      last_error: string;
      /** Telegram limited the account's sending (PEER_FLOOD) until this time; empty when it is not limited. */
      send_blocked_until?: string | null;
      send_blocked_reason?: string;
      has_api_hash: boolean;
      has_session: boolean;
    }

    interface ClientSubscription {
      id: number;
      created_at: string;
      updated_at: string;
      account_id: number;
      account?: ClientAccount;
      peer_id: number;
      peer_type: string;
      username: string;
      title: string;
      keywords: string;
      enabled: boolean;
      /** membership reported by the Telegram Agent: pending | joined | left | error */
      state: string;
      last_error: string;
      /** newest Telegram message id taken in; the agent continues from it after a stop */
      last_message_id: number;
      /** newest message id seen in the chat; the gap to last_message_id is the backlog */
      latest_message_id: number;
      last_message_at: string | null;
    }

    /** One Bot API bot run by the Telegram Agent. The token is never returned. */
    interface Bot {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      username: string;
      mode: string;
      api_base_url: string;
      mini_app_url: string;
      enabled: boolean;
      /** reported by the Telegram Agent: stopped | running | error */
      status: string;
      last_error: string;
      bot_user_id: number;
      started_at: string | null;
      /** last heartbeat the Telegram Agent wrote for this bot */
      seen_at: string | null;
      commands_synced_at: string | null;
      connected: boolean;
      has_token: boolean;
      command_count: number;
    }

    interface BotInput {
      name?: string;
      /** empty keeps the stored token */
      token?: string;
      username?: string;
      mode?: string;
      api_base_url?: string;
      mini_app_url?: string;
      enabled?: boolean;
    }

    /**
     * Where a forwarded message is written, who consumes it and which module handles it.
     * direct: handed straight to the Job module / Workflow engine; redis_stream and kafka: written to a
     * stream / topic that a consumer group reads.
     */
    interface ForwardChannel {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      transport: 'direct' | 'redis_stream' | 'kafka';
      redis_addr: string;
      redis_db: number;
      has_redis_password: boolean;
      stream: string;
      brokers: string;
      topic: string;
      kafka_username: string;
      has_kafka_password: boolean;
      kafka_tls: boolean;
      format: string;
      consumer_kind: 'job' | 'workflow' | 'external';
      consumer_ref: string;
      consumer_group: string;
      consumer_enabled: boolean;
      enabled: boolean;
      remark: string;
      produced: number;
      consumed: number;
      last_produced_at: string | null;
      last_consumed_at: string | null;
      last_error: string;
      /** how many forward rules write to the channel */
      rules: number;
    }

    /** Sends received channel messages to users (Notify) or to a forward channel. */
    interface ForwardRule {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      /** 0 = every account */
      account_id: number;
      /** 0 = every subscription */
      subscription_id: number;
      /** "" = every source type; channel | group | private | system */
      source_type: string;
      pattern: string;
      /** task = forward to a Job / Workflow / Redis / Kafka; user = forward to other users (Notify) */
      target_class: string;
      /** notify | channel */
      target_kind: string;
      target_ref: string;
      target_recipient: string;
      /** task rules: the forward channel the message is written to */
      channel_id: number;
      channel_name: string;
      /** user target: the Telegram account that sends; 0 = the first connected one */
      send_account_id: number;
      enabled: boolean;
      remark: string;
    }

    interface ClientMessage {
      id: number;
      created_at: string;
      account_id: number;
      subscription_id: number;
      peer_id: number;
      telegram_message_id: number;
      sender_id: number;
      sender_name: string;
      /** only present when one message is read */
      text?: string;
      media_type: string;
      message_at: string;
      /** original text size in bytes; the text itself is only returned when one message is read */
      size: number;
      /** channel | group | private | system */
      source_type: string;
      source: string;
      /** cache state: pending | consumed | failed */
      status: string;
      attempts: number;
      last_error: string;
      consumed_at: string | null;
    }

    /** One TG Agent's heartbeat. */
    interface Agent {
      id: number;
      agent_id: string;
      version: string;
      started_at: string;
      seen_at: string | null;
      online: boolean;
      accounts: number;
      bots: number;
      pending: number;
      forwarded: number;
      failed: number;
      last_error: string;
      /** JSON array of {name, last_run_at, last_error, runs, failures, detail} */
      jobs_json: string;
    }

    interface AgentSummary {
      cache: Record<string, number>;
      accounts: Record<string, number>;
      bots: Record<string, number>;
    }

    /** one admin-editable message template (see backend model.TemplateKey*) */
    interface NotifyTemplate {
      key: string;
      name: string;
      channel: string;
      title_template: string;
      body_template: string;
      buttons_json: string;
      enabled: boolean;
    }

    interface NotifyTemplateUpdate {
      title_template?: string;
      body_template?: string;
      buttons_json?: string;
      enabled?: boolean;
    }

    /** one button parsed out of NotifyTemplate.buttons_json */
    interface TemplateButton {
      label: string;
      action_type: 'webapp' | 'callback' | 'url';
      action_target: string;
    }

    interface BotCommandDef {
      id: number;
      created_at: string;
      updated_at: string;
      /** the bot the command belongs to; 0 = every bot */
      bot_id: number;
      command: string;
      name: string;
      pattern: string;
      description: string;
      required_roles_json: string;
      /** "workflow" (default) | "reply" | "webhook" | "handler" */
      action_type: string;
      workflow_key: string;
      /** action_type-specific config: reply→{template_key}; webhook→{url,body_template,auth_header,success_message};
       * handler→{handler_name} */
      params_json: string;
      require_binding: boolean;
      /** JSON object of {var_key: label} values required before ExecuteCommand runs, e.g. {"request":"请求"} */
      required_params_json: string;
      /** JSON array of NotifyTemplate keys the admin curated as "related" to this command, purely for editing convenience in the console — not read by MatchCommand/ExecuteCommand */
      related_template_keys_json: string;
      enabled: boolean;
    }

    /** GET /admin/workflow-handlers — the real catalog of backend-registered handlers */
    interface RegisteredHandlers {
      output_actions: string[];
      commands: string[];
      /** Names registered via workflow.Engine.RegisterOptionSource. */
      option_sources?: string[];
    }

    /** One choice for a manual field whose options come from the backend. */
    interface SelectOption {
      label: string;
      value: string;
    }

    interface WorkflowDef {
      id: number;
      created_at: string;
      updated_at: string;
      workflow_key: string;
      /** Chat platform this pipeline notifies through: telegram | msteams | slack | generic. */
      driver: string;
      name: string;
      description: string;
      initial_state: string;
      pipeline_json: string;
      enabled: boolean;
    }

    interface WorkflowInstance {
      id: number;
      created_at: string;
      updated_at: string;
      workflow_key: string;
      current_state: string;
      status: 'running' | 'completed' | 'rejected' | 'failed';
      business_type: string;
      business_id: number;
      requester_user_id: number | null;
      requester_telegram_user_id: number;
      requester_name: string;
      context_data_json: string;
      history_json: string;
      finished_at: string | null;
    }
  }
}
