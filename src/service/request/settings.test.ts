import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureRequestSettings, longTimeoutMs, requestSettings, shouldRetry } from './settings.ts';

// The time limits are the system parameters: read once, kept inside their ranges, and a console that cannot read them keeps working on the
// defaults. (One module state, so the cases run in this order.)

test('the defaults are a minute, a minute for the gateway and one retry', () => {
  assert.equal(requestSettings.timeoutMs, 60_000);
  assert.equal(requestSettings.gatewayMs, 60_000);
  assert.equal(requestSettings.retries, 1);
  assert.equal(longTimeoutMs(), 70_000, 'a request that is known to be long waits for the gateway plus 10 seconds');
});

test('a parameter that cannot be read leaves the defaults and is not asked for again at once', async () => {
  let asked = 0;
  await ensureRequestSettings(async () => {
    asked += 1;
    throw new Error('network');
  });
  assert.equal(requestSettings.timeoutMs, 60_000);
  assert.equal(asked, 3, 'the three parameters were asked for');
  await ensureRequestSettings(async () => {
    asked += 1;
    return null;
  });
  assert.equal(asked, 3, 'a failure is retried after a minute, not on the next request');
});

test('only a read that failed because the platform was unreachable is asked for again, and only as often as the parameter says', () => {
  const get = (extra: object = {}) => ({ config: { method: 'get' }, ...extra });
  assert.equal(shouldRetry(get({ response: { status: 502 } })), true, 'a rollout looks like a 502');
  assert.equal(shouldRetry(get({ response: { status: 503 } })), true);
  assert.equal(shouldRetry(get({ code: 'ERR_NETWORK' })), true, 'a lost connection');
  assert.equal(shouldRetry(get({ response: { status: 504 } })), false, 'a 504 would repeat the slow work');
  assert.equal(shouldRetry(get({ code: 'ECONNABORTED' })), false, 'a time-out is not asked for again');
  assert.equal(shouldRetry(get({ response: { status: 500 } })), false);
  assert.equal(
    shouldRetry({ config: { method: 'post' }, response: { status: 502 } }),
    false,
    'a write is never repeated'
  );
  assert.equal(shouldRetry({ response: { status: 502 } }), false);

  assert.equal(
    shouldRetry(get({ response: { status: 502 }, config: { method: 'get', 'axios-retry': { retryCount: 1 } } })),
    false,
    'once is what the parameter says'
  );
  requestSettings.retries = 2;
  assert.equal(
    shouldRetry(get({ response: { status: 502 }, config: { method: 'get', 'axios-retry': { retryCount: 1 } } })),
    true
  );
  requestSettings.retries = 0;
  assert.equal(shouldRetry(get({ response: { status: 502 } })), false, '0 turns it off');
  requestSettings.retries = 1;
});
