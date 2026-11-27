import assert from 'node:assert/strict';
import test from 'node:test';
import { type StrategyInput, strategySummary } from './strategy-summary.ts';

const base: StrategyInput = {
  bypass: false,
  fixedEnabled: false,
  fixedReplicas: 0,
  predicts: true,
  decisionSource: 'algorithm',
  triggers: 0,
  periods: 0,
  periodsFixing: 0,
  periodsBounding: 0
};
const stateOf = (input: StrategyInput, key: string) => strategySummary(input).rows.find(row => row.key === key)?.state;

test('the forecast decides the replicas, and what is not set is off', () => {
  const summary = strategySummary(base);
  assert.equal(summary.decides, 'forecast');
  assert.equal(stateOf(base, 'source'), 'active');
  assert.equal(stateOf(base, 'triggers'), 'off');
  assert.equal(stateOf(base, 'periods'), 'off');
  assert.equal(stateOf(base, 'fixedCount'), 'off');
});

test('the fixed formula or the fallback decides when the forecast does not', () => {
  assert.equal(strategySummary({ ...base, decisionSource: 'rule' }).decides, 'rule');
  assert.equal(strategySummary({ ...base, predicts: false }).decides, 'fallback');
  assert.equal(stateOf({ ...base, predicts: false }, 'source'), 'off');
  // the formula needs no forecast
  assert.equal(stateOf({ ...base, predicts: false, decisionSource: 'rule' }, 'source'), 'active');
});

test('a fixed count is exact: the forecast, the triggers and the floors and caps of periods do not scale it', () => {
  const input = { ...base, fixedEnabled: true, fixedReplicas: 3, triggers: 2, periods: 1, periodsBounding: 1 };
  const summary = strategySummary(input);
  assert.equal(summary.decides, 'fixedCount');
  assert.equal(stateOf(input, 'source'), 'overridden');
  assert.equal(stateOf(input, 'triggers'), 'overridden');
  assert.equal(stateOf(input, 'periods'), 'overridden');
  // a period that fixes the count is the more specific word
  assert.equal(stateOf({ ...input, periodsFixing: 1 }, 'periods'), 'active');
  // the switch is off or the count is zero: nothing is held
  assert.equal(strategySummary({ ...input, fixedEnabled: false }).decides, 'forecast');
  assert.equal(strategySummary({ ...input, fixedReplicas: 0 }).decides, 'forecast');
});

test('a bypass holds everything', () => {
  const input = {
    ...base,
    bypass: true,
    fixedEnabled: true,
    fixedReplicas: 3,
    triggers: 1,
    periods: 1,
    periodsFixing: 1
  };
  assert.equal(strategySummary(input).decides, 'bypass');
  for (const key of ['fixedCount', 'source', 'triggers', 'periods'])
    assert.equal(stateOf(input, key), 'overridden', key);
});
