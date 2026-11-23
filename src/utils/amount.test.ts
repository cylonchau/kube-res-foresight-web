import assert from 'node:assert/strict';
import test from 'node:test';
import { amountText, wholeAmount, wholeText } from './amount.ts';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

test('CPU is whole millicores under a core and whole cores from a core up', () => {
  assert.equal(wholeText('cpu', 0.96, 'up'), '960 mCPU');
  assert.equal(wholeText('cpu', 0.9604, 'up'), '961 mCPU');
  assert.equal(wholeText('cpu', 3.75, 'up'), '4 cores');
  assert.equal(wholeText('cpu', 3.75), '4 cores');
  assert.equal(wholeText('cpu', 1.2, 'up'), '2 cores', 'a recommendation is never rounded down');
  assert.equal(wholeText('cpu', 1.2), '1 core');
  assert.equal(wholeText('cpu', 0.9996, 'up'), '1 core', 'a figure that reaches a core is read in cores');
  assert.equal(wholeText('cpu', 0), '-');
  assert.equal(wholeText('cpu', Number.NaN), '-');
});

test('memory is whole MiB under a GiB and whole GiB from a GiB up', () => {
  assert.equal(wholeText('memory', 1.44 * GIB, 'up'), '2 GiB');
  assert.equal(wholeText('memory', 1.44 * GIB), '1 GiB');
  assert.equal(wholeText('memory', 7.06 * GIB, 'up'), '8 GiB');
  assert.equal(wholeText('memory', 300.4 * MIB, 'up'), '301 MiB');
  assert.equal(wholeText('memory', 1023.2 * MIB, 'up'), '1 GiB');
  assert.equal(wholeText('memory', 0), '-');
});

test('a total is the whole figure of one Pod times the replicas', () => {
  const pod = wholeAmount('cpu', 3.75, 'up');
  assert.equal(pod, 4);
  assert.equal(amountText('cpu', pod * 12), '48 cores');
  assert.equal(amountText('memory', wholeAmount('memory', 1.5 * GIB, 'up') * 12), '24 GiB');
});
