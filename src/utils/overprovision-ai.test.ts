import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalysisQuestion,
  hasComparisonTable,
  mailTables,
  recommendedFigures,
  replicaWords
} from './overprovision-ai.ts';
import { replicaView } from './overprovision-replicas.ts';

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
    text.includes('推荐值（单 Pod）') && text.includes('推荐值（全副本总和）') && text.includes('调整'),
    'the table has the recommendation of one Pod and of all the replicas'
  );
  assert.ok(
    text.includes('平台推荐（仅供对照，不要照抄）'),
    'the platform figures are there to compare with, not to copy'
  );
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
  assert.ok(text.includes('Read-only'));
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
  const rows = ['Replicas', 'CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits']
    .map(name => `<tr><td>${name}</td></tr>`)
    .join('');
  assert.equal(hasComparisonTable(`<table>${rows}</table>`), true);
  assert.equal(
    hasComparisonTable('<td>CPU Requests</td><td>CPU Limits</td><td>Memory Requests</td><td>Memory Limits</td>'),
    false,
    'the replicas are part of the comparison'
  );
  assert.equal(
    hasComparisonTable('<table><tr><td>CPU Requests</td></tr><tr><td>Memory Limits</td></tr></table>'),
    false
  );
  assert.equal(
    hasComparisonTable(
      '<td>副本数</td><td>cpu&nbsp;requests</td><td>CPU limits</td><td>Memory   Requests</td><td>memory limits</td>'
    ),
    true
  );
});

test('the recommended figures are the platform, and the total is the figure of one Pod times the replicas', () => {
  const rows = recommendedFigures(detail());
  assert.equal(rows.length, 4);
  const cpu = rows[0];
  assert.equal(cpu.label, 'CPU Requests');
  // the suggestion of the fixture is 1 core a Pod and the module has 4 replicas; the request now is 4 cores
  assert.equal(cpu.pod, '1 core');
  assert.equal(cpu.total, '4 cores');
  assert.equal(cpu.nowPod, '4 cores');
  assert.equal(cpu.nowTotal, '16 cores');
  assert.ok(rows[1].label === 'CPU Limits' && rows[2].label === 'Memory Requests' && rows[3].label === 'Memory Limits');
  const text = buildAnalysisQuestion(detail(), '7d', 'zh-CN');
  for (const row of rows) assert.ok(text.includes(row.pod), `the question gives ${row.label} ${row.pod}`);
});

test('each row says how far the figure now is from the recommendation, with the amount and its share', () => {
  const rows = recommendedFigures(detail(), true);
  // 4 cores now, 1 core recommended, over-provisioned: 3 cores, 75%
  assert.equal(rows[0].adjust, '超配 3 cores (75.0%)');
  // 6 cores of Limits now, 1.5 recommended: a Limits has no verdict of its own, so it is told as what it is (the status is of the Requests)
  assert.equal(rows[1].adjust, '可降低 4.5 cores (75.0%)');
  const d = detail();
  d.windows[0].cpu!.suggested = 3.5;
  d.windows[0].cpu!.status = 'ok';
  assert.equal(recommendedFigures(d, true)[0].adjust, '合理，可优化 500 mCPU (12.5%)');
  d.windows[0].cpu!.suggested = 4;
  assert.equal(recommendedFigures(d, true)[0].adjust, '合理，无需调整');
  d.windows[0].cpu!.suggested = 9;
  d.windows[0].cpu!.status = 'under';
  assert.equal(recommendedFigures(d, true)[0].adjust, '欠配 5 cores (125.0%)');
  assert.equal(recommendedFigures(d, false)[0].adjust, 'under-provisioned by 5 cores (125.0%)');
  const question = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(question.includes('；欠配 5 cores (125.0%)'));
});

test('the figures of the recommendation period are the ones that count, not those of the window of the page', () => {
  const d = detail();
  const recommend = { label: '7d', window_minutes: 10080, cpu: result('cpu', 1), memory: result('memory', GIB) };
  recommend.cpu.suggested = 2;
  d.windows[0].label = '1h';
  d.recommend = recommend;
  assert.equal(recommendedFigures(d)[0].pod, '2 cores');
});

const plan = (over: Partial<Api.Overprovision.ReplicaPlan> = {}): Api.Overprovision.ReplicaPlan => ({
  current: 4,
  needed: 3,
  raw: 3,
  direction: 'in',
  delta: -1,
  share: 0.25,
  binding: 'cpu',
  resources: [],
  primary: 'replicas',
  reasons: [],
  limits: { min: 0, max: 0, scale_up_step: 0, scale_down_step: 0 },
  formula: 'cpu replicas = max(P95 3.3 / (4 x 85%) = 0.97)',
  ...over
});

test('the AI is asked for its own conclusion on the measured data, and the platform recommendation is only there to compare with', () => {
  const d = detail();
  d.windows[0].replica_plan = plan();
  d.replicas_from = 'prometheus';
  d.replicas_min = 4;
  d.replicas_max = 9;
  const zh = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(zh.includes('独立分析') && zh.includes('不得照抄'), 'the AI judges on its own');
  assert.ok(zh.includes('优先推荐调整副本数'), 'the replicas come first');
  assert.ok(
    zh.includes('AI 与平台推荐的差异') && zh.includes('原因'),
    'the differences from the platform are explained'
  );
  assert.ok(
    zh.includes('模块管理里这个模块配置的约束') && zh.includes('不减副本'),
    'no unreasonable scale-in, within the module constraints'
  );
  assert.ok(zh.includes('模块没有配置副本数约束'), 'a module that sets none is told so');
  assert.ok(
    zh.includes('当前副本数 4（Prometheus 实测的就绪副本数），推荐周期内最少 4、最多 9'),
    "the replicas now are the cluster's"
  );
  // the data comes before the platform figures, which come last and short
  assert.ok(zh.indexOf('实测数据') < zh.indexOf('平台推荐（仅供对照'));
  assert.ok(zh.includes('副本数：当前 4；平台推荐 3（减少 1 个副本（25.0%））'));
  assert.ok(!zh.includes('逐字抄'), 'nothing says to copy the platform');
  const en = buildAnalysisQuestion(d, '7d', 'en-US');
  assert.ok(en.includes('on your own') && en.includes('do not copy'));
  assert.ok(en.includes('AI vs platform recommendation'));
});

test('the replicas now are never stood in for by a forecast or a recommendation', () => {
  const d = detail();
  d.replicas = 0;
  assert.ok(
    buildAnalysisQuestion(d, '7d', 'zh-CN').includes('当前副本数：Prometheus 无数据（不要用预测或推荐值代替）')
  );
});

test('the words and the colours of the replicas', () => {
  const d = detail();
  d.windows[0].replica_plan = plan();
  assert.deepEqual(replicaWords(replicaView(d), true), { text: '减少 1 个副本（25.0%）', level: 'warn' });
  d.windows[0].replica_plan = plan({ direction: 'out', delta: 2, needed: 6, share: 0.5 });
  assert.deepEqual(replicaWords(replicaView(d), false), { text: 'add 2 replicas (50.0%)', level: 'bad' });
  d.windows[0].replica_plan = plan({ direction: 'same', delta: 0, needed: 4, share: 0 });
  assert.equal(replicaWords(replicaView(d), true).level, 'ok');
  assert.equal(replicaWords(null, true).level, 'info');
});

test('the mail has the tables of the platform: one row for each item of each way, and the current against the recommended configuration', () => {
  const d = detail();
  d.windows[0].replica_plan = plan();
  const tables = mailTables(d, true);
  assert.equal(tables.length, 2);
  const [ways, configs] = tables;
  assert.deepEqual(ways.columns, ['方案', '项目', '当前', '推荐', '调整']);
  assert.equal(ways.rows.length, 6);
  assert.equal(ways.rows[0][1].text, '副本数');
  assert.equal(ways.rows[0][2].text, '4');
  assert.equal(ways.rows[0][3].text, '3');
  assert.equal(ways.rows[0][3].level, 'warn');
  assert.ok(ways.rows[0][0].text.includes('优先'));
  assert.equal(ways.rows[1][4].text, 'Pod 配置不变');
  assert.equal(ways.rows[4][1].text, 'CPU Requests');
  assert.equal(ways.rows[4][4].text, '超配 3 cores (75.0%)');
  assert.equal(configs.rows.length, 4);
  assert.deepEqual(
    configs.rows.map(row => row[0].text),
    ['CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits']
  );
  assert.equal(configs.rows[0][5].text, '超配 3 cores (75.0%)');
  assert.equal(configs.rows[0][5].level, 'warn');
});

test('the AI compares like with like: one figure to a cell, the ways named, the platform figures by way', () => {
  const d = detail();
  d.windows[0].replica_plan = plan();
  const zh = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(zh.includes('副本数（方案①）') && zh.includes('CPU Requests（方案②）'));
  assert.ok(zh.includes('不要写“主方案”“备选”'));
  assert.ok(zh.includes('方案①（Pod 配置不变）副本数：当前 4；平台推荐 3'));
  assert.ok(zh.includes('方案②（副本数不变）CPU Requests：当前 单 Pod 4 cores'));
  assert.ok(zh.length <= 3900);
});

test('the constraints of the module are given to the AI, and where the replicas come from', () => {
  const d = detail();
  d.windows[0].replica_plan = plan({ limits: { min: 3, max: 20, scale_up_step: 4, scale_down_step: 2 } });
  d.replicas_from = 'kubernetes';
  d.replicas_ready = 3;
  const zh = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(zh.includes('最少 3 个，最多 20 个，每次最多增加 4 个，每次最多减少 2 个'));
  assert.ok(zh.includes('当前副本数 4（Kubernetes 的 spec.replicas，operator 读取，其中就绪 3）'));
});

test('the AI is asked to typeset formulas and is given the coefficients of the module', () => {
  const d = detail();
  d.coefficients = { capacity_reserve: 0.8, capacity_reserve_set: true, headroom: 1.2, oom_uplift: 1.5 };
  d.params = {
    p90: { target: 0.8, low: 0.7, high: 0.85 },
    p95: { target: 0.85, low: 0.8, high: 0.9 },
    p99: { target: 1.1, low: 0.8, high: 1.2 },
    limit_headroom: 0.2,
    cpu_request_headroom: 0.1,
    memory_limit_headroom: 0.3,
    peak_near_limit: 0.9
  };
  const zh = buildAnalysisQuestion(d, '7d', 'zh-CN');
  assert.ok(
    zh.includes('<div class="fx">') && zh.includes('<span class="fx-c">'),
    'a formula is a block of lines with its coefficient marked'
  );
  assert.ok(zh.includes('除以系数'), 'a recommendation is divided by the coefficient');
  assert.ok(zh.includes('模块的计算系数：容量保留系数 0.8、推荐值系数 1.2、OOM 保护系数 1.5'));
  assert.ok(
    zh.includes(
      'Requests 目标占比 P90 0.8、P95 0.85、P99 1.1；Requests 余量 CPU 0.1、内存 0；Limits 余量 CPU 0.2、内存 0.3；Limits 峰值占比上限 0.9'
    )
  );
  // the margins are of each resource: the CPU one the module left unset is the system's, the memory one is the module's
  assert.ok(zh.length <= 3900);
  const en = buildAnalysisQuestion(d, '7d', 'en-US');
  assert.ok(en.includes('capacity reserve coefficient 0.8'));
  d.coefficients = { capacity_reserve: 1, capacity_reserve_set: false, headroom: 1, oom_uplift: 1.2 };
  assert.ok(buildAnalysisQuestion(d, '7d', 'zh-CN').includes('容量保留系数 未配置（按 1）'));
});
