import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageContextOf } from './assistant-context.ts';

test('a page with a name says where the user is', () => {
  assert.deepEqual(pageContextOf({ name: 'dashboard', query: {} }, 'Dashboard'), {
    page: 'dashboard',
    title: 'Dashboard'
  });
});

test('the module of the address is the module of the page', () => {
  assert.equal(pageContextOf({ name: 'forecast_ranking', query: { module_id: '7' } }, 'x')?.module_id, 7);
  assert.equal(pageContextOf({ name: 'forecast-results_effect', query: { module: '12' } }, 'x')?.module_id, 12);
  assert.equal(
    pageContextOf({ name: 'p', query: { module_id: ['3', '4'] } }, 'x')?.module_id,
    3,
    'a repeated parameter is its first'
  );
});

test('what is not a module id is not sent', () => {
  for (const bad of ['', '0', '-1', '1.5', 'shop', 'NaN', null, undefined]) {
    assert.equal(pageContextOf({ name: 'p', query: { module_id: bad } }, 'x')?.module_id, undefined, String(bad));
  }
});

test('a route with no name says nothing', () => {
  assert.equal(pageContextOf({ query: {} }, 'x'), undefined);
  assert.equal(pageContextOf({ name: Symbol('x') }, 'x'), undefined);
});
