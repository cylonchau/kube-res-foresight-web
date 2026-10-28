import assert from 'node:assert/strict';
import test from 'node:test';
import { operateWidth } from './operate-width.ts';

test('an operate column is as wide as its buttons, so none is cut off', () => {
  // four buttons of two Chinese characters: 4 x (24 + 12) + 3 gaps of 6 + the cell padding and a margin
  assert.equal(operateWidth(['编辑', '删除', '克隆', '旁路']), 4 * 36 + 3 * 6 + 24 + 10);
  // one button
  assert.equal(operateWidth(['详情']), 36 + 24 + 10);
  // a longer label and a Latin one count by their characters
  assert.ok(operateWidth(['决策说明', '快照历史']) > operateWidth(['编辑', '删除']));
  assert.ok(operateWidth(['Edit', 'Delete']) > operateWidth(['编辑']));
});

test('more buttons are never narrower', () => {
  const labels = ['编辑', '删除', '克隆', '旁路'];
  for (let n = 1; n < labels.length; n += 1) {
    assert.ok(operateWidth(labels.slice(0, n + 1)) > operateWidth(labels.slice(0, n)));
  }
});
