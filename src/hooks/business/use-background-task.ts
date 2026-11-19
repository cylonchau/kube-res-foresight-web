import { onBeforeUnmount, reactive } from 'vue';
import {
  fetchAssistantAsyncTask,
  fetchCancelAssistantAsyncTask,
  fetchRetryAssistantAsyncTask
} from '@/service/api/assistant';
import { isOpenTask, watchAsyncTask } from '@/service/api/async-step';

export interface BackgroundState<R> {
  /** the last state of the task that was read */
  task: Api.Assistant.AsyncTask<R> | null;
  /** the result, once the task succeeded */
  result: R | null;
  /** why it did not succeed (empty when it was stopped on purpose) */
  error: string;
  /** a task is queued or running and the page is following it */
  active: boolean;
}

type Submit<R> = () => Promise<{ data: Api.Assistant.AsyncTask<R> | null; error: unknown }>;

/** the reason in a failed answer of the platform, else the message of the error */
export function reasonOf(error: unknown) {
  const e = error as { response?: { data?: { msg?: string } }; message?: string } | null;
  return e?.response?.data?.msg || e?.message || '';
}

/**
 * Follows one background task of a page (P11 B5): the page queues it and reads it until it ends, shows its progress, what it has done so far and the wait
 * before another attempt, can stop it and queue it again. The task belongs to the platform, not to the page: leaving the page only stops looking, and when
 * the page comes back `resume` finds the task it left (its id is kept under the key in the browser) and follows it on, so closing a page loses nothing.
 */
export function useBackgroundTask<R>(options: { storageKey: () => string | null }) {
  // the state holds a result of a type the caller chooses: it is not unwrapped as a reactive value
  const state = reactive({ task: null, result: null, error: '', active: false }) as BackgroundState<R>;
  let watching: AbortController | null = null;

  function remember(id: number | null) {
    const key = options.storageKey();
    if (!key) return;
    try {
      if (id) localStorage.setItem(`bg-task:${key}`, String(id));
      else localStorage.removeItem(`bg-task:${key}`);
    } catch {
      // storage can be off (a private window): the task is still followed while the page is open
    }
  }

  function remembered(): number {
    const key = options.storageKey();
    if (!key) return 0;
    try {
      return Number(localStorage.getItem(`bg-task:${key}`)) || 0;
    } catch {
      return 0;
    }
  }

  async function follow(id: number) {
    watching?.abort();
    const controller = new AbortController();
    watching = controller;
    state.active = true;
    state.error = '';
    state.result = null;
    const { data, error, task } = await watchAsyncTask<R>(id, {
      signal: controller.signal,
      onUpdate: update => {
        if (watching === controller) state.task = update;
      }
    });
    if (watching !== controller) return; // another task is followed now
    if (controller.signal.aborted) return; // the page was left: the task goes on and is found again
    state.active = false;
    if (task) state.task = task;
    remember(null);
    if (error) {
      const code = (error as { code?: string }).code;
      state.error = code === 'ERR_CANCELED' ? '' : reasonOf(error);
      return;
    }
    state.result = data;
  }

  /** queues the task and follows it */
  async function start(submit: Submit<R>) {
    state.task = null;
    state.result = null;
    state.error = '';
    state.active = true;
    const { data, error } = await submit();
    if (!data) {
      state.active = false;
      state.error = reasonOf(error);
      return;
    }
    state.task = data;
    remember(data.id);
    // an answer that was worked out before comes back already ended: following it reads it once and is done
    await follow(data.id);
  }

  /** follows the task this page left when it was closed, if it has not ended; false when there is none */
  async function resume() {
    const id = remembered();
    if (!id) return false;
    const { data } = await fetchAssistantAsyncTask(id);
    if (!data || !isOpenTask(data)) {
      remember(null);
      return false;
    }
    state.task = data as Api.Assistant.AsyncTask<R>;
    void follow(id);
    return true;
  }

  async function cancel() {
    if (state.task) await fetchCancelAssistantAsyncTask(state.task.id);
  }

  /** queues a failed or stopped task again with what it was given */
  async function retry() {
    if (!state.task) return;
    const { data, error } = await fetchRetryAssistantAsyncTask(state.task.id);
    if (!data) {
      state.error = reasonOf(error);
      return;
    }
    state.task = data as Api.Assistant.AsyncTask<R>;
    remember(data.id);
    await follow(data.id);
  }

  function reset() {
    watching?.abort();
    watching = null;
    state.task = null;
    state.result = null;
    state.error = '';
    state.active = false;
  }

  onBeforeUnmount(() => watching?.abort());

  return { state, start, resume, cancel, retry, reset };
}
