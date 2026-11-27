/**
 * A heavy read (the analysis of a module, the table of the resource dashboard, the cluster figures) asks Prometheus for a long window. When it does not finish within the
 * request the platform answers 202 with `{ pending: true }` and goes on working by itself; the answer is kept for the next ask. The page asks again every few seconds
 * until it has the answer, instead of waiting in one request that a gateway cuts with a 504.
 */

/** the sign the platform answers with while it works */
export interface PendingBody {
  pending: true;
  retry_after_seconds?: number;
  /** how far the work has come, when the platform has counted it */
  progress?: PendingProgress;
}

/** the stage a read is in (`metrics`: the queries of one module, `modules`: the modules of a table) and how many of its units are answered */
export interface PendingProgress {
  stage?: string;
  done: number;
  total: number;
}

export function isPending(value: unknown): value is PendingBody {
  return Boolean(value) && typeof value === 'object' && (value as { pending?: unknown }).pending === true;
}

export interface UntilAnsweredOptions {
  /** the most it waits in all; the platform works for at most 5 minutes by default (http.background_read_seconds) */
  maxWaitMs?: number;
  /** told how many seconds have passed, and how far the platform's work has come, each time it asks again */
  onWait?: (seconds: number, progress?: PendingProgress) => void;
  /** true when the answer is not wanted any more (the page moved on): it stops asking */
  cancelled?: () => boolean;
  /** how long to wait between two asks when the platform does not say */
  defaultDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const sleepFor = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** the time the page waits for the platform's own work before it says so: the background time of the platform (300 s by default) and a little more */
export const DEFAULT_MAX_WAIT_MS = 330_000;

/**
 * Calls `call` and, while the platform says it is being worked out, calls it again after the delay it names. The result is that of the last call. A wait that passes
 * the limit, or a page that moved on, ends with the last result as it is (no data and no error when nothing came).
 */
export async function untilAnswered<R extends { data: unknown; error: unknown }>(
  call: () => Promise<R>,
  options: UntilAnsweredOptions = {}
): Promise<R> {
  const { maxWaitMs = DEFAULT_MAX_WAIT_MS, onWait, cancelled, defaultDelayMs = 3000 } = options;
  const sleep = options.sleep ?? sleepFor;
  const now = options.now ?? Date.now;
  const started = now();
  let result = await call();
  while (isPending(result.data)) {
    if (cancelled?.()) return result;
    const waited = now() - started;
    if (waited >= maxWaitMs) {
      return {
        ...result,
        data: null,
        error: new Error('The platform is still reading from Prometheus; try again in a moment.')
      };
    }
    onWait?.(Math.round(waited / 1000), result.data.progress);
    const delay = (result.data.retry_after_seconds ?? 0) * 1000 || defaultDelayMs;
    await sleep(delay);
    if (cancelled?.()) return result;
    result = await call();
  }
  return result;
}
