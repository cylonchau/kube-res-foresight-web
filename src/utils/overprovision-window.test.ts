import assert from 'node:assert/strict';
import test from 'node:test';
import { rangeOfLabel, windowOf } from './overprovision-window.ts';

const MINUTE = 60 * 1000;
const relativeRange = (ms: number) =>
  Object.assign([Date.now() - ms, Date.now()] as [number, number], { relativeMs: ms });

test('a window the platform stores is asked for by its label', () => {
  const choice = windowOf(rangeOfLabel('7d'));
  assert.deepEqual(choice.params, { window: '7d' });
  assert.deepEqual(choice.grafana, { window: '7d' });
  assert.equal(choice.stored, true);
  assert.equal(choice.board, '7d');
  assert.equal(choice.minutes, 7 * 24 * 60);
});

test('another length is asked for over its range, and the overview reads the shortest stored window that covers it', () => {
  const choice = windowOf(relativeRange(3 * 60 * MINUTE));
  assert.equal(choice.stored, false);
  assert.equal(choice.params.window, undefined);
  assert.equal(Date.parse(choice.params.to!) - Date.parse(choice.params.from!), 3 * 60 * MINUTE);
  assert.equal(choice.board, '1d');
  assert.deepEqual(choice.grafana, { window: '3h' });
  assert.equal(choice.hours, 3);
});

test('a fixed range goes to Grafana as its two ends', () => {
  const end = Date.now();
  const choice = windowOf([end - 90 * MINUTE, end]);
  assert.ok(choice.grafana.from);
  assert.equal(choice.grafana.window, undefined);
  assert.equal(choice.minutes, 90);
  assert.equal(choice.board, '1d');
});

test('more than 30 days is taken as 30 days and nothing means a week', () => {
  assert.equal(windowOf(relativeRange(90 * 24 * 60 * MINUTE)).minutes, 30 * 24 * 60);
  assert.equal(windowOf(relativeRange(90 * 24 * 60 * MINUTE)).board, '30d');
  assert.deepEqual(windowOf(null).params, { window: '7d' });
});
