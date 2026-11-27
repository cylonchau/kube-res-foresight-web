declare namespace Api {
  /** the fixed formula of the resource analysis: the second source of a decision, next to the forecasts of the algorithms */
  namespace Rule {
    /** what a module follows: the forecasts of its algorithms, or the fixed formula made of the P90, P95 and P99 of the real use */
    type DecisionSource = 'algorithm' | 'rule';

    /** how far a decision of the formula has gone */
    type State =
      | 'not_followed'
      | 'observe_only'
      | 'unavailable'
      | 'pending'
      | 'recommended'
      | 'admission'
      | 'waiting_operator'
      | 'executed';

    /** one calculation: replicas now and needed, the Pod spec now and recommended (CPU in millicores, memory in bytes), the percentiles it was made of */
    interface Decision {
      id: number;
      created_at: string;
      checked_at: string;
      module_id: number;
      period: string;
      caliber: string;
      mode: string;
      replicas_set: boolean;
      current_replicas: number;
      recommended_replicas: number;
      replicas_delta: number;
      direction: string;
      binding: string;
      this_round: number;
      replicas_formula: string;
      cpu_set: boolean;
      cpu_current_milli: number;
      cpu_recommended_milli: number;
      cpu_limit_milli: number;
      memory_set: boolean;
      memory_current_bytes: number;
      memory_recommended_bytes: number;
      memory_limit_bytes: number;
      cpu_p90: number;
      cpu_p95: number;
      cpu_p99: number;
      memory_p90: number;
      memory_p95: number;
      memory_p99: number;
      cpu_status: string;
      memory_status: string;
      confidence: string;
      certain: boolean;
      caution: string;
      partial: boolean;
      reasons: string;
      formula: string;
    }

    interface Row {
      module_id: number;
      name: string;
      namespace: string;
      workload: string;
      cluster?: string;
      mode: string;
      enabled: boolean;
      decision_source: DecisionSource;
      state: State;
      rule: Decision | null;
    }

    interface Side {
      replicas: number;
      cpu_milli: number;
      memory_bytes: number;
      algorithm?: string;
      score?: number;
    }

    interface Effective {
      version: number;
      created_at: string;
      valid_until: string;
      mode: string;
      replicas: number;
      replicas_set: boolean;
      replicas_source: string;
      cpu_milli: number;
      cpu_source: string;
      memory_bytes: number;
      memory_source: string;
      rule_decision_id: number;
      degraded: boolean;
    }

    interface Execution {
      id: number;
      created_at: string;
      current: number;
      ready: number;
      desired: number;
      action: string;
      result: string;
      reason: string;
      decision_version: number;
    }

    interface Dispatch {
      module_id: number;
      name: string;
      mode: string;
      enabled: boolean;
      decision_source: DecisionSource;
      state: State;
      why?: string;
      rule: Decision | null;
      algorithm: Side | null;
      effective: Effective | null;
      executions: Execution[];
    }
  }
}
