import assert from 'node:assert/strict';
import test from 'node:test';
import { grafanaRange, grafanaUrl, parseRouteSelection } from './resource-links.ts';

const settings = {
  base_url: 'https://grafana.example.com/',
  dashboard_uid: 'kube-res-foresight-resources',
  cluster: 'prod',
  configured: true
};

test('there is no link while there is no Grafana address', () => {
  assert.equal(grafanaUrl({ ...settings, configured: false, base_url: '' }, { namespace: 'a' }), null);
  assert.equal(grafanaUrl(null), null);
});

test('the link fills the variables that are given, the cluster and the range, and has no double slash', () => {
  const url = new URL(grafanaUrl(settings, { namespace: 'prod', workload: 'web', pod: 'web-0' }, { window: '7d' })!);
  assert.equal(url.origin + url.pathname, 'https://grafana.example.com/d/kube-res-foresight-resources');
  assert.equal(url.searchParams.get('var-cluster'), 'prod');
  assert.equal(url.searchParams.get('var-namespace'), 'prod');
  assert.equal(url.searchParams.get('var-workload'), 'web');
  assert.equal(url.searchParams.get('var-pod'), 'web-0');
  assert.equal(url.searchParams.has('var-node'), false, 'a variable that is not given keeps its default in Grafana');
  assert.equal(url.searchParams.get('from'), 'now-7d');
  assert.equal(url.searchParams.get('to'), 'now');
});

test('a value is encoded, not trusted', () => {
  const url = grafanaUrl(settings, { workload: 'a&b=c d' })!;
  assert.ok(url.includes('var-workload=a%26b%3Dc+d'), url);
});

test('a custom range is the epoch milliseconds, a window that is not one is the last 6 hours', () => {
  assert.deepEqual(grafanaRange({ from: '2026-01-01T00:00:00Z', to: '2026-01-01T01:00:00Z' }), {
    from: String(Date.parse('2026-01-01T00:00:00Z')),
    to: String(Date.parse('2026-01-01T01:00:00Z'))
  });
  assert.deepEqual(grafanaRange({ window: 'custom' }), { from: 'now-6h', to: 'now' });
  assert.deepEqual(grafanaRange({ from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' }), {
    from: 'now-6h',
    to: 'now'
  });
});

test('the page takes one namespace, workload, module and window from the query, and nothing Grafana fills with All or with several', () => {
  assert.deepEqual(parseRouteSelection({ namespace: 'prod', workload: 'web', module: '5', window: '7d' }), {
    namespace: 'prod',
    workload: 'web',
    moduleId: 5,
    window: '7d'
  });
  assert.deepEqual(parseRouteSelection({ namespace: '.*', workload: 'a|b', module: 'x', window: '9y' }), {});
  assert.deepEqual(parseRouteSelection({ namespace: ['a', 'b'], workload: '$__all' }), {});
});
