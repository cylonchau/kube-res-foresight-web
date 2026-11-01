declare namespace Api {
  /** the AI assistant: reads the platform's state through read-only tools; its language model is a connection */
  namespace Assistant {
    /** a command of the chat (/report, /export, ...): its words are the interface's own, by name */
    interface Skill {
      name: string;
      /** false: made from the stored facts, works without a language model */
      needs_model: boolean;
      /** '' takes no argument, 'module' needs a module name, 'module?' may take one */
      arg: '' | 'module' | 'module?';
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

    /** a language model the assistant may use; only one is enabled at a time. The key is never returned. */
    interface Connection {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      endpoint: string;
      model: string;
      enabled: boolean;
      has_api_key: boolean;
      timeout_seconds: number;
      max_tool_rounds: number;
      max_reply_tokens: number;
      remark: string;
    }

    /** the form of a connection; the key is sent only when it is set or changed */
    interface ConnectionPayload {
      id?: number;
      name: string;
      endpoint: string;
      model: string;
      api_key: string;
      enabled: boolean;
      timeout_seconds: number;
      max_tool_rounds: number;
      max_reply_tokens: number;
      remark: string;
    }

    interface TestResult {
      ok: boolean;
      latency_ms: number;
      message: string;
    }

    interface ConnectionList {
      list: Connection[];
      total: number;
    }
  }
}
