import assert from 'node:assert/strict';
import test from 'node:test';
import { amountText, totalText } from './amount.ts';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

test('an amount is written as it is, with no rounding to a whole core or GiB', () => {
  assert.equal(amountText('cpu', 4), '4 cores');
  assert.equal(amountText('cpu', 8), '8 cores');
  assert.equal(amountText('cpu', 1.5), '1.5 cores');
  assert.equal(amountText('cpu', 4.36), '4.36 cores');
  assert.equal(amountText('cpu', 0.25), '250 mCPU');
  assert.equal(amountText('memory', 6 * GIB), '6 GiB');
  assert.equal(amountText('memory', 16 * GIB), '16 GiB');
  assert.equal(amountText('memory', 9.9375 * GIB), '9.94 GiB');
  assert.equal(amountText('memory', 512 * MIB), '512 MiB');
});

test('nothing, zero and what is not a number are "-"', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
    assert.equal(amountText('cpu', value), '-');
    assert.equal(amountText('memory', value), '-');
  }
});

test('a total is the figure of one Pod times the replicas', () => {
  assert.equal(totalText('cpu', 4, 12), '48 cores');
  assert.equal(totalText('memory', 6 * GIB, 12), '72 GiB');
  assert.equal(totalText('cpu', 4, 0), '-');
  assert.equal(totalText('cpu', 0, 12), '-');
});

test('the Pods of a total are the ones Prometheus summed, not always the ready replicas', async () => {
  const { podsOf, allText } = await import('./amount.ts');
  // 48 cores of Requests of 4 cores a Pod are 12 Pods, while 11 replicas are ready
  assert.equal(podsOf(4, 48, 11), 12);
  assert.equal(podsOf(4, undefined, 11), 11);
  assert.equal(podsOf(0, 48, 11), 11);
  assert.equal(allText('cpu', 4, 48, 11), '48 cores', 'the total is what Prometheus summed');
  assert.equal(allText('cpu', 4, undefined, 11), '44 cores');
  assert.equal(totalText('cpu', 3.8, podsOf(4, 48, 11)), '45.6 cores');
});
