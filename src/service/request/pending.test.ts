import assert from 'node:assert/strict';
import test from 'node:test';
import { isPending, untilAnswered } from './pending.ts';

const done = (data: unknown) => ({ data, error: null });
const pending = (retry?: number) => ({ data: { pending: true, retry_after_seconds: retry }, error: null });

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
