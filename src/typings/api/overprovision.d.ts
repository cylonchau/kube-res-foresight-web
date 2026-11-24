declare namespace Api {
  /** the over-provisioning analysis of the modules (P10 A2): what a Pod requests against what it used, and what the use supports */
  namespace Overprovision {
    type Resource = 'cpu' | 'memory';
    type Status = 'over' | 'ok' | 'under' | 'limited' | 'unknown';
    type Grade = 'severe' | 'moderate' | 'mild' | 'reasonable' | '';
    type Level = 'high' | 'medium' | 'low';

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
      /** the Requests and the Limits of all the Pods together as Prometheus has them (0 = not known): the Pods in the sum are not always the ready replicas */
      request_total: number;
      limit_total: number;
      /** where the limit comes from: a metric of the module, the module ratio of admission, or empty when not known */
      limit_from: 'metric' | 'module' | '';
      usage: Usage;
      /** over all the Pods together; absent when it could not be made */
      total?: Usage;
      coverage: number;
      expected_points: number;
      /** the request the use supports (one Pod), with or without a request to compare with; 0 when none is made */
      suggested: number;
      /** what the use asks of the request by the bands (before it is kept, lowered or raised by the verdict); 0 when none is made */
      needed: number;
      /** the limit that goes with it: the P99 with the headroom, never below the suggested request */
      suggested_limit: number;
      /** the use of each percentile as a share of the request (0 to 1 and over); absent when there is no request */
      shares?: Usage;
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

    interface Chart {
      resource: Resource;
      step_seconds: number;
      ts: number[];
      value: number[];
      request: number;
      suggested: number;
      /** the use of all the replicas together over the window (the sum over the Pods) */
      total_ts: number[];
      total: number[];
      /** the replicas now: the request and the suggestion of one Pod times this are drawn against the total */
      replicas: number;
    }

    interface JVM {
      expected: boolean;
      present: boolean;
      heap_used?: Usage;
      heap_max?: Usage;
      nonheap_used?: Usage;
      /** what the JVM asked the system for: shown next to the use, never taken for the memory of the container */
      heap_committed?: Usage;
      nonheap_committed?: Usage;
      nonheap_max?: Usage;
      gc_count?: Usage;
      gc_pause?: Usage;
      working_set_p99: number;
      hints: string[];
    }

    /** what is asked of one percentile against the request: the share it takes at the recommended request, and the range of shares that is reasonable */
    interface Band {
      target: number;
      low: number;
      high: number;
    }

    /** the numbers of the verdict (shares are 0 to 1) */
    interface Params {
      p90: Band;
      p95: Band;
      p99: Band;
      limit_headroom: number;
      oom_uplift: number;
      throttle_limit: number;
      baseline_minutes: number;
      severe: number;
      moderate: number;
      coverage_high: number;
      coverage_mid: number;
      peak_near_limit: number;
    }

    /** the constraints the module sets on its replicas in module management (0 = not set) */
    interface ReplicaLimits {
      min: number;
      max: number;
      scale_up_step: number;
      scale_down_step: number;
    }

    /** what one resource asks of the number of replicas when the Pod keeps the Requests it has */
    interface ReplicaPart {
      name: string;
      /** the sum of the use of all the Pods at that percentile */
      total: number;
      /** the share of the Requests of a Pod the percentile is wanted to take */
      target: number;
      needed: number;
    }

    interface ReplicaNeed {
      resource: string;
      needed: number;
      request: number;
      limit: number;
      parts: ReplicaPart[];
      limit_needed: number;
      formula: string;
    }

    /** the recommendation of the replicas for the Pod the module has now: the other way to the same use (the Pod spec stays, the replicas move) */
    interface ReplicaPlan {
      /** the replicas the cluster has now (0 = not known) */
      current: number;
      /** the recommended number (0 = no plan), and the number the use asks for before the floor, the step and the guards */
      needed: number;
      raw: number;
      direction: 'out' | 'in' | 'same' | 'unknown';
      /** needed - current (negative: fewer), and its share of the replicas now */
      delta: number;
      share: number;
      binding: string;
      resources: ReplicaNeed[];
      /** what to change first: the replicas, the Pod spec (when the replicas cannot do it) or nothing */
      primary: 'replicas' | 'config' | 'none';
      /** the constraints of the module the plan was held to */
      limits: ReplicaLimits;
      reasons: string[];
      formula: string;
    }

    interface Window {
      label: string;
      window_minutes: number;
      cpu: Result | null;
      memory: Result | null;
      replica_plan?: ReplicaPlan | null;
    }

    interface Detail {
      module_id: number;
      name: string;
      namespace: string;
      workload_kind: string;
      workload: string;
      replicas: number;
      /** where the replicas now come from: what the workload is set to in Kubernetes (read by the operator), the replicas metric of Prometheus, or the newest sample stored of it; empty when there is none */
      replicas_from?: 'kubernetes' | 'prometheus' | 'stored' | '';
      /** how many of them are ready (when they come from Kubernetes) */
      replicas_ready?: number;
      /** when they were measured (unix seconds), and the fewest and the most of the recommendation period */
      replicas_at?: number;
      replicas_min?: number;
      replicas_max?: number;
      at: string;
      windows: Window[];
      /** the analysis over the recommendation period (a system parameter, apart from the window): the verdict and the recommended Requests and Limits are its */
      recommend?: Window;
      params?: Params;
      jvm?: JVM;
      charts?: Chart[];
      metrics: MetricStat[];
      /** where the figures were read: the Prometheus data source and the query of each metric with what came of it */
      datasource: { id: number; name: string };
      queries: LiveQuery[];
      /** the time limit of the request stopped some of the queries (skipped counts them); the others are complete */
      partial: boolean;
      skipped: number;
    }

    /** the query sent to Prometheus for one metric of the module */
    interface LiveQuery {
      key: string;
      name: string;
      kind: string;
      group: string;
      level: string;
      unit: string;
      query: string;
      /** what the query answers: one Pod or all the replicas together */
      per: 'pod' | 'total';
      /** the metric template the query comes from, and whether the metric is only shown (no weight, no algorithm) */
      template: string;
      display: boolean;
      /** a warning about a query that ran all the same: it looks like the wrong one */
      note?: string;
      /** the step of the range query: the figures are made of one sample for each step */
      step: string;
      /** how many samples the query answered */
      points: number;
      error?: string;
      skipped?: boolean;
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
      /** a metric that is only shown: no weight, no algorithm */
      display: boolean;
      /** the series over the window (of one Pod where the metric is of Pods), thinned to what a chart draws */
      ts?: number[];
      value?: number[];
    }

    /** where the text of a query of the cluster comes from: a metric mapping of the data source, the system parameter, or the default */
    type QuerySource = 'mapping' | 'parameter' | 'default' | 'none';

    /** a query sent for the cluster or the nodes, with what it answered */
    interface ClusterQuery {
      name: string;
      title: string;
      /** the metric kind of the metric mapping that replaces it */
      kind: string;
      query: string;
      source: QuerySource;
      mapping?: string;
      mapping_id?: number;
      value?: number;
      error?: string;
    }

    /** what the cluster has to give, has given out and uses, asked of the Prometheus data source now */
    interface Cluster {
      datasource: { id: number; name: string };
      at: string;
      nodes: number;
      nodes_ready: number;
      pods: number;
      allocatable_cpu: number;
      allocatable_memory: number;
      requested_cpu: number;
      requested_memory: number;
      used_cpu: number;
      used_memory: number;
      /** the PromQL that was sent */
      queries: ClusterQuery[];
      notes: string[];
      /** some figure has a metric mapping in the data source */
      configured: boolean;
      /** the metric kinds with no mapping in the data source */
      missing: string[];
      /** set when the cluster could not be read at all: no_datasource or unreachable */
      reason?: 'no_datasource' | 'unreachable';
      message?: string;
    }

    /** one managed cluster: a Prometheus data source that has cluster metric templates declared */
    interface ClusterEntry {
      datasource_id: number;
      name: string;
      enabled: boolean;
      /** how many of the cluster metric kinds have a template on the data source, of how many there are */
      declared: number;
      total: number;
      missing: string[];
      /** the data source the system parameter cluster.datasource_id names */
      primary: boolean;
    }

    interface ClusterList {
      count: number;
      clusters: ClusterEntry[];
    }

    /** the requests and limits of one Pod of a module (CPU in cores, memory in bytes), as Prometheus answered; null where it did not, and errors says why */
    interface ModuleResources {
      module_id: number;
      cpu_request: number | null;
      cpu_limit: number | null;
      memory_request: number | null;
      memory_limit: number | null;
      errors: Record<string, string>;
    }

    interface ResourceList {
      at: string;
      rows: ModuleResources[];
      partial: boolean;
      skipped: number;
    }
  }
}
