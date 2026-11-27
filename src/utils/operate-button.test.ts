import assert from 'node:assert/strict';
import test from 'node:test';
import { type OperateKind, operateProps } from './operate-button.ts';

test('every kind of action has its own colour, and a delete is the only red', () => {
  const kinds: OperateKind[] = ['edit', 'detail', 'view', 'copy', 'run', 'enable', 'pause', 'delete'];
  const seen = new Set(kinds.map(kind => JSON.stringify(operateProps(kind))));
  assert.equal(seen.size, kinds.length, 'two kinds of action must not look the same');
  assert.deepEqual(
    kinds.filter(kind => operateProps(kind).type === 'error'),
    ['delete']
  );
});

test('a page may change what it gets without changing the next page', () => {
  const props = operateProps('edit');
  props.secondary = true;
  assert.equal(operateProps('edit').secondary, undefined);
});
