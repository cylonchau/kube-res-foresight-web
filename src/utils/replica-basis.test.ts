import assert from 'node:assert/strict';
import test from 'node:test';
import { replicaBasisLines } from './replica-basis.ts';

const words = {
  totalUse: 'total use',
  requests: 'Requests',
  limits: 'Limits',
  guard: 'guard',
  result: 'Replicas',
  replicas: 'replicas',
  coefSource: 'the module or the system',
  guardSource: 'guard share',
  limitGuard: 'Limits guard',
  podRequests: 'Requests of a Pod',
  podLimits: 'Limits of a Pod',
  replicasUnit: 'replicas'
};
const GIB = 2 ** 30;
const need = {
  resource: 'memory',
  needed: 6,
  request: 4 * GIB,
  limit: 8 * GIB,
  limit_needed: 5.2,
  formula: '',
  parts: [
    { name: 'P90', total: 18 * GIB, target: 0.8, needed: 5.625 },
    { name: 'P95', total: 19 * GIB, target: 0.85, needed: 5.5882 },
    { name: 'P99', total: 22 * GIB, target: 1.1, needed: 5 }
  ]
} as unknown as Api.Overprovision.ReplicaNeed;
const params = { peak_near_limit: 0.9 } as unknown as Api.Overprovision.Params;
const plain = (tokens: Array<{ text: string }>) => tokens.map(t => t.text).join(' ');

test('every percentile and the guard of the Limits is a line with the divisor marked as a coefficient', () => {
  const lines = replicaBasisLines(need, params, words);
  assert.equal(lines.length, 5);
  assert.equal(plain(lines[0].tokens), 'total use 18 GiB ÷ ( Requests of a Pod 4 GiB × 80% ) = 5.63 replicas');
  assert.deepEqual(
    lines[0].tokens.filter(t => t.kind === 'coef').map(t => t.text),
    ['80%']
  );
  assert.equal(plain(lines[3].tokens), 'P99 total use 22 GiB ÷ ( Limits of a Pod 8 GiB × 90% ) = 5.2 replicas');
  assert.equal(plain(lines[4].tokens), 'replicas = ⌈ max ( 5.63 , 5.59 , 5 , 5.2 ) ⌉ = 6 replicas');
  assert.equal(lines[4].tokens.at(-1)?.kind, 'res');
});

test('without Limits there is no guard line', () => {
  const lines = replicaBasisLines({ ...need, limit: 0, limit_needed: 0 } as never, params, words);
  assert.equal(lines.length, 4);
});

test('a plan of one percentile alone counts that percentile and the guard of the Limits only', () => {
  const one = {
    ...need,
    needed: 6,
    parts: need.parts.map(part => ({ ...part, counted: part.name === 'P95' }))
  } as unknown as Api.Overprovision.ReplicaNeed;
  const lines = replicaBasisLines(one, params, words);
  assert.deepEqual(
    lines.map(line => line.label),
    ['P95', 'Limits guard', 'Replicas']
  );
  assert.equal(plain(lines.at(-1)!.tokens), 'replicas = ⌈ max ( 5.59 , 5.2 ) ⌉ = 6 replicas');
});
