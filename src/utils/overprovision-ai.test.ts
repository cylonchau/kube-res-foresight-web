import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalysisQuestion } from './overprovision-ai.ts';

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
    ],
    history: []
  };
}

test('the question carries the P90, the P95 and the P99 and says what the limit rests on', () => {
  const text = buildAnalysisQuestion(detail(), '7d', 'zh-CN');
  for (const q of ['P90', 'P95', 'P99']) assert.ok(text.includes(q), q);
  assert.ok(text.includes('shop-api'));
  assert.ok(text.includes('不是实测'), 'a limit that is only the ratio of the module says so');
  assert.ok(text.includes('只读'), 'the question asks for an analysis and nothing else');
  assert.ok(text.includes('jvm_heap_used'), 'the metrics that are set up go with it');
  assert.ok(text.includes('被限流'), 'a throttled CPU is told');
});

test('the same question in English', () => {
  const text = buildAnalysisQuestion(detail(), '7d', 'en-US');
  assert.ok(text.includes('read-only'));
  assert.ok(text.includes('not measured'));
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
