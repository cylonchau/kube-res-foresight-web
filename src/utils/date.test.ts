import assert from 'node:assert/strict';
import test from 'node:test';
import { axisTimeLabel, formatDateTime, fromPickerValue, toPickerValue } from './date.ts';

test('a time is shown as UTC+8 wall clock whatever the zone of the process is', () => {
  assert.equal(formatDateTime('2026-10-28T18:58:00Z'), '2026-10-29 02:58:00');
  assert.equal(formatDateTime('2026-10-29T02:58:00+08:00'), '2026-10-29 02:58:00');
  assert.equal(formatDateTime(Date.UTC(2026, 11, 31, 16, 30, 5)), '2027-01-01 00:30:05');
  assert.equal(formatDateTime(null), '-');
  assert.equal(formatDateTime('not a time'), '-');
  assert.equal(formatDateTime('', 'n/a'), 'n/a');
});

test('the picker value round-trips an instant and shows the UTC+8 fields in the browser zone', () => {
  const instant = Date.UTC(2026, 9, 28, 18, 58, 0);
  assert.equal(fromPickerValue(toPickerValue(instant)), instant);
  const shown = new Date(toPickerValue(instant));
  assert.equal(
    `${shown.getFullYear()}-${shown.getMonth() + 1}-${shown.getDate()} ${shown.getHours()}:${shown.getMinutes()}`,
    '2026-10-29 2:58'
  );
});

test('an axis label is the clock, and the date where a day starts', () => {
  assert.equal(axisTimeLabel(Date.UTC(2026, 9, 28, 18, 58)), '02:58');
  assert.equal(axisTimeLabel(Date.UTC(2026, 9, 28, 16, 0)), '10-29\n00:00');
});
