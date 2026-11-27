import assert from 'node:assert/strict';
import test from 'node:test';
import { progressParams } from './pending-text.ts';

test('the progress of a read becomes words only when the platform has counted', () => {
  const label = (stage: string) => `<${stage}>`;
  assert.equal(progressParams(undefined, label), null);
  assert.equal(progressParams({ done: 0, total: 0 }, label), null);
  assert.deepEqual(progressParams({ stage: 'metrics', done: 3, total: 7 }, label), {
    stage: '<metrics>',
    done: 3,
    total: 7
  });
  assert.deepEqual(progressParams({ done: 9, total: 7 }, label), { stage: '', done: 7, total: 7 });
});
