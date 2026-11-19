import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleFor } from './truncated-title.ts';

test('a text that is cut gets its whole text as the title', () => {
  assert.equal(
    titleFor({ scrollWidth: 300, clientWidth: 90, textContent: '  dc52-container-cpu-usage ' }),
    'dc52-container-cpu-usage'
  );
});

test('a text that fits, an empty one, and one with a title already get none', () => {
  assert.equal(titleFor({ scrollWidth: 80, clientWidth: 90, textContent: 'short' }), '');
  assert.equal(titleFor({ scrollWidth: 300, clientWidth: 90, textContent: '   ' }), '');
  assert.equal(titleFor({ scrollWidth: 300, clientWidth: 90, textContent: 'long text', title: 'already' }), '');
});
