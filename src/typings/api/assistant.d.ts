declare namespace Api {
  /** the AI assistant: reads the platform's state through read-only tools; its language models and skills are managed */
  namespace Assistant {
    /** a command of the chat (/report, /export, ...); the words of a built-in one are the interface's own, by name */
    interface Skill {
      name: string;
      title?: string;
      description?: string;
      builtin: boolean;
      /** false: made from the stored facts, works without a language model */
      needs_model: boolean;
      /** '' takes no argument; 'module' needs a module name, 'module?' may take one; 'text' and 'text?' are the same for a custom skill */
      arg: '' | 'module' | 'module?' | 'text' | 'text?';
      arg_hint?: string;
    }

    /** whether the assistant is on, and whether a language model can be asked */
    interface Availability {
      /** the switch (system parameter): off, the assistant is not offered at all */
      enabled: boolean;
      ready: boolean;
      /** disabled, no_connection or bad_connection */
      reason?: string;
      problem?: string;
      model?: string;
      /** the skills that are on */
      skills: Skill[];
    }

    interface Turn {
      role: 'user' | 'assistant';
      content: string;
    }

    /** a tool the assistant used for an answer, so the user can see where the figures came from */
    interface ToolTrace {
      name: string;
      arguments?: string;
      ok: boolean;
      error?: string;
      /** the start of what the tool returned (cut short), for the user to check the answer against */
      result?: string;
      /** only in the console: the step has started and has not ended */
      running?: boolean;
    }

    /** a file the user can download, made available by the assistant */
    interface Attachment {
      name: string;
      path: string;
      format: 'markdown' | 'json';
    }

    interface Reply {
      content: string;
      tools: ToolTrace[];
      attachments: Attachment[];
    }

    /**
     * Work that runs in the background: queued, running (cancelling once a stop was asked for), then succeeded, failed or cancelled; a result that is old
     * enough is expired. A failure that can be tried again puts the task back to queued with the time of the next attempt.
     */
    type AsyncStatus = 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

    interface AsyncTask<R = Reply> {
      id: number;
      kind: string;
      title: string;
      status: AsyncStatus;
      progress: number;
      stage: string;
      error: string;
      attempts: number;
      /** how many times the task is run for a failure that can be tried again */
      max_attempts: number;
      /** the last failure was one that trying again may mend */
      retryable: boolean;
      /** while the task waits for its next attempt: when it starts */
      next_run_at?: string;
      /** the last time the worker said it was alive */
      heartbeat_at?: string;
      expires_at?: string;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
      /** the answer as far as it is written, while the task runs */
      partial?: string;
      /** what the task has done so far; it is there while the task runs and when it failed or was cancelled */
      has_partial: boolean;
      partial_result?: { stage: string; done: number; total: number; result: unknown };
      /** the result is one that was worked out before, not for this task */
      from_cache: boolean;
      error_code?: string;
      /** the request id of the request that queued it: the same id is in the log of the gateway and the operation log */
      trace_id?: string;
      /** the result, once it succeeded */
      result?: R;
    }

    /** one step a task reported; a tool it read */
    interface AsyncEvent {
      seq: number;
      type: string;
      data: ToolTrace;
    }

    /** a stored conversation of the signed-in user; no one else can read it */
    interface Conversation {
      id: number;
      created_at: string;
      updated_at: string;
      /** the first question, until the user renames it */
      title: string;
      message_count: number;
    }

    interface ConversationList {
      list: Conversation[];
      total: number;
    }

    /** one message of a stored conversation as it was shown */
    interface StoredMessage {
      id: number;
      created_at: string;
      role: 'user' | 'assistant';
      content: string;
      failed: boolean;
      tools: ToolTrace[];
      attachments: Attachment[];
    }

    interface ConversationDetail {
      conversation: Conversation;
      messages: StoredMessage[];
    }

    /** one record of the audit: a question put to a language model. It holds no question, answer or tool result. */
    interface AuditRow {
      id: number;
      created_at: string;
      user_id: number;
      user_name: string;
      source: 'chat' | 'skill' | 'task';
      conversation_id: number;
      page: string;
      connection_id: number;
      model: string;
      tool_mode: ToolMode | '';
      /** the names of the platform were replaced by aliases in what was sent to the model */
      redacted: boolean;
      status: 'success' | 'failed';
      error: string;
      duration_ms: number;
      llm_calls: number;
      prompt_tokens: number;
      completion_tokens: number;
      tools: { name: string; ok: boolean }[];
      /** tools the model asked for that the user may not use */
      refused: string[];
      /** the start of the question, for the list */
      question_preview: string;
      /** the conversation, only when one record is opened */
      question?: string;
      answer?: string;
      steps?: ToolTrace[];
    }

    interface AuditList {
      list: AuditRow[];
      total: number;
    }

    /** how the assistant gets data through a connection: native (the model calls the tools), text (the model writes a JSON plan the platform checks and runs), router (the platform reads by rules and the model explains) */
    type ToolMode = 'native' | 'text' | 'router';
    type ToolModeChoice = 'auto' | ToolMode;

    /** where the user is when they ask: the platform checks that the user may see the object, and tells the model what it is */
    interface PageContext {
      page: string;
      title: string;
      module_id?: number;
      namespace?: string;
      workload?: string;
      pod?: string;
    }

    /** a custom header of the requests to a language model; the value of a stored one is the mask */
    interface Header {
      key: string;
      value: string;
    }

    /** a language model the assistant may use. The key and the header values are never returned. */
    interface Connection {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      description: string;
      provider: 'openai';
      endpoint: string;
      model: string;
      enabled: boolean;
      /** the one that answers when a question or a skill names no model */
      is_default: boolean;
      has_api_key: boolean;
      timeout_seconds: number;
      skip_tls_verify: boolean;
      proxy_url: string;
      headers: Header[];
      custom_params: string;
      temperature: number | null;
      max_tokens: number;
      context_length: number;
      max_tool_rounds: number;
      /** what the administrator chose: auto asks the connection once and keeps the answer */
      tool_mode: ToolModeChoice;
      /** what asking the connection found; empty before it was asked */
      tool_mode_detected: ToolMode | '';
      tool_mode_checked_at: string | null;
    }

    /** the form of a language model; the key is sent only when it is set or changed */
    interface ConnectionPayload {
      id?: number;
      name: string;
      description: string;
      provider: 'openai';
      endpoint: string;
      model: string;
      api_key: string;
      enabled: boolean;
      is_default: boolean;
      timeout_seconds: number;
      skip_tls_verify: boolean;
      proxy_url: string;
      headers: Header[];
      custom_params: string;
      temperature: number | null;
      max_tokens: number;
      context_length: number;
      max_tool_rounds: number;
      tool_mode: ToolModeChoice;
    }

    interface ConnectionOption {
      id: number;
      name: string;
      model: string;
      is_default: boolean;
    }

    interface TestResult {
      ok: boolean;
      latency_ms: number;
      message: string;
      /** how the service handles tools; absent when it could not be asked */
      tool_mode?: ToolMode;
      tool_mode_detail?: string;
    }

    interface ConnectionList {
      list: Connection[];
      total: number;
    }

    /** a skill as the management page shows it */
    interface SkillRow extends Skill {
      /** 0 for a built-in skill that has no row yet (it is given one when the list is read) */
      id: number;
      enabled: boolean;
      /** the model it asks; 0 is the default one */
      llm_id: number;
      prompt: string;
      /** made from the stored facts, asks no model */
      direct: boolean;
      updated_at: string;
    }

    interface SkillList {
      list: SkillRow[];
      total: number;
    }

    /** the form of a skill; a built-in one takes only enabled and llm_id */
    interface SkillPayload {
      name: string;
      title: string;
      description: string;
      prompt: string;
      arg_mode: 'none' | 'required' | 'optional';
      arg_hint: string;
      llm_id: number;
      enabled: boolean;
    }

    /** an AI scheduled task: a prompt asked of the language model on a schedule, the answer mailed */
    interface TaskRow {
      id: number;
      created_at: string;
      name: string;
      owner_name: string;
      prompt: string;
      schedule: string;
      enabled: boolean;
      /** the model it asks; 0 is the default one */
      llm_id: number;
      lang: 'zh' | 'en';
      recipients: string[];
      /** made in the chat or on the page */
      source: 'chat' | 'page';
      next_run_at: string | null;
      last_run_at: string | null;
      last_status: '' | 'running' | 'success' | 'failed';
      last_error: string;
    }

    interface TaskList {
      list: TaskRow[];
      total: number;
    }

    interface TaskPayload {
      name: string;
      prompt: string;
      schedule: string;
      lang: 'zh' | 'en';
      enabled: boolean;
      llm_id: number;
      recipients: string[];
    }

    interface SchedulePreview {
      time_zone: string;
      next: string[];
      error: string;
    }

    interface TaskRun {
      id: number;
      created_at: string;
      trigger: 'schedule' | 'manual';
      status: 'running' | 'success' | 'failed';
      started_at: string;
      finished_at: string | null;
      output: string;
      tools: string;
      delivered: string[];
      error: string;
      delivery_error: string;
    }

    interface TaskRunList {
      list: TaskRun[];
      total: number;
    }
  }
}
