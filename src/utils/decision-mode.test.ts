import assert from 'node:assert/strict';
import test from 'node:test';
import { DECISION_MODES, decisionModeOf, flagsOfMode, modeBlocking } from './decision-mode.ts';

test('the mode of a module is read in the order the platform reads it', () => {
  assert.equal(decisionModeOf({}), 'none');
  assert.equal(decisionModeOf({ predict_enabled: true, predict_mode: 'dynamic' }), 'algorithm');
  assert.equal(decisionModeOf({ predict_enabled: true, predict_mode: 'none' }), 'none');
  assert.equal(decisionModeOf({ decision_source: 'rule' }), 'recommend');
  assert.equal(decisionModeOf({ triggers_enabled: true }), 'triggers');
  assert.equal(decisionModeOf({ periods_enabled: true, triggers_enabled: true }), 'periods');
  assert.equal(decisionModeOf({ fixed_replicas_enabled: true, periods_enabled: true, predict_enabled: true }), 'fixed');
});

test('a strategy has the word over the forecast and the recommendation mode', () => {
  assert.equal(
    decisionModeOf({ triggers_enabled: true, decision_source: 'rule', predict_enabled: true, predict_mode: 'dynamic' }),
    'triggers'
  );
});

test('the flags of a mode set it on and everything else off', () => {
  for (const mode of DECISION_MODES) assert.equal(decisionModeOf(flagsOfMode(mode)), mode);
  assert.equal(decisionModeOf(flagsOfMode('none')), 'none');
  const recommend = flagsOfMode('recommend');
  assert.equal(recommend.decision_source, 'rule');
  assert.equal(recommend.predict_enabled, false);
  assert.equal(recommend.periods_enabled, false);
  const periods = flagsOfMode('periods');
  assert.deepEqual(
    [periods.periods_enabled, periods.triggers_enabled, periods.fixed_replicas_enabled, periods.predict_enabled],
    [true, false, false, false]
  );
});

test('a mode can be switched on only while nothing else is on', () => {
  assert.equal(modeBlocking('none', 'periods'), null);
  assert.equal(modeBlocking('periods', 'periods'), null);
  assert.equal(modeBlocking('periods', 'triggers'), 'periods');
  assert.equal(modeBlocking('triggers', 'algorithm'), 'triggers');
  assert.equal(modeBlocking('algorithm', 'recommend'), 'algorithm');
  assert.equal(modeBlocking('fixed', 'recommend'), 'fixed');
});
