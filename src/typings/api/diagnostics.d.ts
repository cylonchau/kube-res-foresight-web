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
