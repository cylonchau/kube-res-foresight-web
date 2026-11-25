declare namespace Api {
  /** the clusters operators report from (P12): see model.Cluster */
  namespace Cluster {
    type EventOrigin = 'auto' | 'manual' | 'unclassified';

    interface Cluster {
      id: number;
      created_at: string;
      updated_at: string;
      name: string;
      description: string;
      enabled: boolean;
      is_default: boolean;
      /** the Prometheus data source its usage is asked of; 0 is the one of the system parameter */
      datasource_id: number;
      namespace_include: string[];
      namespace_exclude: string[];
      key_ids: number[];
      modules: number;
      last_seen_at: string | null;
      operator: string;
      events: number;
      last_event_at: string | null;
      /** an operator of the cluster asked the platform in the last minutes */
      connected: boolean;
    }

    interface ClusterList {
      list: Cluster[];
      total: number;
    }

    interface ClusterPayload {
      name?: string;
      description: string;
      enabled: boolean;
      datasource_id: number;
      namespace_include: string[];
      namespace_exclude: string[];
      key_ids: number[];
    }

    /** an access key that can be bound to a cluster */
    interface KeyChoice {
      id: number;
      name: string;
      masked_value: string;
      /** the cluster it is bound to now, empty when none */
      cluster: string;
      status: boolean;
    }

    interface KeyChoiceList {
      list: KeyChoice[];
      total: number;
    }

    /** a Kubernetes event as the operator reported it, and who the platform's rules say did it */
    interface Event {
      id: number;
      cluster: string;
      uid: string;
      type: string;
      reason: string;
      message: string;
      component: string;
      host: string;
      count: number;
      kind: string;
      namespace: string;
      name: string;
      object_uid: string;
      first_at: string;
      last_at: string;
      received_at: string;
      operator: string;
      origin: EventOrigin;
      category: string;
      rule: string;
    }

    interface EventList {
      list: Event[];
      total: number;
      page: number;
      pageSize: number;
      retention_days: number;
    }

    interface EventSearchParams {
      page: number;
      page_size: number;
      type?: string;
      origin?: string;
      category?: string;
      kind?: string;
      namespace?: string;
      name?: string;
      reason?: string;
      component?: string;
      search?: string;
    }

    type ChangeKind = 'Node' | 'Pod' | 'Workload' | 'HPA';

    /** one thing an object says about why it changed (a condition, a taint, how a container ended, who wrote the replicas) */
    interface ChangeReason {
      source: string;
      reason?: string;
      message?: string;
      component?: string;
    }

    interface Res {
      cpu_milli: number;
      memory_bytes: number;
    }

    interface PodRef {
      namespace: string;
      name: string;
      phase?: string;
      workload?: string;
      requests: Res;
      limits: Res;
    }

    interface ContainerState {
      name: string;
      restarts: number;
      state?: string;
      reason?: string;
      message?: string;
      exit_code?: number;
      last_reason?: string;
      last_exit_code?: number;
    }

    /** the configuration of the object when it changed, from the operator's cache at that moment */
    interface ChangeSnapshot {
      labels?: Record<string, string>;
      taints?: string[];
      capacity?: Res;
      allocatable?: Res;
      capacity_pods?: number;
      pod_count?: number;
      pods?: PodRef[];
      requests?: Res;
      limits?: Res;
      owner?: string;
      containers?: ContainerState[];
      desired?: number;
      ready?: number;
      available?: number;
      min?: number;
      max?: number;
      current?: number;
      target?: string;
    }

    interface UsagePoint {
      label: 'before' | 'at' | 'after';
      at: string;
      /** cores; null when Prometheus had none */
      cpu: number | null;
      /** bytes; null when Prometheus had none */
      memory: number | null;
    }

    interface UsageRecord {
      subject: string;
      source?: string;
      note?: string;
      points: UsagePoint[] | null;
    }

    interface Change {
      id: number;
      cluster: string;
      record_id: string;
      kind: ChangeKind;
      namespace: string;
      name: string;
      object_uid: string;
      type: string;
      from: string;
      to: string;
      occurred_at: string;
      observed_at: string;
      received_at: string;
      operator: string;
      node: string;
      workload: string;
      reasons: ChangeReason[];
      snapshot: ChangeSnapshot | null;
      usage: UsageRecord | null;
      usage_status: 'pending' | 'filled' | 'unavailable';
      usage_tries: number;
      usage_note: string;
    }

    interface ChangeList {
      list: Change[];
      total: number;
      page: number;
      pageSize: number;
      retention_days: number;
    }

    interface ChangeSearchParams {
      page: number;
      page_size: number;
      kind?: string;
      type?: string;
      namespace?: string;
      name?: string;
      node?: string;
      search?: string;
    }

    /** how another change is tied to this one: caused_by rests on evidence (said in `evidence`), related is only near it */
    interface ChangeLink {
      relation: 'caused_by' | 'related';
      direction: 'cause' | 'effect';
      evidence: string;
      change: Change;
    }

    interface ChangeExplanation {
      change: Change;
      events: Event[];
      causes: ChangeLink[];
      effects: ChangeLink[];
    }
  }
}
