declare namespace Api {
  /** the node pools a workload can be steered to: see model.NodePool */
  namespace NodePool {
    type Kind = 'cpu' | 'memory' | 'gpu' | 'general';

    interface Pool {
      id: number;
      created_at: string;
      updated_at: string;
      /** the cluster the pool is in; empty = every cluster */
      cluster: string;
      name: string;
      kind: Kind;
      /** the labels that select the nodes of the pool (the Node Selector of the Pod spec) */
      node_selector: Record<string, string>;
      /** what one node of the pool can give to Pods */
      node_cpu_milli: number;
      node_memory_bytes: number;
      node_gpu: number;
      enabled: boolean;
      priority: number;
      remark: string;
    }

    interface PoolList {
      list: Pool[];
      total: number;
      page: number;
      pageSize: number;
    }

    interface SearchParams {
      page: number;
      page_size: number;
      keyword?: string;
      kind?: Kind;
      enabled?: boolean;
    }

    type Payload = Partial<Omit<Pool, 'id' | 'created_at' | 'updated_at'>>;
  }
}
