import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterOf, identityTables, mailTitle } from './mail-identity.ts';

const detail = {
  module_id: 7,
  name: 'shop-web',
  namespace: 'shop',
  workload_kind: 'Deployment',
  workload: 'shop-shop-web',
  replicas: 12,
  replicas_ready: 11,
  replicas_abnormal: 1,
  replicas_min: 10,
  replicas_max: 13,
  datasource: { id: 1, name: 'demo-prometheus' },
  identity: {
    cluster: 'demo',
    namespace: 'shop',
    kind: 'Deployment',
    name: 'shop-shop-web',
    observed_at: 1,
    pods: [
      { name: 'shop-shop-web-7d9f-a1', node: 'n1', phase: 'Running', ready: true, restarts: 0 },
      { name: 'shop-shop-web-7d9f-b2', phase: 'Running', ready: false, restarts: 3 }
    ]
  },
  oom: { kills: 2, lookback_days: 14 },
  recommend: {
    label: '7d',
    cpu: {
      resource: 'cpu',
      request: 4,
      status: 'ok',
      throttle: 0.01,
      usage: { points: 10, p50: 1, p90: 2, p95: 2.9, p99: 3.5, max: 4 },
      shares: { p95: 0.73 }
    },
    memory: {
      resource: 'memory',
      request: 6 * 1024 ** 3,
      status: 'under',
      oom_kills: 2,
      usage: { points: 10, p50: 4e9, p90: 5e9, p95: 5.2e9, p99: 5.6e9, max: 6e9 }
    }
  },
  windows: []
} as unknown as Api.Overprovision.Detail;

const cell = (rows: Array<Array<{ text: string }>>, item: string) => rows.find(r => r[0].text === item)?.[1].text;

test('the mail says which cluster, namespace, module and Pods it is about, and how the module has been running', () => {
  const tables = identityTables(detail, true);
  assert.deepEqual(
    tables.map(t => t.caption),
    ['模块与工作负载', 'Pod（operator 上报）', '模块近期运行情况']
  );
  const who = tables[0].rows;
  assert.equal(cell(who, '集群'), 'demo');
  assert.equal(cell(who, '命名空间'), 'shop');
  assert.equal(cell(who, '模块'), 'shop-web');
  assert.equal(cell(who, '工作负载'), 'Deployment/shop-shop-web');
  assert.match(cell(who, 'Pod') ?? '', /2 个，其中未就绪 1 个/);
  assert.deepEqual(
    tables[1].rows.map(r => r[0].text),
    ['shop-shop-web-7d9f-a1', 'shop-shop-web-7d9f-b2']
  );
  const running = tables[2].rows;
  assert.match(cell(running, '副本数') ?? '', /现在 12 个，就绪 11 个，异常 1 个，周期内最少 10、最多 13/);
  assert.match(cell(running, 'CPU 使用（单 Pod）') ?? '', /P95 2.9 cores/);
  assert.equal(cell(running, '内存 判断'), '欠配');
  assert.match(cell(running, 'OOM') ?? '', /2 次被杀/);
});

test('with no report of the operator the cluster is the data source, said as such, and the Pods are not invented', () => {
  const bare = { ...detail, identity: undefined } as Api.Overprovision.Detail;
  assert.match(clusterOf(bare, true), /^demo-prometheus（数据源/);
  const tables = identityTables(bare, true);
  assert.equal(tables.length, 2, 'no table of Pods');
  assert.match(cell(tables[0].rows, 'Pod') ?? '', /没有 Pod 信息/);
});

test('the subject names the cluster, the namespace and the module', () => {
  assert.equal(mailTitle(detail, 'shop-web', '7d'), 'demo · shop/shop-web · 7d');
  assert.equal(mailTitle(null, 'shop-web', '7d'), 'shop-web · 7d');
});
