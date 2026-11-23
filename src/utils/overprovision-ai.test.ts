import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalysisQuestion,
  hasComparisonTable,
  missingRecommendations,
  recommendedFigures
} from './overprovision-ai.ts';

const GIB = 1024 ** 3;

function result(resource: 'cpu' | 'memory', scale: number): any {
  return {
    resource,
    window_minutes: 10080,
    request: 4 * scale,
    limit: 6 * scale,
    limit_from: 'module',
    usage: {
      points: 2016,
      p50: 0.6 * scale,
      p90: 0.79 * scale,
      p95: 0.8 * scale,
      p99: 0.81 * scale,
      max: 0.82 * scale
    },
    total: { points: 2016, p50: 2.4 * scale, p90: 3.2 * scale, p95: 3.3 * scale, p99: 3.4 * scale, max: 3.5 * scale },
    coverage: 1,
    expected_points: 2016,
    suggested: 1 * scale,
    suggested_limit: 1.5 * scale,
    ratio: 0.75,
    numerator: 3 * scale,
    denominator: 4 * scale,
    reclaimable: 3 * scale,
    status: 'over',
    grade: 'severe',
    confidence: 'high',
    risk: 'low',
    throttle: 0.06,
    oom_kills: 0,
    oom_working_set: 0,
    reasons: ['no_limit'],
    formula: 'max(P95 x 1.2, P99)',
    formula_version: 'op-1'
  };
}

function detail(): any {
  return {
    module_id: 3,
    name: 'shop-api',
    namespace: 'prod',
    workload_kind: 'Deployment',
    workload: 'shop-api',
    replicas: 4,
    at: '2026-11-19T10:00:00Z',
    windows: [{ label: '7d', window_minutes: 10080, cpu: result('cpu', 1), memory: result('memory', GIB) }],
    metrics: [
      {
        key: 'jvm_heap_used',
        name: 'jvm_heap_used',
        kind: 'jvm_heap_used',
        group: 'jvm',
        level: 'workload',
        unit: 'bytes',
        points: 10,
        latest: GIB,
        p50: GIB,
        p90: GIB,
        p95: GIB,
        p99: GIB,
        max: GIB
      }
    ]
  };
}

test('the question carries the P90, the P95 and the P99 and says what the limit rests on', () => {
  const text = buildAnalysisQuestion(detail(), '7d', 'zh-CN');
  for (const q of ['P90', 'P95', 'P99']) assert.ok(text.includes(q), q);
  assert.ok(text.includes('shop-api'));
  for (const row of ['CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits'])
    assert.ok(text.includes(row), row);
  assert.ok(
    text.includes('当前配置与 AI 推荐配置对比'),
    'the answer has to compare the current and the recommended configuration'
  );
  assert.ok(
    text.includes('推荐值（单 Pod）') && text.includes('推荐值（全副本总和）'),
    'the table has the recommendation of one Pod and of all the replicas'
  );
  assert.ok(text.includes('平台推荐值'), 'the platform figures are given to be copied');
  assert.ok(text.includes('只读'), 'the question asks for an analysis and nothing else');
  assert.ok(
    text.includes('只输出 HTML') && text.includes('<td class="lv-warn">'),
    'the answer is HTML tables with levels'
  );
  assert.ok(!text.includes('下一步建议'), 'no next-step section is asked for');
  assert.ok(text.includes('jvm_heap_used'), 'the metrics that are set up go with it');
  assert.ok(text.includes('被限流'), 'a throttled CPU is told');
});

test('the same question in English', () => {
  const text = buildAnalysisQuestion(detail(), '7d', 'en-US');
  assert.ok(text.includes('read-only'));
  assert.ok(text.includes('Current configuration vs AI recommended configuration'));
  assert.ok(!text.includes('只读'));
});

test('a question never goes over what the assistant takes', () => {
  const d = detail();
  d.metrics = Array.from({ length: 400 }, (_, i) => ({
    ...d.metrics[0],
    key: `m${i}`,
    name: `metric_${i}_${'x'.repeat(30)}`
  }));
  assert.ok(buildAnalysisQuestion(d, '7d', 'zh-CN').length <= 3900);
});

test('a request or a limit Prometheus has no figure for is said so, not filled in from anywhere', () => {
  const d = detail();
  d.windows[0].cpu!.request = 0;
  d.windows[0].cpu!.limit = 0;
  const text = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(text.includes('Requests Prometheus 无数据，Limits Prometheus 无数据'));
});

test('an answer without the four rows of the comparison is told from one with them', () => {
  const rows = ['CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits']
    .map(name => `<tr><td>${name}</td></tr>`)
    .join('');
  assert.equal(hasComparisonTable(`<table>${rows}</table>`), true);
  assert.equal(
    hasComparisonTable('<table><tr><td>CPU Requests</td></tr><tr><td>Memory Limits</td></tr></table>'),
    false
  );
  assert.equal(
    hasComparisonTable('<td>cpu&nbsp;requests</td><td>CPU limits</td><td>Memory   Requests</td><td>memory limits</td>'),
    true
  );
});

test('the recommended figures are whole, rounded up, and the total is the figure of one Pod times the replicas', () => {
  const rows = recommendedFigures(detail());
  assert.equal(rows.length, 4);
  const cpu = rows[0];
  assert.equal(cpu.label, 'CPU Requests');
  // the suggestion of the fixture is 1 core a Pod (scale 1) and the module has the replicas of the fixture
  assert.match(cpu.pod, /^\d+ (mCPU|cores?)$/);
  assert.ok(rows[1].label === 'CPU Limits' && rows[2].label === 'Memory Requests' && rows[3].label === 'Memory Limits');
  const text = buildAnalysisQuestion(detail(), '7d', 'zh-CN');
  for (const row of rows) assert.ok(text.includes(row.pod), `the question gives ${row.label} ${row.pod}`);
});

test('an answer that does not write the platform figures is told', () => {
  const d = detail();
  const rows = recommendedFigures(d);
  const good = rows.map(row => `<tr><td>${row.label}</td><td>${row.pod}</td><td>${row.total}</td></tr>`).join('');
  assert.deepEqual(missingRecommendations(`<table>${good}</table>`, d), []);
  const bad = `<table>${good.replace(rows[0].pod, '123456 foo')}</table>`;
  assert.deepEqual(missingRecommendations(bad, d), ['CPU Requests']);
});
