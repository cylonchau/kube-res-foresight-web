import { request } from '../request';

const silent = { 'X-Silent-Error': '1' };
type Step = 'collect' | 'predict' | 'run' | 'backtest' | 'evaluate' | 'score';

import { isOpenState, watchTask } from '@/utils/task-watch';
import type { WatchOptions, WatchResult } from '@/utils/task-watch';

export type { WatchOptions, WatchResult };

export function isOpenTask(task: Pick<Api.Assistant.AsyncTask<unknown>, 'status'> | null | undefined) {
  return Boolean(task && isOpenState(task.status));
}

/** Reads a background task of the platform until it ends (see watchTask). */
export function watchAsyncTask<R>(id: number, options: WatchOptions<R> = {}): Promise<WatchResult<R>> {
  return watchTask<R>(
    id,
    {
      read: id2 =>
        request<Api.Assistant.AsyncTask<R>>({ url: `/api/v1/assistant/async/${id2}`, method: 'get', headers: silent }),
      cancel: id2 => request({ url: `/api/v1/assistant/async/${id2}/cancel`, method: 'post', headers: silent })
    },
    options
  );
}

/**
 * Runs a long step of a module in the background and waits for its result: the step is queued (the request that does it returns at once, so no
 * gateway cuts it), and the page reads the task every second until it ends. The result is what the synchronous endpoint of the same step would
 * have answered. Aborting the signal asks the platform to stop the task, which stops within a second.
 */
export async function runModuleStep<T>(
  moduleId: number,
  step: Step,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  onUpdate?: (task: Api.Assistant.AsyncTask<T>) => void
): Promise<{ data: T | null; error: unknown }> {
  const submitted = await request<Api.Assistant.AsyncTask<T>>({
    url: `/api/v1/modules/${moduleId}/steps/${step}`,
    method: 'post',
    data: body ?? {}
  });
  if (!submitted.data) return { data: null, error: submitted.error };
  const { data, error } = await watchAsyncTask<T>(submitted.data.id, { signal, cancelOnAbort: true, onUpdate });
  if (error && (error as { code?: string }).code !== 'ERR_CANCELED' && (error as { task?: unknown }).task) {
    window.$message?.error((error as Error).message);
  }
  return { data, error };
}

/** a long step of a module, queued: it comes back as a task that is followed (see useBackgroundTask) */
export function submitModuleStep(moduleId: number, step: Step, body?: object) {
  return request<Api.Assistant.AsyncTask<unknown>>({
    url: `/api/v1/modules/${moduleId}/steps/${step}`,
    method: 'post',
    data: body ?? {}
  });
}

/** the replay of a change of a module, queued: it comes back as a task (held to the limit of the pipeline, not to the gateway timeout) */
export function submitModulePreview(moduleId: number, body: object, signal?: AbortSignal) {
  return request<Api.Assistant.AsyncTask<unknown>>({
    url: `/api/v1/modules/${moduleId}/change-preview/async`,
    method: 'post',
    data: body,
    signal
  });
}
