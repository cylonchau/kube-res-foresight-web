/** the states a task is in while it has not ended */
export const OPEN_STATES = ['queued', 'running', 'cancelling'] as const;

export function isOpenState(status: string | undefined | null) {
  return OPEN_STATES.includes(status as (typeof OPEN_STATES)[number]);
}

/** an error that says the person stopped it (the abort signal, or the task was cancelled), not that something failed */
export function canceled() {
  return Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
}

/** how a task is read and stopped: the platform in the page, a fake in the tests */
export interface TaskIO<R> {
  read: (id: number) => Promise<{ data: Api.Assistant.AsyncTask<R> | null; error: unknown }>;
  cancel: (id: number) => Promise<unknown>;
}

export interface WatchOptions<R> {
  /** aborting stops the waiting; with cancelOnAbort it also asks the platform to stop the task */
  signal?: AbortSignal;
  cancelOnAbort?: boolean;
  /** called with every state of the task that is read: the progress, the stage, what it has done so far, the wait before another attempt */
  onUpdate?: (task: Api.Assistant.AsyncTask<R>) => void;
  /** how often the task is read, in milliseconds */
  intervalMs?: number;
  /** how long the waiting goes on; the task goes on after it */
  maxWaitMs?: number;
}

export interface WatchResult<R> {
  data: R | null;
  error: unknown;
  /** the last state of the task that was read */
  task: Api.Assistant.AsyncTask<R> | null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Reads a background task until it ends. A task that has to be tried again (its worker was lost, a data source did not answer) goes back to queued and
 * is read on; one that failed ends with the reason; one the person stopped ends as canceled; a result that expired is told as that. A read that fails is tried
 * again a few times: the platform may be restarting, and the task survives that.
 */
export async function watchTask<R>(id: number, io: TaskIO<R>, options: WatchOptions<R> = {}): Promise<WatchResult<R>> {
  const { signal, cancelOnAbort, onUpdate, intervalMs = 1000, maxWaitMs = 60 * 60 * 1000 } = options;
  const started = Date.now();
  let failures = 0;
  let last: Api.Assistant.AsyncTask<R> | null = null;
  while (Date.now() - started < maxWaitMs) {
    if (signal?.aborted) {
      if (cancelOnAbort) await io.cancel(id);
      return { data: null, error: canceled(), task: last };
    }
    const { data, error } = await io.read(id);
    if (data) {
      failures = 0;
      last = data;
      onUpdate?.(data);
      if (data.status === 'succeeded') return { data: (data.result ?? null) as R | null, error: null, task: data };
      if (data.status === 'failed')
        return {
          data: null,
          error: Object.assign(new Error(data.error || 'the task failed'), { task: data }),
          task: data
        };
      if (data.status === 'cancelled') return { data: null, error: canceled(), task: data };
      if (data.status === 'expired')
        return {
          data: null,
          error: Object.assign(new Error('the result of the task has expired'), { task: data }),
          task: data
        };
    } else {
      failures += 1;
      // the task is gone, or the platform has not answered five times in a row
      if ((error as { response?: { status?: number } } | null)?.response?.status === 404 || failures >= 5)
        return { data: null, error, task: last };
    }
    await sleep(intervalMs);
  }
  return { data: null, error: new Error('the task took too long to wait for: it may still finish'), task: last };
}
