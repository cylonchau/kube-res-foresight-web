declare namespace Api {
  /** what the database says about itself, for an administrator who looks for why a page is slow */
  namespace Diagnostics {
    interface Pool {
      max_open: number;
      open: number;
      in_use: number;
      idle: number;
      /** how many statements had to wait for a connection, and for how long in all */
      wait_count: number;
      wait_ms: number;
      max_idle_closed: number;
      max_lifetime_closed: number;
      max_idle_time_closed: number;
    }

    interface Table {
      name: string;
      /** the database's estimate (SQLite: counted, up to a bound) */
      rows: number;
      rows_capped: boolean;
      size_bytes: number;
      index_bytes: number;
      dead_rows: number;
      last_vacuum: string | null;
    }

    interface Index {
      table: string;
      name: string;
      size_bytes: number;
      scans: number;
    }

    interface RunningQuery {
      running_ms: number;
      state: string;
      wait_type: string;
      query: string;
    }

    interface WriteRate {
      module_id: number;
      rows: number;
    }

    interface Slowest {
      request_id: string;
      ms: number;
      status: number;
      at: string;
      abandoned?: boolean;
    }

    /** one route over the hours: the baseline of its time and where the time goes */
    interface RouteStat {
      method: string;
      route: string;
      count: number;
      status_4xx: number;
      status_5xx: number;
      /** stopped by the platform's own time limit (also in status_5xx) */
      timeouts: number;
      /** the other side (the browser, the gateway) gave up before the answer */
      abandoned: number;
      avg_ms: number;
      /** upper edges of the histogram buckets the percentile falls in: at most */
      p50_ms: number;
      p95_ms: number;
      p99_ms: number;
      max_ms: number;
      db_share: number;
      prom_share: number;
      db_avg_ms: number;
      prom_avg_ms: number;
      db_calls_avg: number;
      prom_calls_avg: number;
      layer: 'database' | 'prometheus' | 'handler';
      examples: Slowest[];
    }

    interface Boot {
      id: number;
      boot_id: string;
      instance: string;
      version: string;
      started_at: string;
      last_seen: string;
      stopped_at: string | null;
      graceful: boolean;
      unexpected: boolean;
      heap_bytes: number;
      sys_bytes: number;
      mem_limit: number;
    }

    /** one thing the numbers say, as a code with its figures; the page writes the sentence */
    interface Finding {
      level: 'critical' | 'warning' | 'info';
      code: string;
      route?: string;
      layer?: string;
      params?: Record<string, number | string>;
    }

    /** the cache of the heavy reports (P11 B3), as this process has used it since it started */
    interface CacheStats {
      hits: number;
      misses: number;
      shared: number;
      changed: number;
      expired: number;
      evictions: number;
      entries: number;
      bytes: number;
      max_bytes: number;
      /** the share of the requests that did not work the answer out, 0 to 1 */
      hit_rate: number;
    }

    /** forecasts that were made, and ones that a forecast already made stood for */
    interface ReuseStats {
      computed: number;
      reused: number;
    }

    interface Requests {
      cache: CacheStats;
      reuse: ReuseStats;
      hours: number;
      from: string;
      to: string;
      routes: RouteStat[];
      boots: Boot[];
      findings: Finding[];
      gateway_seconds: number;
      list_seconds: number;
      retention_days: number;
    }

    interface Database {
      driver: string;
      pool: Pool;
      tables: Table[];
      indexes: Index[];
      running: RunningQuery[];
      writes: WriteRate[];
      /** what the driver cannot say, or could not be read in time */
      unavailable: string[];
    }
  }
}
