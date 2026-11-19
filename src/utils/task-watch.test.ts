import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenState, watchTask } from './task-watch.ts';
import type { TaskIO } from './task-watch.ts';

function task(status: string, extra: Record<string, unknown> = {}): any {
  return {
    id: 7,
    kind: 'forecast.step',
    title: 't',
    status,
    progress: 0,
    stage: '',
    error: '',
    attempts: 1,
    max_attempts: 3,
    ...extra
  };
}

/** the platform answers one state after another; the last one repeats */
function platform(states: any[], reads: { n: number; cancelled: number }): TaskIO<unknown> {
  return {
    read: async () => {
      const next = states[Math.min(reads.n, states.length - 1)];
      reads.n += 1;
      return typeof next === 'function' ? next() : { data: next, error: null };
    },
    cancel: async () => {
      reads.cancelled += 1;
    }
  };
}

const fast = { intervalMs: 1 };

test('a task is followed through its states until it succeeds and its result is what comes back', async () => {
  const seen: string[] = [];
  const reads = { n: 0, cancelled: 0 };
  const out = await watchTask(
    7,
    platform([task('queued'), task('running', { progress: 40 }), task('succeeded', { result: { answer: 42 } })], reads),
    { ...fast, onUpdate: t => seen.push(t.status) }
  );
  assert.deepEqual(out.data, { answer: 42 });
  assert.equal(out.error, null);
  assert.deepEqual(seen, ['queued', 'running', 'succeeded'], 'every state is told, in order');
  assert.equal(out.task?.status, 'succeeded');
});

test('a task that waits for another attempt is followed on, not given up', async () => {
  const reads = { n: 0, cancelled: 0 };
  const out = await watchTask(
    7,
    platform(
      [
        task('running'),
        task('queued', { attempts: 1, error: 'the data source did not answer', next_run_at: '2026-11-20T10:00:00Z' }),
        task('running', { attempts: 2 }),
        task('succeeded', { attempts: 2, result: 'ok' })
      ],
      reads
    ),
    fast
  );
  assert.equal(out.data, 'ok');
  assert.equal(reads.n, 4);
});

test('a failed task ends with its reason and the task it ended as', async () => {
  const reads = { n: 0, cancelled: 0 };
  const out = await watchTask(
    7,
    platform([task('running'), task('failed', { error: 'the module does not exist', error_code: 'failed' })], reads),
    fast
  );
  assert.equal(out.data, null);
  assert.equal((out.error as Error).message, 'the module does not exist');
  assert.equal((out.error as any).task.status, 'failed');
});

test('a task that was stopped ends as canceled, which is no failure', async () => {
  const reads = { n: 0, cancelled: 0 };
  const out = await watchTask(7, platform([task('cancelling'), task('cancelled')], reads), fast);
  assert.equal((out.error as any).code, 'ERR_CANCELED');
});

test('a result that expired is told as that', async () => {
  const out = await watchTask(7, platform([task('expired')], { n: 0, cancelled: 0 }), fast);
  assert.match((out.error as Error).message, /expired/);
});

test('a task that is gone ends the wait at once, and a platform that does not answer five times in a row does too', async () => {
  const reads = { n: 0, cancelled: 0 };
  const gone = await watchTask(
    7,
    platform([() => ({ data: null, error: { response: { status: 404 } } })], reads),
    fast
  );
  assert.equal(reads.n, 1);
  assert.equal((gone.error as any).response.status, 404);

  const silent = { n: 0, cancelled: 0 };
  await watchTask(7, platform([() => ({ data: null, error: new Error('network') })], silent), fast);
  assert.equal(silent.n, 5);

  // four failures and then an answer: the wait goes on
  const flaky = { n: 0, cancelled: 0 };
  const states: any[] = [1, 2, 3, 4].map(() => () => ({ data: null, error: new Error('network') }));
  states.push(task('succeeded', { result: 1 }));
  const out = await watchTask(7, platform(states, flaky), fast);
  assert.equal(out.data, 1);
});

test('leaving stops the waiting only, and cancelOnAbort also stops the task', async () => {
  const left = new AbortController();
  const reads = { n: 0, cancelled: 0 };
  const waiting = watchTask(7, platform([task('running')], reads), { ...fast, signal: left.signal });
  setTimeout(() => left.abort(), 20);
  const out = await waiting;
  assert.equal((out.error as any).code, 'ERR_CANCELED');
  assert.equal(reads.cancelled, 0, 'the task goes on without the page');

  const stopped = new AbortController();
  const reads2 = { n: 0, cancelled: 0 };
  const waiting2 = watchTask(7, platform([task('running')], reads2), {
    ...fast,
    signal: stopped.signal,
    cancelOnAbort: true
  });
  setTimeout(() => stopped.abort(), 20);
  await waiting2;
  assert.equal(reads2.cancelled, 1, 'the person stopped it');
});

test('a wait that goes on for too long ends, and says the task may still finish', async () => {
  const out = await watchTask(7, platform([task('running')], { n: 0, cancelled: 0 }), { ...fast, maxWaitMs: 15 });
  assert.match((out.error as Error).message, /may still finish/);
});

test('the open states are the ones that have not ended', () => {
  for (const s of ['queued', 'running', 'cancelling']) assert.ok(isOpenState(s), s);
  for (const s of ['succeeded', 'failed', 'cancelled', 'expired', undefined, null])
    assert.ok(!isOpenState(s as any), String(s));
});
