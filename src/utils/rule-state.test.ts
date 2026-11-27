import assert from 'node:assert/strict';
import test from 'node:test';
import { stateStep, stateType } from './rule-state.ts';

test('a decision goes from the calculation to the operator, and the mode recommend stops before the cluster', () => {
  assert.equal(stateStep('not_followed'), 0);
  assert.equal(stateStep('unavailable'), 0);
  assert.equal(stateStep('observe_only'), 0);
  assert.equal(stateStep('pending'), 1);
  assert.equal(stateStep('recommended'), 2);
  assert.equal(stateStep('admission'), 3);
  assert.equal(stateStep('waiting_operator'), 3);
  assert.equal(stateStep('executed'), 4);
  assert.equal(stateStep('something else'), 0);
});

test('a state that needs a look is orange and one that is done is green', () => {
  assert.equal(stateType('executed'), 'success');
  assert.equal(stateType('unavailable'), 'warning');
  assert.equal(stateType('recommended'), 'info');
  assert.equal(stateType('not_followed'), 'default');
});
