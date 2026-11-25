import assert from 'node:assert/strict';
import test from 'node:test';
import { LOAD_COLORS, barPercent, capacityParts, loadColor } from './load-profile.ts';

test('a bar is as long as its figure, from zero: a busier hour is never drawn shorter', () => {
  const needs = [13, 13, 15, 14, 1, 0];
  const bars = needs.map(n => barPercent(n, 15));
  assert.equal(bars[2], 100);
  assert.ok(Math.abs(bars[0] - (13 / 15) * 100) < 1e-9);
  for (let i = 0; i < needs.length; i += 1) {
    for (let j = 0; j < needs.length; j += 1) {
      if (needs[i] > needs[j]) assert.ok(bars[i] > bars[j], `${needs[i]} is longer than ${needs[j]}`);
      if (needs[i] === needs[j]) assert.equal(bars[i], bars[j]);
    }
  }
  assert.equal(barPercent(0, 15), 0, 'no figure is no bar');
  assert.equal(barPercent(5, 0), 0);
  assert.equal(barPercent(20, 15), 100, 'never longer than the full height');
});

test('under the capacity a cell is green and deeper the closer to it; above it is orange and then red; no data is grey', () => {
  const alpha = (c: string) => Number(c.split(',').pop()!.replace(')', ''));
  assert.match(loadColor(0.1), /^rgba\(24, 160, 88,/);
  assert.match(loadColor(1), /^rgba\(24, 160, 88,/);
  assert.ok(alpha(loadColor(0.9)) > alpha(loadColor(0.1)), 'the deeper the closer to the capacity');
  assert.match(loadColor(1.2), /^rgba\(240, /);
  const orange = loadColor(1.01);
  const red = loadColor(2);
  assert.notEqual(orange, red);
  assert.ok(Number(red.split(',')[1]) < Number(orange.split(',')[1]), 'redder the further above');
  assert.equal(loadColor(-1), 'rgba(128, 128, 128, 0.15)');
  assert.equal(loadColor(Number.NaN), 'rgba(128, 128, 128, 0.15)');
  assert.notEqual(LOAD_COLORS.normal, LOAD_COLORS.high);
});

test('the capacity of the normal replicas is taken apart into the count, the Requests of one Pod and the target', () => {
  // 13 replicas of a 4-core Pod at 85%: 13 x 4 x 0.85 = 44.2 cores
  const parts = capacityParts(44.2, 13, 0.85);
  assert.ok(parts);
  assert.equal(parts.normal, 13);
  assert.ok(Math.abs(parts.request - 4) < 1e-9);
  assert.equal(parts.target, 0.85);
  assert.equal(capacityParts(0, 13, 0.85), null);
  assert.equal(capacityParts(44.2, 0, 0.85), null);
  assert.equal(capacityParts(44.2, 13, 0), null);
});
