declare namespace Api {
  namespace Forecast {
    /** the key of a metric source of a module: its kind, then kind_2 ... for further sources of the same kind */
    type Metric = string;
    /** how the sources of one resource are combined: weighted mean, the largest, the sum, or the one with the lowest priority number */
    type CombineMode = 'weighted' | 'max' | 'sum' | 'primary';
    type MetricKind =
      | 'cpu'
      | 'memory'
      | 'gpu'
      | 'gpu_memory'
      | 'rps'
      | 'replicas'
      | 'network_rx'
      | 'network_tx'
      | 'custom'
      | AuxMetric;
    type MetricCategory = 'cpu' | 'memory' | 'gpu' | 'network' | 'other';
    type SourceAggregation = 'avg' | 'max' | 'min' | 'last' | 'sum';
    type SourceMissing = 'interpolate' | 'forward_fill' | 'zero' | 'skip';
    type SourceResource = 'cpu' | 'memory' | 'gpu' | 'replicas' | 'signal';
    type SourceStat = 'avg' | 'p50' | 'p90' | 'p95' | 'p99' | 'max' | 'sum' | 'last';
    type SourceBasis = 'forecast' | 'history';
    type MaxReplicasMode = 'fixed' | 'dynamic';
    type ReplicaMode = 'fixed' | 'dynamic';
    type CapacityMode = 'manual' | 'estimate';
    type Mode = 'observe' | 'recommend' | 'admission' | 'auto';
    type WorkloadKind = 'Deployment' | 'StatefulSet' | 'DaemonSet';

    /**
     * A module is one Kubernetes workload (namespace, kind and name). It owns the metrics to read (its sources, with
     * their thresholds), the history window and the forecast period, and the policy for applying recommendations.
     * Every enabled algorithm applies to it automatically.
     */
    interface Module {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      description: string;
      enabled: boolean;
      mode: Mode;
      namespace: string;
      workload_kind: WorkloadKind;
      workload: string;
      /** optional values of the {{service}} and {{container}} variables of the sources' PromQL; not part of the workload identity */
      service: string;
      container: string;
      /** the history collected and trained on, and how far ahead every algorithm forecasts */
      lookback_hours: number;
      horizon_minutes: number;
      max_fill_steps: number;
      /** the sampling granularity of the dataset in seconds; 0 keeps the step of each source's query */
      step_seconds: number;
      /** the fewest points a source needs before it is forecast; 0 = what each algorithm needs */
      min_points: number;
      /** admission sets the limits of new Pods to the recommended request x this ratio; 0 leaves the limit alone */
      limit_cpu_ratio: number;
      limit_memory_ratio: number;
      /** how fast the operator moves the replicas, per direction: the most replicas per action and the wait since the last action; 0 = no limit */
      scale_up_max_step: number;
      scale_down_max_step: number;
      scale_up_cooldown_seconds: number;
      scale_down_cooldown_seconds: number;
      /** how many of the newest steps an algorithm trains on; 0 = the whole history range */
      window_steps: number;
      /** how often the scheduler collects and forecasts the module; 0 = at every cycle of the task */
      run_interval_minutes: number;
      fallback_min_history_ratio: number;
      max_missing_ratio: number;
      /** the metric sources of the module */
      sources?: Source[];
      ttl_seconds: number;
      bypass: boolean;
      bypass_reason: string;
      min_cpu_milli: number;
      max_cpu_milli: number;
      min_memory_bytes: number;
      max_memory_bytes: number;
      min_replicas: number;
      max_replicas: number;
      fallback_cpu_milli: number;
      fallback_memory_bytes: number;
      fallback_replicas: number;
      headroom_ratio: number;
      pod_capacity_rps: number;
      timezone: string;
      replica_mode: ReplicaMode;
      capacity_mode: CapacityMode;
      pod_cpu_request_milli: number;
      pod_memory_request_bytes: number;
      target_utilization: number;
      /** the lowest score an algorithm instance may have for its forecast to be used */
      min_score: number;
      max_replicas_mode: MaxReplicasMode;
      hard_max_replicas: number;
      expand_step_ratio: number;
      min_gpu: number;
      max_gpu: number;
      fallback_gpu: number;
      oom_lookback_days: number;
      oom_memory_uplift: number;
      jvm_heap_pressure: number;
      recover_cycles: number;
      /** what the module is connected to; only on the list */
      summary?: ModuleSummary;
    }

    interface ModuleSummary {
      latest_version: number;
      latest_at: string | null;
      degraded: boolean;
      /** JSON object: field -> reason code */
      degrade_reasons: string;
      oom_floor: boolean;
      consecutive_failures: number;
      last_error: string;
      healthy_cycles: number;
      /** the configuration the newest snapshot sets; null = that resource is not set (shown empty) */
      cpu_milli: number | null;
      memory_bytes: number | null;
      replicas: number | null;
      gpu: number | null;
      /** the replica count the operator reported last */
      actual_replicas: number | null;
      ready_replicas: number | null;
    }

    /** the auxiliary metric kinds a source can take besides the forecast ones */
    type AuxMetric =
      | 'latency'
      | 'oom'
      | 'oom_working_set'
      | 'jvm_heap_used'
      | 'jvm_heap_max'
      | 'jvm_nonheap_used'
      | 'jvm_gc_pause'
      | 'jvm_threads'
      | 'k8s_cpu_requests'
      | 'k8s_cpu_limits'
      | 'k8s_mem_requests'
      | 'k8s_mem_limits'
      | 'k8s_cpu_throttle'
      | 'cpu_util'
      | 'memory_util'
      | 'gpu_util'
      | 'gpu_memory_total'
      | 'network_conn'
      | 'network_error';

    /** one constraint of the replica solver, see decision.ConstraintResult */
    interface ReplicaConstraint {
      name: 'throughput' | 'cpu' | 'memory';
      metric: string;
      needed: number;
      peak_demand: number;
      unit_capacity: number;
      uncertainty: number;
      uncertainty_source: 'measured' | 'backtest' | 'headroom';
      algorithm: string;
      borrowed?: boolean;
      formula: string;
    }

    /** the replica count one algorithm asks for, see decision.ReplicaPlan */
    interface ReplicaPlan {
      algorithm: string;
      replicas: number;
      binding: 'throughput' | 'cpu' | 'memory' | 'bounds' | 'hold';
      constraints: ReplicaConstraint[];
      skipped?: string[];
      capacity_source: 'manual' | 'estimated' | 'none';
      clamped?: boolean;
      reason: string;
    }

    interface ReplicaDetail {
      mode: ReplicaMode;
      selected?: string;
      current_replicas?: number;
      capacity: {
        source: 'manual' | 'estimated' | 'none';
        rps_per_pod: number;
        note?: string;
        samples?: number;
        used?: number;
      };
      plans: ReplicaPlan[];
      notes?: string[];
    }

    type ModulePayload = Partial<
      Omit<Module, 'id' | 'created_at' | 'updated_at' | 'bypass' | 'bypass_reason' | 'summary' | 'sources'>
    > & { sources?: Array<SourcePayload & { name: string; kind: MetricKind; mapping_id: number }> };

    /** one metric source of a module, see model.MetricSource */
    interface Source {
      id: number;
      created_at: string;
      updated_at: string;
      module_id: number;
      key: string;
      name: string;
      kind: MetricKind;
      resource: SourceResource;
      mapping_id: number;
      priority: number;
      weight: number;
      stat: SourceStat;
      basis: SourceBasis;
      window_hours: number;
      threshold: number;
      enabled: boolean;
      remark: string;
      /** how the values are shaped into the dataset */
      scale: number;
      precision: number;
      aggregation: SourceAggregation;
      missing: SourceMissing;
    }

    /** a source of a dataset with what the page shows: its category, the query behind it and the grid it is sampled on */
    interface DatasetSource extends Source {
      category: MetricCategory;
      mapping_name: string;
      query: string;
      unit: string;
      /** the level of the mapping's query: workload, pod, container, ... */
      level: string;
      datasource_id: number;
      datasource_name: string;
      query_step_seconds: number;
      step_seconds: number;
    }

    /** a PromQL written for a source: the mapping is created together with it */
    interface CustomQuery {
      datasource_id: number;
      query: string;
      level?: string;
      unit?: string;
      step_seconds?: number;
    }

    interface DatasetCatalogKind {
      kind: MetricKind;
      unit: string;
      resource: SourceResource;
      basis: SourceBasis;
      missing: SourceMissing;
      auxiliary: boolean;
      unit_is_not_fixed: boolean;
    }

    interface DatasetCatalog {
      categories: Array<{ id: MetricCategory; kinds: DatasetCatalogKind[] }>;
      aggregations: SourceAggregation[];
      missing: SourceMissing[];
      steps_seconds: number[];
      max_step_seconds: number;
      periods: string[];
    }

    /** what an enabled algorithm needs of the dataset of a module on the grid of one source */
    interface Requirement {
      algorithm_id: string;
      metric: string;
      step_seconds: number;
      min_samples: number;
      required_seconds: number;
      available_steps: number;
      module_min_points: number;
      horizon_steps: number;
      ok: boolean;
      reason?: string;
    }

    interface SourcePayload {
      name?: string;
      kind?: MetricKind;
      resource?: SourceResource;
      mapping_id?: number;
      priority?: number;
      weight?: number;
      stat?: SourceStat;
      basis?: SourceBasis;
      window_hours?: number;
      threshold?: number;
      enabled?: boolean;
      remark?: string;
      scale?: number;
      precision?: number;
      aggregation?: SourceAggregation;
      missing?: SourceMissing;
      custom?: CustomQuery;
    }

    interface ModuleList {
      list: Module[];
      total: number;
    }

    interface ModuleSearchParams {
      page: number;
      page_size: number;
      keyword?: string;
      namespace?: string;
      mode?: Mode;
      enabled?: boolean;
    }

    interface ParamSpec {
      name: string;
      type: 'int' | 'float' | 'bool' | 'string';
      required: boolean;
      default?: number | boolean | string;
      min?: number;
      max?: number;
      enum?: string[];
      unit?: string;
      description: string;
    }

    interface AlgorithmDefinition {
      id: string;
      category: string;
      version: string;
      impl_version: string;
      baseline: boolean;
      description: string;
      /** the calculation in words and as a formula: what is done with the history to get a forecast */
      method?: string;
      complexity: string;
      min_history: string;
      /** whether the algorithm reads the other sources it takes part in as covariates */
      covariates: boolean;
      params: ParamSpec[];
      /** an algorithm written on the pages as a formula; the rest are Go implementations registered with the platform */
      custom: boolean;
      formula?: string;
      recursive?: boolean;
      min_samples?: number;
      /** the built-in algorithm a variant is derived from */
      base?: string;
    }

    /**
     * An algorithm of the catalog with its platform-wide setting: the definition (and its parameter schema) and how it
     * runs for every module. There is one per catalog algorithm; an enabled one is applied to every module automatically.
     */
    /** how far an algorithm has got into the pipeline: loaded and enabled, and what its latest run did */
    interface AlgorithmRuntime {
      state: 'disabled' | 'invalid' | 'waiting' | 'running' | 'skipped' | 'failed';
      reason?: string;
      runs: number;
      last_run_at: string | null;
      last_status?: string;
    }

    interface Algorithm extends AlgorithmDefinition {
      runtime: AlgorithmRuntime;
      /** builtin: Go code; variant: a built-in algorithm under another id with its own parameter values; formula: written on the pages */
      origin: 'builtin' | 'variant' | 'formula';
      enabled: boolean;
      note: string;
      /** the parameter values in force (defaults filled in) */
      values: Record<string, unknown>;
      weight: number;
      train_budget_seconds: number;
      promote_min_points: number;
      promote_min_improvement: number;
      promote_peak_tolerance: number;
      updated_at: string;
    }

    /** one parameter of a custom algorithm */
    interface ParamSchemaItem {
      name: string;
      type: 'int' | 'float' | 'bool';
      required?: boolean;
      default?: number | boolean;
      min?: number;
      max?: number;
      unit?: string;
      description: string;
    }

    interface AlgorithmCreatePayload {
      id: string;
      category?: string;
      description?: string;
      /** a formula algorithm gives the formula and its schema; a variant gives the built-in algorithm it derives from */
      formula?: string;
      base?: string;
      param_schema?: ParamSchemaItem[];
      min_samples?: number;
      recursive?: boolean;
      enabled?: boolean;
      params?: Record<string, unknown>;
      weight?: number;
    }

    interface FormulaCheckPayload {
      formula: string;
      param_schema: ParamSchemaItem[];
      min_samples: number;
      recursive: boolean;
      params?: Record<string, unknown>;
      horizon?: number;
    }

    interface FormulaCheckResult {
      ok: boolean;
      error?: string;
      history?: number[];
      forecast?: number[];
      step_seconds?: number;
    }

    interface FormulaHelp {
      functions: string[];
      variables: string[];
    }

    interface TrainingSummary {
      total: number;
      ok: number;
      skipped: number;
      failed: number;
      avg_duration_ms: number;
      last_at: string | null;
      algorithms: Array<{
        algorithm_id: string;
        ok: number;
        skipped: number;
        failed: number;
        avg_duration_ms: number;
        last_at: string | null;
        last_status: string;
        reasons: TrainingReasonCount[];
      }>;
      reasons: TrainingReasonCount[];
    }

    interface TrainingPoint {
      time: string;
      value: number;
    }

    /** what a training record worked on: the stored samples of its window and the forecast it wrote */
    interface TrainingData {
      unit: string;
      input: TrainingPoint[];
      forecast: TrainingPoint[];
    }

    interface TrainingReasonCount {
      status: string;
      reason: string;
      count: number;
    }

    /** the record of one run of an algorithm on a source of a module: what it read, with which parameters, and how it ended */
    interface TrainingRun {
      id: number;
      created_at: string;
      module_id: number;
      metric: string;
      algorithm_id: string;
      impl_version: string;
      model_version: string;
      params: string;
      formula: string;
      param_schema: string;
      status: 'ok' | 'skipped' | 'failed';
      reason: string;
      samples: number;
      step_seconds: number;
      horizon_steps: number;
      points: number;
      window_start: string | null;
      window_end: string | null;
      duration_ms: number;
      covariates: string;
      dropped_covariates: string;
      prediction_time: string;
    }

    interface AlgorithmSearchParams {
      page: number;
      page_size: number;
      keyword?: string;
      category?: string;
      enabled?: boolean | string;
    }

    interface AlgorithmPayload {
      /** a custom algorithm only: its formula, parameter schema, minimum history and category */
      formula?: string;
      param_schema?: ParamSchemaItem[];
      min_samples?: number;
      recursive?: boolean;
      category?: string;
      description?: string;
      enabled?: boolean;
      params?: Record<string, unknown>;
      weight?: number;
      train_budget_seconds?: number;
      promote_min_points?: number;
      promote_min_improvement?: number;
      promote_peak_tolerance?: number;
    }

    interface Period {
      id: number;
      module_id: number;
      name: string;
      enabled: boolean;
      priority: number;
      weekdays: number;
      start_minute: number;
      end_minute: number;
      abs_start: string | null;
      abs_end: string | null;
      cpu_milli: number;
      memory_bytes: number;
      replicas: number;
      remark: string;
    }

    type PeriodPayload = Partial<Omit<Period, 'id' | 'module_id'>>;

    interface QualityGap {
      from: string;
      to: string;
      steps: number;
    }

    interface Quality {
      start: string;
      end: string;
      step_seconds: number;
      expected: number;
      present: number;
      nan: number;
      missing_ratio: number;
      gaps: QualityGap[];
      longest_gap_steps: number;
      jumps: number;
      duplicates: number;
      latest_sample: string;
      latest_lag_seconds: number;
    }

    interface History {
      metric: Metric;
      step_seconds: number;
      /** points are averaged into buckets of this many seconds when the window is long */
      bucket_seconds: number;
      unit: string;
      points: Array<{ time: string; value: number }>;
      quality: Quality;
      /** nothing has been collected for the metric yet */
      not_collected?: boolean;
    }

    type RecordKind = 'scores' | 'backtests' | 'evaluations' | 'trainings' | 'executions' | 'admissions';

    interface BatchResult {
      done: number;
      failed: Array<{ id: string; error: string }>;
    }

    interface Candle {
      time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      mean: number;
      count: number;
    }

    /** a metric read from Prometheus for a window; `missing` only when Prometheus returned no sample in all of it */
    interface LiveSeries {
      metric: string;
      unit: string;
      step_seconds: number;
      bucket_seconds: number;
      candles: Candle[];
      quality: Quality;
      missing: boolean;
      query: string;
    }

    interface ComparePoint {
      time: string;
      value: number;
      predicted_at: string;
      replicas: number | null;
    }

    interface Compare {
      metric: string;
      unit: string;
      actual: LiveSeries | null;
      actual_replicas: LiveSeries | null;
      algorithms: Array<{ algorithm_id: string; points: ComparePoint[] }>;
      replica_basis: string;
      bucket_seconds: number;
      from: string;
      to: string;
      actual_error?: string;
      /** every enabled algorithm, with the reason for the ones that have no forecast in the window */
      statuses: AlgorithmStatus[];
    }

    interface QueryTestRequest {
      datasource_id: number;
      query: string;
      level?: string;
      metric?: string;
      unit?: string;
      step_seconds?: number;
      module_id?: number;
      namespace?: string;
      workload?: string;
      service?: string;
      container?: string;
      from?: string;
      to?: string;
      scale?: number;
      precision?: number;
    }

    interface QueryTestResult {
      ok: boolean;
      /** template, datasource, syntax, query, empty or ok */
      stage: string;
      error?: string;
      rendered?: string;
      unit?: string;
      samples: number;
      min: number;
      max: number;
      mean: number;
      last: number;
      points: Array<{ time: string; value: number }>;
      from: string;
      to: string;
    }

    interface CollectResult {
      metric: Metric;
      from: string;
      to: string;
      fetched: number;
      stored: number;
      pruned: number;
      quality: Quality;
      error?: string;
    }

    interface PredictOutcome {
      metric: Metric;
      algorithm_id: string;
      status: 'ok' | 'skipped' | 'failed';
      reason?: string;
      points: number;
      model_version?: string;
      covariates?: string[];
      dropped_covariates?: Record<string, string>;
    }

    interface BacktestMetrics {
      points: number;
      cutoffs: number;
      mae: number;
      rmse: number;
      wape: number;
      pinball: number;
      peak_under: number;
      coverage: number;
      alpha: number;
      /** mean of prediction minus actual; absent in results stored before it existed */
      bias?: number;
      /** WAPE with an underestimate counting under_weight times; absent (under_weight 0) in older results */
      risk_wape?: number;
      under_weight?: number;
      skipped?: string;
    }

    interface BacktestRun {
      id: number;
      created_at: string;
      module_id: number;
      metric: Metric;
      algorithm_id: string;
      model_version: string;
      baseline_id: string;
      window_start: string;
      window_end: string;
      step_seconds: number;
      horizon_steps: number;
      cutoffs: number;
      metrics: string;
      baseline_metrics: string;
      promoted: boolean;
      reason: string;
    }

    type AlgorithmState = 'ready' | 'skipped' | 'failed' | 'not_run' | 'no_result';

    /** the state of an enabled algorithm for a module metric, taken from the recorded runs */
    interface AlgorithmStatus {
      algorithm_id: string;
      status: AlgorithmState;
      reason: string;
      last_run_at?: string;
    }

    interface LeaderboardEntry {
      status: AlgorithmState;
      reason: string;
      metric: string;
      rank: number;
      algorithm_id: string;
      baseline: boolean;
      runs: number;
      points: number;
      wape: number;
      mae: number;
      bias: number;
      peak_under: number;
      risk_wape: number;
      coverage: number;
      beats_baseline?: boolean;
      promoted?: boolean;
    }

    interface Evaluation {
      id: number;
      created_at: string;
      module_id: number;
      metric: Metric;
      algorithm_id: string;
      prediction_time: string;
      points: number;
      mae: number;
      wape: number;
      bias: number;
      peak_under: number;
      coverage: number;
    }

    interface Recommendation {
      id: number;
      created_at: string;
      module_id: number;
      version: number;
      mode: Mode;
      valid_until: string;
      cpu_set: boolean;
      cpu_milli: number;
      cpu_source: string;
      memory_set: boolean;
      memory_bytes: number;
      memory_source: string;
      replicas_set: boolean;
      replicas: number;
      replicas_source: string;
      gpu_set: boolean;
      gpu: number;
      gpu_source: string;
      /** the algorithm instance whose forecast decided the recommendation, and its score */
      algorithm: string;
      score: number;
      effective_max_replicas: number;
      detail: string;
      degraded: boolean;
      /** JSON object: field -> reason code */
      degrade_reasons: string;
      oom_floor: boolean;
      /** the version of the Pod resource spec the snapshot carries: it changes only when the spec does */
      resource_version: number;
      resource_changed_at: string | null;
      /** the snapshot kept the spec in force although the forecast computed another value */
      resource_held: boolean;
      /** kept as history (the first, every change, one an hour at least) and why */
      snapshot: boolean;
      snapshot_reason: string;
    }

    type SnapshotState = 'pending' | 'applied' | 'failed' | 'expired' | 'advisory';

    interface SnapshotOutcome {
      Applied: number;
      Observed: number;
      Held: number;
      Conflict: number;
      Error: number;
      Admitted: number;
      LastAt: string | null;
      LastError: string;
    }

    /** a snapshot of the recommendation history with what became of it */
    interface Snapshot extends Recommendation {
      state: SnapshotState;
      state_reason: string;
      current: boolean;
      outcome: SnapshotOutcome;
      /** the version of the next snapshot (0 while this one is current) */
      span_end: number;
      executions?: Execution[];
    }

    type DegradeReason =
      | 'no_data'
      | 'stale_data'
      | 'insufficient_history'
      | 'predictor_failed'
      | 'no_prediction'
      | 'stale_prediction'
      | 'no_eligible_model'
      | 'recovering'
      | 'low_score'
      | 'short_history'
      | 'predict_timeout'
      | 'oom_floor';

    type FallbackKind = 'degrade' | 'rollback';

    interface ConfigPoint {
      set: boolean;
      value: number;
      source?: string;
    }

    /** what happened to one field: why, from which configuration to which */
    interface FallbackChange {
      field: 'cpu' | 'memory' | 'replicas' | 'gpu' | 'memory_floor';
      trigger: string;
      note?: string;
      original: ConfigPoint;
      target: ConfigPoint;
    }

    /** a degradation episode (a safe preset ran because the forecast, data or decision was not usable) or a rollback (a decided change was not applied) */
    interface FallbackRecord {
      id: string;
      kind: FallbackKind;
      at: string;
      module_id: number;
      changes: FallbackChange[];
      result_state: string;
      result: string;
      snapshot_id?: number;
      version?: number;
      execution_id?: number;
      recovered_at: string | null;
      duration_seconds: number;
      ongoing: boolean;
      reasons: Record<string, string>;
      notes: Record<string, string>;
    }

    interface Execution {
      id: number;
      created_at: string;
      module_id: number;
      namespace: string;
      scaler: string;
      target_kind: string;
      target_name: string;
      current: number;
      ready: number;
      desired: number;
      action: string;
      result: string;
      reason: string;
      /** the recommendation version the operator acted on */
      decision_version: number;
    }

    interface Paged<T> {
      list: T[];
      total: number;
    }

    interface SourceUsage {
      source: string;
      backtest?: { at: string; wape: number; peak_under: number; points: number; promoted: boolean; reason: string };
      measured?: { runs: number; wape: number; peak_under: number; points: number };
    }

    /** how one algorithm performs for one module: its accuracy on each of the module's forecast sources */
    interface UsageModule {
      module_id: number;
      module_name: string;
      namespace: string;
      workload: string;
      enabled: boolean;
      score: number | null;
      rank: number;
      source_usage: SourceUsage[];
      mode: Mode;
      /** the metrics of the dataset the algorithm runs on for this module */
      dataset: Array<{
        key: string;
        name: string;
        kind: string;
        category: string;
        unit: string;
        step_seconds: number;
        mapping: string;
        query: string;
        enabled: boolean;
      }>;
    }

    interface AlgorithmUsage {
      algorithm: AlgorithmDefinition;
      enabled: boolean;
      modules: UsageModule[];
    }

    /** one algorithm on one module, followed from the scheduled task down to the evaluation of its predictions */
    interface Trace {
      module: { id: number; name: string; enabled: boolean; mode: Mode };
      algorithm: string;
      algorithm_enabled: boolean;
      source: string;
      task: { task_type: string; defined: boolean; cron_expr?: string; enabled?: boolean };
      prediction: {
        present: boolean;
        prediction_time?: string;
        model_version?: string;
        points?: number;
        first_target?: string;
        last_target?: string;
        unit?: string;
        current_version?: string;
        version_current?: boolean;
      };
      evaluation?: Evaluation;
      backtest?: { id: number; at: string; promoted: boolean; reason: string; params_current: boolean };
      score?: { score: number; rank: number; at: string; windows: number; selected: boolean };
    }

    /** the figures behind a score, see scoring.Result; accuracies are 0..1 and negative when there was no data */
    /** a value per resource: cores, bytes, cards; a resource with no data in the window is absent */
    interface ScoreFigures {
      replicas: number;
      cpu?: number | null;
      memory?: number | null;
      gpu?: number | null;
    }

    /** one evaluated window as it entered the grade: the forecast, the actual need and the error of each resource */
    interface ScoreWindowDetail {
      start: string;
      end: string;
      predicted: ScoreFigures;
      actual: ScoreFigures;
      error: ScoreFigures;
      under_provisioned: boolean;
      oom: number;
      complete: boolean;
    }

    /** the newest grade of one algorithm of one module on one resource (or the combination) */
    interface ScoreRow {
      key: string;
      score_id: number;
      module_id: number;
      module_name: string;
      algorithm: string;
      algorithm_id: string;
      metric: 'cpu' | 'memory' | 'gpu' | 'overall';
      score: number;
      accuracy: number;
      rank: number;
      ranked: number;
      windows: number;
      at: string;
      selected: boolean;
      result?: ScoreDetail;
      breakdown?: BreakdownRow[];
    }

    interface ScoreDetail {
      details?: ScoreWindowDetail[];
      sources?: Record<string, string[]>;
      under_weight?: number;
      score: number;
      windows: number;
      replica_accuracy: number;
      cpu_accuracy: number;
      memory_accuracy: number;
      gpu_accuracy: number;
      replica_exact: number;
      under_provisioned: number;
      oom_events: number;
      oom_penalty: number;
      completeness: number;
    }

    /** one part of a score: accuracy and error on a resource, the weight it had and what it contributed */
    interface BreakdownRow {
      metric: 'replicas' | 'cpu' | 'memory' | 'gpu';
      accuracy: number;
      error: number;
      weight: number;
      contribution: number;
      /** the grade of this resource by itself (0-100): what ranks the algorithms for CPU, for memory and for GPU */
      score?: number;
    }

    /** how one algorithm forecast one source of a module against the actuals */
    interface MetricScore {
      algorithm_id: string;
      metric: string;
      source_name: string;
      kind: string;
      category: MetricCategory;
      unit: string;
      source_weight: number;
      weight: number;
      runs: number;
      points: number;
      mae: number;
      rmse: number;
      error: number;
      accuracy: number;
      bias: number;
      peak_under: number;
      coverage: number;
      in_composite: boolean;
    }

    interface AlgorithmCompositeScore {
      algorithm_id: string;
      baseline: boolean;
      custom: boolean;
      accuracy: number;
      error: number;
      score: number;
      rank: number;
      sources: number;
      runs: number;
      points: number;
      best: boolean;
      beats_baseline?: boolean;
    }

    interface MetricScores {
      module_id: number;
      algorithms: AlgorithmCompositeScore[];
      metrics: MetricScore[];
      best: string;
      comparable: boolean;
      sources: string[];
      /** enabled algorithms with nothing measured in the range, with the reason */
      unranked: AlgorithmStatus[];
    }

    interface CurrentRankingRow {
      algorithm: string;
      score: number;
      rank: number;
      windows: number;
      selected: boolean;
      at: string;
      result?: ScoreDetail;
      breakdown: BreakdownRow[];
      weight: number;
    }

    interface CurrentRanking {
      module_id: number;
      module_name: string;
      namespace: string;
      workload: string;
      best: string;
      selected: string;
      rows: CurrentRankingRow[];
    }

    interface HistoryRankingRow {
      algorithm: string;
      score: number;
      rank: number;
      windows: number;
      selected: boolean;
      breakdown: BreakdownRow[];
    }

    interface HistoryRanking {
      module_id: number;
      module_name: string;
      at: string;
      window_start: string;
      window_end: string;
      best: string;
      selected: string;
      rows: HistoryRankingRow[];
    }

    interface AlgorithmScore {
      id: number;
      created_at: string;
      module_id: number;
      module_name?: string;
      result?: ScoreDetail;
      breakdown?: BreakdownRow[];
      algorithm: string;
      algorithm_id: string;
      score: number;
      rank: number;
      windows: number;
      detail: string;
      window_start: string;
      window_end: string;
      selected: boolean;
    }

    interface RankingRow {
      name: string;
      algorithm_id: string;
      enabled: boolean;
      weight: number;
      score: number | null;
      rank: number;
      windows: number;
      selected: boolean;
      at: string | null;
      detail?: ScoreDetail;
      breakdown?: BreakdownRow[];
      /** rank and score at the evaluation before the latest one; null when it was evaluated once */
      previous_rank: number | null;
      previous_score: number | null;
      /** ready for a scored algorithm; otherwise why an enabled one has no score */
      status: AlgorithmState;
      reason: string;
    }

    interface Ranking {
      list: RankingRow[];
      selected: string;
      challenger: string;
      challenger_cycles: number;
    }

    interface Admission {
      id: number;
      created_at: string;
      module_id: number;
      namespace: string;
      workload: string;
      container: string;
      applied: boolean;
      reason: string;
      version: number;
      cpu_milli: number;
      memory_bytes: number;
      gpu: number;
      original_cpu_milli: number;
      original_memory_bytes: number;
      limit_cpu_milli: number;
      limit_memory_bytes: number;
      workload_kind: string;
      mode: string;
      algorithm: string;
    }

    /** one source's line of the multi-metric calculation, see multimetric.Row */
    interface CalcRow {
      key: string;
      name: string;
      kind: string;
      resource: SourceResource;
      stat: SourceStat;
      priority: number;
      weight: number;
      demand: number;
      threshold?: number;
      ratio?: number;
      share: number;
      used: boolean;
      triggered?: boolean;
      note?: string;
    }

    interface CalcResult {
      rows: CalcRow[];
      resources: Record<string, { value: number; combine: CombineMode; sources: string[] }>;
      pressure: number;
      max_ratio: number;
      triggered: boolean;
      notes?: string[];
    }

    interface SelectionRow {
      algorithm: string;
      catalog: string;
      score: number;
      scored: boolean;
      weight: number;
      value: number;
      rank: number;
      eligible: boolean;
      reason: string;
      chosen: boolean;
    }

    interface Expansion {
      mode: MaxReplicasMode;
      base: number;
      hard: number;
      wanted: number;
      effective: number;
      expanded: boolean;
      reason: string;
    }

    /** one entry of the forecast metric catalog, see forecastsvc.MetricDef */
    interface MetricDef {
      name: string;
      group: 'usage' | 'prediction' | 'performance' | 'execution';
      help: { zh: string; en: string };
      value: { zh: string; en: string };
      unit: string;
      labels: string[];
      table: string;
      time: string;
      agg: 'avg' | 'max' | 'last';
      retention_days: number;
      export?: { name: string; fixed?: Record<string, string> };
    }

    interface MetricSeries {
      labels: Record<string, string>;
      points: Array<{ ts: number; value: number }>;
    }

    interface MetricQueryResult {
      name: string;
      group: string;
      unit: string;
      agg: string;
      from: number;
      to: number;
      step_seconds: number;
      truncated: boolean;
      series: MetricSeries[];
    }

    interface MetricQueryParams {
      name: string;
      module_id: number;
      metric?: string;
      algorithm?: string;
      from?: string;
      to?: string;
      step?: number;
      max_points?: number;
    }
  }

  namespace Ldap {
    interface Settings {
      enabled: boolean;
      url: string;
      start_tls: boolean;
      skip_verify: boolean;
      has_ca_cert: boolean;
      bind_dn: string;
      has_bind_password: boolean;
      user_base_dn: string;
      user_filter: string;
      display_name_attr: string;
      email_attr: string;
      phone_attr: string;
      group_base_dn: string;
      group_filter: string;
      group_name_attr: string;
      timeout_seconds: number;
      default_role_code: string;
      /** one "directory group=role code" per line */
      group_role_mappings: string;
    }

    interface SettingsPayload extends Omit<Settings, 'has_ca_cert' | 'has_bind_password'> {
      ca_cert?: string;
      clear_ca_cert?: boolean;
      bind_password?: string;
    }

    interface TestResult {
      ok: boolean;
      error?: string;
      user?: { dn: string; display_name: string; email: string; groups: string[]; disabled: boolean; roles: string[] };
    }

    interface SyncResult {
      checked: number;
      disabled: number;
      enabled: number;
      refreshed: number;
    }
  }
}
