declare namespace Api {
  namespace Datasource {
    type AuthType = 'none' | 'basic' | 'bearer';
    type ProbeStatus = 'unknown' | 'ok' | 'error';

    interface Datasource {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      type: string;
      base_url: string;
      auth_type: AuthType;
      username: string;
      has_password: boolean;
      has_bearer_token: boolean;
      tls_skip_verify: boolean;
      has_ca_cert: boolean;
      timeout_seconds: number;
      max_concurrency: number;
      enabled: boolean;
      status: ProbeStatus;
      server_version: string;
      last_checked_at: string | null;
      last_latency_ms: number;
      last_error: string;
      mapping_count: number;
      remark: string;
    }

    interface PresetText {
      zh: string;
      en: string;
    }

    /** a built-in metric mapping template, see preset.Preset */
    interface Preset {
      id: string;
      name: PresetText;
      scenario: PresetText;
      metric: string;
      level: string;
      unit: string;
      step_seconds: number;
      query: string;
      source: { component: string; metrics: string[]; labels: string[] };
      usage: PresetText;
      limitations: PresetText;
      verified: boolean;
    }

    interface DemoStatus {
      exists: boolean;
      module_id?: number;
    }

    interface DatasourceOption {
      id: number;
      name: string;
    }

    interface DatasourceList {
      list: Datasource[];
      total: number;
      page: number;
      pageSize: number;
    }

    interface DatasourceSearchParams {
      page: number;
      page_size: number;
      keyword?: string;
      status?: ProbeStatus;
      enabled?: boolean;
    }

    /** Password, bearer token and CA bundle are write-only; blank keeps the stored value on update. */
    interface DatasourcePayload {
      name?: string;
      base_url?: string;
      auth_type?: AuthType;
      username?: string;
      password?: string;
      bearer_token?: string;
      tls_skip_verify?: boolean;
      ca_cert?: string;
      clear_ca_cert?: boolean;
      timeout_seconds?: number;
      max_concurrency?: number;
      enabled?: boolean;
      remark?: string;
    }

    interface TestResult {
      status: ProbeStatus;
      server_version: string;
      latency_ms: number;
      error: string;
    }

    interface MetricMapping {
      id: number;
      created_at: string;
      updated_at: string;
      datasource_id: number;
      datasource_name: string;
      name: string;
      metric: string;
      level: string;
      query: string;
      variables: string[];
      unit: string;
      step_seconds: number;
      enabled: boolean;
      remark: string;
      /** the built-in preset the mapping was created from, empty for a hand-written one */
      preset_id: string;
    }

    interface MetricMappingList {
      list: MetricMapping[];
      total: number;
      page: number;
      pageSize: number;
    }

    interface MetricMappingSearchParams {
      page: number;
      page_size: number;
      keyword?: string;
      datasource_id?: number;
      metric?: string;
      level?: string;
      enabled?: boolean;
    }

    interface MetricMappingPayload {
      datasource_id?: number;
      name?: string;
      metric?: string;
      level?: string;
      query?: string;
      unit?: string;
      step_seconds?: number;
      enabled?: boolean;
      remark?: string;
    }

    interface MetricCatalog {
      metrics: Array<{ metric: string; unit: string }>;
      levels: Array<{ level: string; required_variables: string[] }>;
      variables: string[];
      min_step_seconds: number;
      max_step_seconds: number;
    }
  }
}
