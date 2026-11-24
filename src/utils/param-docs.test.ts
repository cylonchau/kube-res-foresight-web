import assert from 'node:assert/strict';
import test from 'node:test';
import { type DocForm, paramDoc } from './param-docs.ts';

const form: DocForm = {
  headroom_ratio: 1.2,
  target_utilization: 0.8,
  rec_p90_target: 0,
  rec_p95_target: 0.9,
  rec_p99_target: 0,
  rec_limit_guard: 0,
  rec_sustain_minutes: 30,
  rec_cpu_request_headroom: 0.1,
  rec_memory_request_headroom: 0,
  rec_cpu_limit_factor: 0,
  rec_memory_limit_factor: 1.3,
  oom_memory_uplift: 1.5,
  oom_calc_working_set_ratio: 1,
  oom_calc_limit_ratio: 0.5,
  oom_calc_history_ratio: 1,
  floor_ratio: 0.5,
  max_shortfall: 0.5,
  min_cpu_milli: 3000,
  min_memory_mib: 0,
  pod_cpu_request_milli: 1000
};
const ctx = {
  t: (key: string) => key,
  system: { p90: 0.8, p95: 0.85, p99: 1.1, limitFactor: 1.2, limitGuard: 0.9, sustain: 30 }
};
const plain = (lines: Array<{ tokens: Array<{ text: string }> }>) =>
  lines.map(line => line.tokens.map(t => t.text).join(' '));

test('the recommendation coefficient shows the worked example with the figures of the form', () => {
  const doc = paramDoc('headroom', form, ctx);
  assert.deepEqual(plain(doc.example), ['4 × 1.2 = 4.8', '4.8 ÷ 0.8 = 6']);
});

test('the capacity reserve coefficient divides, and its example uses the value typed', () => {
  const doc = paramDoc('reserve', form, ctx);
  assert.equal(plain(doc.formula)[0].includes('÷'), true);
  assert.equal(plain(doc.example)[0], '4 × 1.2 ÷ 0.8 = 6');
  assert.equal(plain(paramDoc('reserve', { ...form, target_utilization: 0 }, ctx).example)[0], '4 × 1.2 ÷ 1 = 4.8');
});

test('the Requests margin and the Limits coefficient are each resource’s own, and a Limits coefficient the module leaves unset is the system one', () => {
  assert.equal(plain(paramDoc('cpuRequestHeadroom', form, ctx).example)[0], '4 × ( 1 + 0.1 ) = 4.4');
  assert.equal(plain(paramDoc('memoryRequestHeadroom', form, ctx).example)[0], '4 × ( 1 + 0 ) = 4');
  assert.match(plain(paramDoc('cpuLimitFactor', form, ctx).example)[0], /× 1\.2 \)/, 'the system 120%');
  assert.match(plain(paramDoc('memoryLimitFactor', form, ctx).example)[0], /× 1\.3 \)/, 'the module 130%');
});

test('the percentile target follows the system where the module sets none', () => {
  assert.equal(plain(paramDoc('p90', form, ctx).example)[0], '3 ÷ 0.8 = 3.75');
  assert.equal(plain(paramDoc('p95', form, ctx).example)[0], '3 ÷ 0.9 = 3.3333');
});

test('the floor and the shortfall cap are worked out from their coefficients', () => {
  assert.equal(plain(paramDoc('floor', form, ctx).example)[0], '4000 m × 0.5 = 2000 m');
  assert.equal(plain(paramDoc('shortfall', form, ctx).example)[0], '1 ÷ ( 1 − 0.5 ) = 2 ×');
  // the floor value: a need below it becomes it
  assert.match(plain(paramDoc('minCpu', form, ctx).example)[0], /= 3000 m$/);
});

test('every document has all five parts', () => {
  for (const id of [
    'reserve',
    'headroom',
    'p90',
    'cpuLimitFactor',
    'limitGuard',
    'oomUplift',
    'oomLimit',
    'floor',
    'shortfall',
    'minMemory'
  ] as const) {
    const doc = paramDoc(id, form, ctx);
    assert.ok(doc.definition && doc.role && doc.scope, id);
    assert.ok(doc.formula.length > 0 && doc.example.length > 0, id);
  }
});

test('the sustain window holds a short peak and keeps a long one', () => {
  const doc = paramDoc('sustain', form, ctx);
  // 30 minutes of 5 minute points: one point of 4 cores among five of 2 cores is 14 / 6 = 2.3333, and six points of 4 cores stay 4
  assert.match(plain(doc.example)[0], /= 2\.3333/);
  assert.match(plain(doc.example)[1], /= 4/);
  // not set on the module: the system's window
  assert.match(
    plain(
      paramDoc('sustain', { ...form, rec_sustain_minutes: 0 }, { ...ctx, system: { ...ctx.system, sustain: 10 } })
        .example
    )[0],
    /\( 4 \+ 2 × 1 \) ÷ 2 = 3/
  );
});
