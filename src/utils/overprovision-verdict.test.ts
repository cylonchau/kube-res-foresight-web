import assert from 'node:assert/strict';
import test from 'node:test';
import { adjustmentOf, adjustmentText, shareText } from './overprovision-verdict.ts';

test('what is more than the recommendation is over, what is less is under, with the share of the figure now', () => {
  assert.deepEqual(adjustmentOf(4, 3.5), { direction: 'over', amount: 0.5, share: 0.125 });
  const under = adjustmentOf(6, 9.9375);
  assert.equal(under?.direction, 'under');
  assert.ok(Math.abs((under?.amount ?? 0) - 3.9375) < 1e-9);
  assert.deepEqual(adjustmentOf(4, 4), { direction: 'same', amount: 0, share: 0 });
  assert.equal(adjustmentOf(0, 4), null);
  const gib = 1024 ** 3;
  assert.equal(
    adjustmentOf(6 * gib, 6 * gib + 64 * 1024 ** 2, 'memory')?.direction,
    'same',
    'one step of the rounding is the same number'
  );
  assert.equal(adjustmentOf(6 * gib, 6 * gib + 128 * 1024 ** 2, 'memory')?.direction, 'under');
  assert.equal(adjustmentOf(4, 4.05, 'cpu')?.direction, 'same');
  assert.equal(adjustmentOf(4, 0), null);
});

test('the adjustment is written with its unit and its share', () => {
  assert.equal(adjustmentText('cpu', { direction: 'over', amount: 0.5, share: 0.125 }), '500 mCPU (12.5%)');
  assert.equal(adjustmentText('cpu', { direction: 'over', amount: 1.5, share: 0.25 }), '1.5 cores (25.0%)');
  assert.equal(shareText(0.805), '80.5%');
  assert.equal(shareText(0), '-');
  assert.equal(shareText(undefined), '-');
});
