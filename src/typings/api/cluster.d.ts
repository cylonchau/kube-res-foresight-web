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
  }
}
