declare namespace Api {
  /** what the operator reports of the cluster and of the workloads of the modules (P10 A1), and the Grafana links of the pages (A4) */
  namespace Inventory {
    interface Resources {
      cpu_milli: number;
      memory_bytes: number;
    }

    interface Container {
      name: string;
      requests: Resources;
      limits: Resources;
    }

    interface Pod {
      name: string;
      node?: string;
      phase: string;
      ready: boolean;
      restarts: number;
      started_at?: string;
    }

    interface Hpa {
      /** hpa: the HorizontalPodAutoscaler; keda: the ScaledObject */
      kind: 'hpa' | 'keda' | string;
      name: string;
      min: number;
      max: number;
      current: number;
      desired: number;
      behavior?: string;
    }

    interface TrendPoint {
      observed_at: string;
      desired: number;
      ready: number;
      hpa_kind: string;
      hpa_min: number;
      hpa_max: number;
      hpa_current: number;
      hpa_desired: number;
      restarts: number;
    }

    interface Change {
      path: string;
      from: string;
      to: string;
    }

    interface ChangeView {
      observed_at: string;
      summary: string;
      changes: Change[];
    }

    /** the workload of one module as the operator last reported it, with the history of its configuration and the trend of its replicas */
    interface Workload {
      module_id: number;
      cluster: string;
      reported: boolean;
      stale: boolean;
      observed_at: string | null;
      namespace: string;
      kind: string;
      name: string;
      desired: number;
      ready: number;
      available: number;
      updated: number;
      missing: boolean;
      error: string;
      containers: Container[];
      pods: Pod[];
      hpa: Hpa | null;
      changes: ChangeView[];
      trend: TrendPoint[];
    }

    interface NodeTotals {
      nodes: number;
      ready: number;
      unschedulable: number;
      alloc_cpu_milli: number;
      alloc_memory_bytes: number;
      cap_cpu_milli: number;
      cap_memory_bytes: number;
      module_pods: number;
      req_cpu_milli: number;
      req_memory_bytes: number;
      lim_cpu_milli: number;
      lim_memory_bytes: number;
    }

    interface NodeRow {
      id: number;
      observed_at: string;
      cluster: string;
      /** the name of the node */
      node: string;
      ready: boolean;
      unschedulable: boolean;
      pressure_list: string[];
      provider: string;
      region: string;
      zone: string;
      instance_type: string;
      kubelet_version: string;
      cap_cpu_milli: number;
      cap_memory_bytes: number;
      alloc_cpu_milli: number;
      alloc_memory_bytes: number;
      module_pods: number;
      req_cpu_milli: number;
      req_memory_bytes: number;
      lim_cpu_milli: number;
      lim_memory_bytes: number;
    }

    /** the cluster as the newest report of the operator saw it */
    interface Nodes {
      cluster: string;
      at: string | null;
      reported: boolean;
      stale: boolean;
      totals: NodeTotals;
      nodes: NodeRow[];
      providers: Record<string, number>;
      regions: Record<string, number>;
      zones: Record<string, number>;
      instance_types: Record<string, number>;
    }

    interface NodeTrendPoint {
      observed_at: string;
      nodes: number;
      ready: number;
    }

    /** what one node uses and has been asked for now, asked of the Prometheus data source; a figure the query did not return is null */
    interface NodeFigures {
      cpu_used: number | null;
      memory_used: number | null;
      cpu_requested: number | null;
      memory_requested: number | null;
      cpu_allocatable: number | null;
      memory_allocatable: number | null;
      ready: boolean | null;
    }

    interface NodeUsage {
      datasource: { id: number; name: string };
      at: string;
      nodes: Record<string, NodeFigures>;
      queries: Api.Overprovision.ClusterQuery[];
      notes: string[];
      reason?: 'no_datasource' | 'unreachable';
      message?: string;
    }

    /** a workload as the table of the dashboard shows it */
    interface WorkloadSummary {
      module_id: number;
      kind: string;
      name: string;
      namespace: string;
      desired: number;
      ready: number;
      missing: boolean;
      stale: boolean;
      hpa_kind: string;
      hpa_min: number;
      hpa_max: number;
      pods: number;
      restarts: number;
      cpu_request_milli: number;
      cpu_limit_milli: number;
      memory_request_bytes: number;
      memory_limit_bytes: number;
      reported: boolean;
    }
  }

  namespace Grafana {
    interface Settings {
      base_url: string;
      dashboard_uid: string;
      cluster: string;
      platform_url: string;
      /** false while there is no Grafana address: the pages show no link */
      configured: boolean;
    }
  }
}
