import assert from 'node:assert/strict';
import test from 'node:test';
import { cardColumns, cardSpans } from './card-wall.ts';

test('nine cards in a room for six make three columns of three', () => {
  assert.equal(cardColumns(9, 6), 3);
  assert.deepEqual(cardSpans(9, 3), Array(9).fill(1));
});

test('a single column is one card to the row, and two columns two', () => {
  assert.equal(cardColumns(7, 1), 1);
  assert.deepEqual(cardSpans(7, 1), Array(7).fill(1));
  assert.equal(cardColumns(4, 2), 2);
  assert.deepEqual(cardSpans(5, 2), [1, 1, 1, 1, 2]);
});

test('fewer cards than columns take the whole row', () => {
  assert.equal(cardColumns(3, 6), 3);
  assert.equal(cardColumns(1, 6), 1);
});

test('a last row that is not full is filled by wider cards, never left with a hole', () => {
  const columns = cardColumns(13, 6);
  assert.equal(columns, 5);
  const spans = cardSpans(13, columns);
  assert.deepEqual(spans.slice(-3), [2, 2, 1]);
  assert.equal(
    spans.slice(-3).reduce((a, b) => a + b, 0),
    columns
  );
});

test('every wall is full: the spans of the last row add up to the columns', () => {
  for (let count = 1; count <= 40; count += 1) {
    for (let fit = 1; fit <= 8; fit += 1) {
      const columns = cardColumns(count, fit);
      const spans = cardSpans(count, columns);
      const last = count % columns || columns;
      assert.equal(
        spans.slice(count - last).reduce((a, b) => a + b, 0),
        columns,
        `${count} cards, room ${fit}`
      );
    }
  }
});
