import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleFormulaLines, recommendationLines } from './formula.ts';

const words = {
  requests: 'Recommended Requests',
  limits: 'Recommended Limits',
  recommended: 'Recommended',
  withFigures: 'With the figures',
  floorOom: 'OOM floor',
  floorThrottle: 'Throttle floor',
  coefSource: 'coefficient of the module',
  headroom: 'margin',
  requestHeadroom: 'Requests margin',
  use: 'use'
};

const params = {
  p90: { target: 0.8, low: 0.7, high: 0.85 },
  p95: { target: 0.85, low: 0.8, high: 0.9 },
  p99: { target: 1.1, low: 0.8, high: 1.2 },
  limit_factor: 1.2,
  oom_uplift: 1.2
} as unknown as Api.Overprovision.Params;

const result = (over: Partial<Api.Overprovision.Result> = {}) =>
  ({
    resource: 'cpu',
    request: 4,
    suggested: 3.8,
    suggested_limit: 4.8,
    oom_working_set: 0,
    reasons: [],
    usage: { points: 10, p50: 1, p90: 2.9, p95: 3.2, p99: 4.0, max: 4.6 },
    ...over
  }) as unknown as Api.Overprovision.Result;

const plain = (tokens: Array<{ text: string }>) => tokens.map(t => t.text).join(' ');

test('the recommendation is written step by step with the divisor of each percentile marked as a coefficient', () => {
  const lines = recommendationLines(result(), params, words);
  assert.equal(lines.length, 3);
  assert.equal(plain(lines[0].tokens), 'Recommended = max ( P90 ÷ 0.8 , P95 ÷ 0.85 , P99 ÷ 1.1 )');
  assert.deepEqual(
    lines[0].tokens.filter(t => t.kind === 'coef').map(t => t.text),
    ['0.8', '0.85', '1.1']
  );
  // the line with the figures: the use divided by the coefficient, and the largest
  assert.equal(
    plain(lines[1].tokens),
    '= max ( 2.9 cores ÷ 0.8 = 3.62 cores , 3.2 cores ÷ 0.85 = 3.76 cores , 4 cores ÷ 1.1 = 3.64 cores ) = 3.76 cores'
  );
  assert.equal(lines[1].tokens.at(-1)?.kind, 'res');
  assert.ok(plain(lines[2].tokens).startsWith('Limits = max ( Recommended , P99 × 120% )'));
});

test('an OOM or a throttled CPU adds the floor line, and nothing is written when there is no use', () => {
  const withOom = recommendationLines(
    result({ resource: 'memory', request: 4 * 2 ** 30, oom_working_set: 2 ** 30, reasons: ['oom'] }),
    params,
    words
  );
  assert.ok(withOom.some(line => line.label === 'OOM floor'));
  const throttled = recommendationLines(result({ reasons: ['throttled'] }), params, words);
  assert.ok(throttled.some(line => line.label === 'Throttle floor'));
  assert.deepEqual(recommendationLines(result({ usage: { points: 0 } as never }), params, words), []);
});

const form = {
  headroom_ratio: 1.2,
  target_utilization: 0.8,
  rec_p90_target: 0,
  rec_p95_target: 0.9,
  rec_p99_target: 0,
  rec_limit_guard: 0,
  rec_cpu_request_headroom: 0,
  rec_memory_request_headroom: 0,
  rec_cpu_limit_factor: 0,
  rec_memory_limit_factor: 0,
  oom_memory_uplift: 1.5,
  oom_calc_working_set_ratio: 1,
  oom_calc_limit_ratio: 0.5,
  oom_calc_history_ratio: 1,
  floor_ratio: 0
};
const previewWords = {
  cpu: 'CPU',
  memory: 'Memory',
  peak: 'peak',
  headroom: 'recommendation coefficient',
  reserve: 'capacity reserve coefficient',
  oom: 'OOM calculation coefficient',
  workingSet: 'working set',
  limit: 'limit',
  history: 'history',
  uplift: 'OOM protection coefficient',
  floor: 'floor coefficient',
  statedRequest: 'stated request',
  board: 'dashboard',
  boardLimits: 'dashboard limits',
  cpuRequests: 'CPU Requests',
  memoryRequests: 'Memory Requests',
  cpuLimits: 'CPU Limits',
  memoryLimits: 'Memory Limits',
  requestHeadroom: 'Requests margin',
  limitFactor: 'Limits coefficient',
  system: 'system',
  keepsNeed: ''
};

test('the formulas of module management are written with the coefficients the form holds', () => {
  const lines = moduleFormulaLines(form, previewWords);
  assert.equal(
    plain(lines[0].tokens),
    'CPU = peak × 1.2 ÷ 0.8',
    'divided by the capacity reserve coefficient, not multiplied by it'
  );
  assert.equal(lines[0].tokens.find(t => t.text === '0.8')?.title, 'capacity reserve coefficient');
  assert.ok(plain(lines[2].tokens).includes('working set × 1 , limit × 0.5 , history × 1 ) × 1.5'));
  // the floor coefficient is off at 0: there is no line for it
  assert.ok(!lines.some(line => line.label === 'floor coefficient'));
  assert.ok(
    plain(lines.find(line => line.label === 'CPU Requests')!.tokens).includes(
      'P90 ÷ system , P95 ÷ 0.9 , P99 ÷ system'
    ),
    'a share the module leaves at 0 follows the system'
  );
  assert.deepEqual(
    lines.filter(line => /Requests|Limits/.test(line.label)).map(line => line.label),
    ['CPU Requests', 'Memory Requests', 'CPU Limits', 'Memory Limits'],
    'each resource has its own Requests and Limits line'
  );
  // typing another value changes the line
  const changed = moduleFormulaLines({ ...form, target_utilization: 0.7, floor_ratio: 0.5 }, previewWords);
  assert.equal(plain(changed[0].tokens), 'CPU = peak × 1.2 ÷ 0.7');
  assert.ok(changed.some(line => line.label === 'floor coefficient'));
  // an unset capacity reserve coefficient divides by 1
  assert.equal(
    plain(moduleFormulaLines({ ...form, target_utilization: 0 }, previewWords)[0].tokens),
    'CPU = peak × 1.2 ÷ 1'
  );
});

test('the Requests margin and the Limits coefficient are each resource own', () => {
  const margins = { ...form, rec_cpu_request_headroom: 0.1, rec_memory_limit_factor: 1.3 };
  const lines = moduleFormulaLines(margins, previewWords);
  const line = (label: string) => plain(lines.find(item => item.label === label)!.tokens);
  assert.ok(line('CPU Requests').endsWith('× ( 1 + 0.1 )'), 'the CPU has its margin');
  assert.ok(!line('Memory Requests').includes('×'), 'the memory has none');
  assert.ok(line('CPU Limits').includes('× system )'), 'no coefficient of its own: the system one');
  assert.ok(line('Memory Limits').includes('× 1.3 )'));

  const withMargin = recommendationLines(
    result(),
    { ...params, cpu_request_headroom: 0.1, memory_limit_factor: 1.5 } as unknown as Api.Overprovision.Params,
    words
  );
  assert.ok(plain(withMargin[0].tokens).endsWith('× ( 1 + 10% )'));
  assert.ok(plain(withMargin[1].tokens).endsWith('= 3.76 cores × ( 1 + 10% ) = 4.14 cores'));
  assert.ok(
    plain(withMargin[2].tokens).startsWith('Limits = max ( Recommended , P99 × 120% )'),
    'the CPU keeps the margin of the system'
  );
});
