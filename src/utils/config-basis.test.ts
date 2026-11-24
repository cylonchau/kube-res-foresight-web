import assert from 'node:assert/strict';
import test from 'node:test';
import { configBasisLines } from './config-basis.ts';

const words = {
  podUse: 'use of a Pod',
  largest: 'Largest',
  rounded: 'Rounded',
  requests: 'Requests',
  limits: 'Limits',
  limitsLine: 'Limits line',
  floorOom: 'OOM floor',
  floorThrottle: 'Throttle floor',
  coefSource: 'module or system',
  requestHeadroom: 'Requests margin',
  limitFactor: 'Limits coefficient',
  current: 'Requests now'
};
const result = {
  resource: 'cpu',
  request: 4,
  needed: 3.75,
  suggested: 3.75,
  suggested_limit: 4.5,
  oom_working_set: 0,
  reasons: [],
  usage: { points: 10, p50: 1, p90: 2.4, p95: 3.2, p99: 3.5, max: 4 },
  candidates: [
    { name: 'P90', use: 2.4, target: 0.8, needed: 3, suggested: 3, suggested_limit: 4.2, decides: false },
    { name: 'P95', use: 3.2, target: 0.85, needed: 3.7647, suggested: 3.75, suggested_limit: 4.2, decides: true },
    { name: 'P99', use: 3.5, target: 1.1, needed: 3.1818, suggested: 3.2, suggested_limit: 4.2, decides: false }
  ]
} as unknown as Api.Overprovision.Result;
const params = { limit_factor: 1.2, oom_uplift: 1.2 } as unknown as Api.Overprovision.Params;
const plain = (tokens: Array<{ text: string }>) => tokens.map(t => t.text).join(' ');

test('the three percentiles are lines of their own and the largest decides', () => {
  const lines = configBasisLines(result, params, 'all', words);
  assert.deepEqual(
    lines.map(line => line.label),
    ['P90', 'P95', 'P99', 'Largest', 'Rounded', 'Limits line']
  );
  assert.equal(plain(lines[0].tokens), 'use of a Pod 2.4 cores ÷ 80% = 3 cores');
  assert.equal(plain(lines[3].tokens), 'Requests = max ( 3 cores , 3.76 cores , 3.18 cores ) = 3.76 cores');
  assert.equal(plain(lines[4].tokens), 'Requests = ⌈ max ( 3.76 cores ) ⌉ = 3.75 cores');
});

test('a caliber lists its own percentile only, with its own rounded request and Limits', () => {
  const lines = configBasisLines(result, params, 'P99', words);
  assert.deepEqual(
    lines.map(line => line.label),
    ['P99', 'Rounded', 'Limits line']
  );
  assert.equal(plain(lines[0].tokens), 'use of a Pod 3.5 cores ÷ 110% = 3.18 cores');
  assert.ok(plain(lines[1].tokens).endsWith('= 3.2 cores'));
  assert.ok(plain(lines[2].tokens).includes('P99 3.5 cores × 120%'), 'the figure the margin is added to is written');
});

test('the floors of an OOM kill and of throttling are lines, and the margin of the Requests is a coefficient', () => {
  const memory = {
    ...result,
    resource: 'memory',
    request: 4 * 2 ** 30,
    oom_working_set: 3 * 2 ** 30,
    reasons: ['oom', 'throttled']
  } as unknown as Api.Overprovision.Result;
  const lines = configBasisLines(memory, { ...params, memory_request_headroom: 0.1 } as never, 'P95', words);
  assert.ok(lines.some(line => line.label === 'OOM floor'));
  assert.ok(lines.some(line => line.label === 'Throttle floor'));
  assert.ok(lines.find(line => line.label === 'Largest')!.tokens.some(t => t.kind === 'coef' && t.text === '10%'));
});

test('the Limits line counts the Requests that is recommended in the end and the raw P99, and says it is rounded up', () => {
  const kept = { ...result, suggested: 3, needed: 3.76, suggested_limit: 4.2 } as unknown as Api.Overprovision.Result;
  const lines = configBasisLines(kept, params, 'all', words);
  assert.equal(plain(lines[5].tokens), 'Limits = ⌈ max ( 3 cores , P99 3.5 cores × 120% ) ⌉ = 4.2 cores');
});
