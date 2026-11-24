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
  limitGuard: 'Limits guard'
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
  assert.equal(plain(lines[0].tokens), 'total use 18 GiB ÷ ( 4 GiB × 80% ) = 5.63');
  assert.deepEqual(
    lines[0].tokens.filter(t => t.kind === 'coef').map(t => t.text),
    ['80%']
  );
  assert.equal(plain(lines[3].tokens), 'P99 total use 22 GiB ÷ ( 8 GiB × 90% ) = 5.2');
  assert.equal(plain(lines[4].tokens), 'replicas = ⌈ max ( 5.63 , 5.59 , 5 , 5.2 ) ⌉ = 6');
  assert.equal(lines[4].tokens.at(-1)?.kind, 'res');
});

test('without Limits there is no guard line', () => {
  const lines = replicaBasisLines({ ...need, limit: 0, limit_needed: 0 } as never, params, words);
  assert.equal(lines.length, 4);
});
