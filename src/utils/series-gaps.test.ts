import assert from 'node:assert/strict';
import test from 'node:test';
import { gapPairs, GAP_FACTOR, countGaps, gapLimit, withBreaks } from './series-gaps.ts';

const MIN = 60 * 1000;

test('a gap is more than two and a half buckets between neighbours', () => {
  assert.equal(gapLimit(60), 60 * 1000 * GAP_FACTOR);
  const regular = [0, 1, 2, 3, 4].map(i => i * MIN);
  assert.equal(countGaps(regular, 60), 0);
  assert.equal(countGaps([0, MIN, 2 * MIN, 3 * MIN + 30 * 1000], 60), 0, 'a late sample is jitter, not a gap');
  assert.equal(countGaps([0, MIN, 10 * MIN, 11 * MIN, 30 * MIN], 60), 2);
  assert.equal(countGaps([], 60), 0);
  assert.equal(countGaps([5], 60), 0);
});

test('a break is put into every gap, one bucket after the point before it', () => {
  const points = [0, 1, 2, 10, 11, 40].map(i => ({ time: i * MIN, value: i }));
  const out = withBreaks(
    points,
    60,
    p => p.time,
    p => [p.time, p.value],
    time => [time, null]
  ) as Array<[number, number | null]>;
  assert.equal(out.length, 8);
  assert.deepEqual(out[3], [3 * MIN, null]);
  assert.deepEqual(out[4], [10 * MIN, 10]);
  assert.deepEqual(out[6], [12 * MIN, null]);
  assert.equal(points.length, 6, 'the input is not modified');
  assert.deepEqual(
    withBreaks(
      [{ time: 0, value: 1 }],
      60,
      p => p.time,
      p => p.value,
      () => null
    ),
    [1]
  );
});

test('a gap is given as the point before it and the point after it, and the points are not changed', () => {
  const points = [0, 1, 2, 10, 11, 40].map(i => ({ time: i * MIN, value: i }));
  const pairs = gapPairs(
    points,
    60,
    p => p.time,
    p => p.value
  );
  assert.deepEqual(pairs, [
    { from: [2 * MIN, 2], to: [10 * MIN, 10] },
    { from: [11 * MIN, 11], to: [40 * MIN, 40] }
  ]);
  assert.deepEqual(
    gapPairs(
      [{ time: 0, value: 1 }],
      60,
      p => p.time,
      p => p.value
    ),
    []
  );
});
