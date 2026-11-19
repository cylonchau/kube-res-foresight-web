import { request } from '../request';

const silent = { 'X-Silent-Error': '1' };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** how long the page waits for a step before it stops asking; the task goes on and its result stays for the retention */
const MAX_WAIT_MS = 60 * 60 * 1000;

type Step = 'collect' | 'predict' | 'run' | 'backtest' | 'evaluate' | 'score';

/**
 * Runs a long step of a module in the background and waits for its result: the step is queued (the request that does it returns at once, so no
 * gateway cuts it), and the page reads the task every second until it ends. The result is what the synchronous endpoint of the same step would
 * have answered. Aborting the signal asks the platform to stop the task, which stops within a second.
 */
export async function runModuleStep<T>(
  moduleId: number,
  step: Step,
  body?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ data: T | null; error: unknown }> {
  const submitted = await request<Api.Assistant.AsyncTask>({
    url: `/api/v1/modules/${moduleId}/steps/${step}`,
    method: 'post',
    data: body ?? {}
  });
  if (!submitted.data) return { data: null, error: submitted.error };
  const id = submitted.data.id;
  const started = Date.now();
  let failures = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    if (signal?.aborted) {
      await request({ url: `/api/v1/assistant/async/${id}/cancel`, method: 'post', headers: silent });
      return { data: null, error: Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }) };
    }
    const { data, error } = await request<Api.Assistant.AsyncTask>({
      url: `/api/v1/assistant/async/${id}`,
      method: 'get',
      headers: silent
    });
    if (data) {
      failures = 0;
      if (data.status === 'succeeded') return { data: (data.result ?? null) as T | null, error: null };
      if (data.status === 'failed') {
        const failure = new Error(data.error || 'the step failed');
        window.$message?.error(failure.message);
        return { data: null, error: failure };
      }
      if (data.status === 'cancelled')
        return { data: null, error: Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }) };
    } else {
      failures += 1;
      // the task is gone, or the platform has not answered five times in a row
      if ((error as any)?.response?.status === 404 || failures >= 5) return { data: null, error };
    }
    await sleep(1000);
  }
  return { data: null, error: new Error('the step took too long to wait for: it may still finish') };
}
