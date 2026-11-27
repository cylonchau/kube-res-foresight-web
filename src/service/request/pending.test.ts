import assert from 'node:assert/strict';
import test from 'node:test';
import { isPending, untilAnswered } from './pending.ts';

const done = (data: unknown) => ({ data, error: null });
const pending = (retry?: number, progress?: { stage?: string; done: number; total: number }) => ({
  data: { pending: true as const, retry_after_seconds: retry, progress },
  error: null
});

test('the sign of a read that is still being worked out is read, nothing else is', () => {
  assert.equal(isPending({ pending: true }), true);
  assert.equal(isPending({ pending: false }), false);
  assert.equal(isPending(null), false);
  assert.equal(isPending('pending'), false);
  assert.equal(isPending({ list: [] }), false);
});

test('it asks again after the delay the platform names, until the answer comes', async () => {
  const answers = [pending(2), pending(), done({ rows: 3 })];
  const waits: number[] = [];
  let calls = 0;
  const result = await untilAnswered(async () => answers[calls++], {
    sleep: async ms => {
      waits.push(ms);
    },
    defaultDelayMs: 3000
  });
  assert.deepEqual(result.data, { rows: 3 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 3000]);
});

test('an answer that is not pending is returned at once, an error as it is', async () => {
  let calls = 0;
  const failed = { data: null, error: new Error('boom') };
  const result = await untilAnswered(async () => {
    calls += 1;
    return failed;
  });
  assert.equal(calls, 1);
  assert.equal(result.error, failed.error);
});

test('it stops asking when the wait passes the limit and says so', async () => {
  let clock = 0;
  let calls = 0;
  const result = await untilAnswered(
    async () => {
      calls += 1;
      return pending(1);
    },
    {
      maxWaitMs: 5000,
      now: () => clock,
      sleep: async ms => {
        clock += ms;
      }
    }
  );
  assert.equal(result.data, null);
  assert.match(String((result.error as { message?: string } | null)?.message), /Prometheus/);
  assert.equal(calls, 6, 'one ask at the start and one after each of the five seconds');
});

test('it stops asking when the page moved on, and tells the seconds waited while it waits', async () => {
  let clock = 0;
  let calls = 0;
  let moved = false;
  const told: number[] = [];
  const result = await untilAnswered(
    async () => {
      calls += 1;
      if (calls === 3) moved = true;
      return pending(2);
    },
    {
      now: () => clock,
      sleep: async ms => {
        clock += ms;
      },
      onWait: seconds => told.push(seconds),
      cancelled: () => moved
    }
  );
  assert.equal(calls, 3);
  assert.ok(isPending(result.data), 'the last result is returned as it is');
  assert.deepEqual(told, [0, 2]);
});

test('what the platform says of how far its work has come is handed on with the seconds', async () => {
  const answers = [pending(1, { stage: 'metrics', done: 2, total: 7 }), pending(1), done({ ok: true })];
  let calls = 0;
  const told: Array<[number, unknown]> = [];
  await untilAnswered(async () => answers[calls++], {
    sleep: async () => {},
    onWait: (seconds, progress) => told.push([seconds, progress])
  });
  assert.deepEqual(told, [
    [0, { stage: 'metrics', done: 2, total: 7 }],
    [0, undefined]
  ]);
});

test('a gateway that cut the read is asked again, only when the caller says the platform goes on by itself', async () => {
  const cut = { data: null, error: { response: { status: 504, data: {} } } };
  const answers = [cut, cut, done({ rows: 1 })];
  let calls = 0;
  const result = await untilAnswered(async () => answers[calls++], { retryGatewayCut: true, sleep: async () => {} });
  assert.deepEqual(result.data, { rows: 1 });
  assert.equal(calls, 3);

  // not asked for: the failure is returned as it is
  calls = 0;
  const plain = await untilAnswered(async () => {
    calls += 1;
    return cut;
  });
  assert.equal(calls, 1);
  assert.equal(plain.error, cut.error);

  // an answer of the platform itself (it has a message) is a real failure, never asked again
  calls = 0;
  const own = { data: null, error: { response: { status: 504, data: { msg: 'read timed out: narrow the window' } } } };
  await untilAnswered(
    async () => {
      calls += 1;
      return own;
    },
    { retryGatewayCut: true, sleep: async () => {} }
  );
  assert.equal(calls, 1);
});
