declare namespace Api {
  /** the chat assistant: reads the platform's state through read-only tools */
  namespace Assistant {
    /** whether the chat can be used, and what is missing when it cannot */
    interface Availability {
      ready: boolean;
      problem?: string;
      model?: string;
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
  }
}
