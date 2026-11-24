import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SYSTEM, type ParamWords, moduleParamGroups, writeParam } from './module-params.ts';

const words: ParamWords = {
  unit: kind => ({ minutes: 'min', seconds: 's', hours: 'h', days: 'd' })[kind],
  on: 'on',
  off: 'off',
  notSet: 'not set',
  enumName: (field, value) => `${field}:${value}`
};

const module = {
  pod_cpu_request_milli: 4000,
  pod_memory_request_bytes: 6 * 1024 ** 3,
  rec_p90_target: 0,
  rec_p95_target: 0.9,
  rec_cpu_limit_factor: 1.3,
  rec_memory_limit_factor: 0,
  rec_sustain_minutes: 0,
  fixed_replicas: 0,
  max_replicas: 20,
  oom_weight_enabled: true,
  min_score: 0,
  replica_mode: 'fixed',
  summary: { actual_replicas: 12, ready_replicas: 11, cpu_milli: null, memory_bytes: null, replicas: null }
} as unknown as Api.Forecast.Module;

const system = {
  ...EMPTY_SYSTEM,
  p90: 0.8,
  p95: 0.85,
  limitFactor: 1.2,
  sustain: 30,
  p95Low: 0.8,
  p95High: 0.9,
  baseline: 7
};

function row(group: string, key: string) {
  const g = moduleParamGroups(module, system, words).find(item => item.key === group);
  return g!.rows.find(item => item.key === key)!;
}

test('a figure is written with its unit, and 0 is "not set" where it means that', () => {
  assert.equal(writeParam('multiple', 1.3, words), '× 1.3');
  assert.equal(writeParam('minutes', 30, words), '30 min');
  assert.equal(writeParam('count', 0, words), 'not set');
  assert.equal(writeParam('bool', true, words), 'on');
});

test('a figure the module leaves at 0 is the system one, and says so; one it sets is its own', () => {
  assert.deepEqual(row('recommend', 'rec_p90_target'), { key: 'rec_p90_target', value: '80%', source: 'system' });
  assert.deepEqual(row('recommend', 'rec_p95_target'), { key: 'rec_p95_target', value: '90%', source: 'module' });
  assert.deepEqual(row('recommend', 'rec_cpu_limit_factor'), {
    key: 'rec_cpu_limit_factor',
    value: '× 1.3',
    source: 'module'
  });
  assert.deepEqual(row('recommend', 'rec_memory_limit_factor'), {
    key: 'rec_memory_limit_factor',
    value: '× 1.2',
    source: 'system'
  });
  assert.equal(row('recommend', 'rec_sustain_minutes').value, '30 min');
});

test('the figures only the system has are shown from it, and a missing summary is not set', () => {
  assert.deepEqual(row('recommend', 'p95_low'), { key: 'p95_low', value: '80%', source: 'system' });
  assert.equal(row('recommend', 'baseline').value, '7 d');
  assert.equal(row('recommend', 'p99_low').source, 'off', 'the system setting was not read');
  assert.equal(row('current', 'summary.cpu_milli').source, 'off');
  assert.equal(row('current', 'summary.actual_replicas').value, '12');
  assert.equal(row('safety', 'min_score').value, '0');
  assert.equal(row('replicas', 'replica_mode').value, 'replica_mode:fixed');
});
