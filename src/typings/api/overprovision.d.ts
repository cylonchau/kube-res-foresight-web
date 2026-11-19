declare namespace Api {
  /** the over-provisioning analysis of the modules (P10 A2): what a Pod requests against what it used, and what the use supports */
  namespace Overprovision {
    type Resource = 'cpu' | 'memory';
    type Status = 'over' | 'ok' | 'under' | 'limited' | 'unknown';
    type Grade = 'severe' | 'moderate' | 'mild' | 'reasonable' | '';
    type Level = 'high' | 'medium' | 'low';
    type Health = 'risk' | 'under' | 'over' | 'limited' | 'ok' | 'unknown';

    /** the quantiles of the use of one Pod over a window (CPU in cores, memory in bytes) */
    interface Usage {
      points: number;
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      max: number;
    }

    /** one resource over one window, as it was analysed live */
    interface Result {
      resource: Resource;
      window_minutes: number;
      request: number;
      limit: number;
      /** where the limit comes from: a metric of the module, the module ratio of admission, or empty when not known */
      limit_from: 'metric' | 'module' | '';
      usage: Usage;
      /** over all the Pods together; absent when it could not be made */
      total?: Usage;
      coverage: number;
      expected_points: number;
      suggested: number;
      ratio: number;
      numerator: number;
      denominator: number;
      reclaimable: number;
      status: Status;
      grade: Grade;
      confidence: Level;
      risk: Level;
      throttle: number;
      oom_kills: number;
      oom_working_set: number;
      reasons: string[];
      formula: string;
      formula_version: string;
    }

    /** a result that was stored: the figures of Result, with the total quantiles flat */
    interface Stored {
      id: number;
      created_at: string;
      module_id: number;
      resource: Resource;
      window_minutes: number;
      replicas: number;
      request: number;
      limit: number;
      /** where the limit comes from: a metric of the module, the module ratio of admission, or empty when not known */
      limit_from: 'metric' | 'module' | '';
      points: number;
      expected_points: number;
      coverage: number;
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      max: number;
      total_p50: number;
      total_p90: number;
      total_p95: number;
      total_p99: number;
      total_max: number;
      suggested: number;
      ratio: number;
      numerator: number;
      denominator: number;
      reclaimable: number;
      status: Status;
      grade: Grade;
      confidence: Level;
      risk: Level;
      throttle: number;
      oom_kills: number;
      oom_working_set: number;
      reasons: string[];
      formula: string;
      formula_version: string;
    }

    interface Row {
      module_id: number;
      name: string;
      namespace: string;
      workload_kind: string;
      workload: string;
      replicas: number;
      health: Health;
      analyzed_at: string;
      cpu: Stored | null;
      memory: Stored | null;
    }

    interface Totals {
      request: number;
      reclaimable: number;
      after: number;
      share: number;
    }

    interface Board {
      window_minutes: number;
      window: string;
      analyzed_at: string | null;
      modules: number;
      analyzed: number;
      cpu: Totals;
      memory: Totals;
      over: number;
      under: number;
      risk: number;
      limited: number;
      basis: string;
      rows: Row[];
    }

    interface Chart {
      resource: Resource;
      step_seconds: number;
      ts: number[];
      value: number[];
      ma5: number[];
      ma15: number[];
      ma25: number[];
      ma_labels: string[];
      request: number;
      suggested: number;
    }

    interface JVM {
      expected: boolean;
      present: boolean;
      heap_used?: Usage;
      heap_max?: Usage;
      nonheap_used?: Usage;
      working_set_p99: number;
      hints: string[];
    }

    interface Window {
      label: string;
      window_minutes: number;
      cpu: Result | null;
      memory: Result | null;
    }

    interface Detail {
      module_id: number;
      name: string;
      namespace: string;
      workload_kind: string;
      workload: string;
      replicas: number;
      at: string;
      windows: Window[];
      jvm?: JVM;
      charts?: Chart[];
      history: Stored[];
      metrics: MetricStat[];
    }

    /** another metric the module has set up (container, JVM, throttling, OOM ...), over the window */
    interface MetricStat {
      key: string;
      name: string;
      kind: string;
      group: 'container' | 'jvm' | 'throttle' | 'oom' | 'other';
      level: string;
      unit: string;
      points: number;
      latest: number;
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      max: number;
    }

    /** what the cluster has to give, has given out and uses, asked of the Prometheus data source now */
    interface Cluster {
      datasource: { id: number; name: string };
      at: string;
      nodes: number;
      pods: number;
      allocatable_cpu: number;
      allocatable_memory: number;
      requested_cpu: number;
      requested_memory: number;
      used_cpu: number;
      used_memory: number;
      /** the PromQL that was sent */
      queries: Array<{ name: string; query: string }>;
      notes: string[];
    }

    /** the figures of one query set */
    interface PromQuantiles {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      max: number;
    }

    /** one metric of the module with its quantiles as the Prometheus data source computed them */
    interface PromMetric {
      key: string;
      name: string;
      kind: string;
      group: string;
      level: string;
      unit: string;
      /** the quantiles of the sum over the Pods */
      total?: PromQuantiles;
      /** the quantiles of one Pod (the query over the ready replicas), or of one container */
      pod?: PromQuantiles;
      /** the PromQL of the mapping as rendered for the module */
      query: string;
      replicas?: string;
      /** the whole query of the P95 as it was sent */
      example?: string;
      error?: string;
    }

    interface PromStats {
      datasource: { id: number; name: string };
      at: string;
      window_minutes: number;
      window: string;
      step: string;
      metrics: PromMetric[];
    }

    interface RunResult {
      analyzed: number;
      at: string;
      failed?: string;
    }
  }
}
