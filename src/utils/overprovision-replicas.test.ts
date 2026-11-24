import assert from 'node:assert/strict';
import test from 'node:test';
import {
  directionLevel,
  replicaDeltaParts,
  replicaView,
  requestsGap,
  schemeGroups,
  statusLevel
} from './overprovision-replicas.ts';

const GIB = 1024 ** 3;
const result = (resource: 'cpu' | 'memory', request: number, suggested: number, status: string) =>
  ({ resource, request, suggested, status }) as unknown as Api.Overprovision.Result;

const detail = (plan: Partial<Api.Overprovision.ReplicaPlan> = {}) =>
  ({
    replicas: 12,
    replicas_from: 'prometheus',
    replicas_at: 1700000000,
    replicas_min: 8,
    replicas_max: 22,
    windows: [],
    recommend: {
      label: '7d',
      window_minutes: 10080,
      cpu: result('cpu', 4, 3.5, 'over'),
      memory: result('memory', 6 * GIB, 9.94 * GIB, 'under'),
      replica_plan: {
        current: 12,
        needed: 15,
        raw: 15,
        direction: 'out',
        delta: 3,
        share: 0.25,
        binding: 'memory',
        resources: [],
        primary: 'replicas',
        reasons: [],
        formula: 'f',
        limits: { min: 0, max: 0, scale_up_step: 0, scale_down_step: 0 },
        ...plan
      }
    }
  }) as unknown as Api.Overprovision.Detail;

test('the replicas of the cluster and the plan for them are kept apart', () => {
  const view = replicaView(detail());
  assert.equal(view?.current, 12);
  assert.equal(view?.recommended, 15);
  assert.equal(view?.min, 8);
  assert.equal(view?.max, 22);
  assert.deepEqual(view && replicaDeltaParts(view), { n: 3, share: '25.0%' });
});

test('there is nothing to say when there are neither', () => {
  assert.equal(replicaView(null), null);
  assert.equal(replicaView({ replicas: 0, windows: [] } as unknown as Api.Overprovision.Detail), null);
});

test('one colour is one meaning', () => {
  assert.equal(directionLevel('in'), 'warn');
  assert.equal(directionLevel('out'), 'bad');
  assert.equal(directionLevel('same'), 'ok');
  assert.equal(directionLevel('unknown'), 'info');
  assert.equal(statusLevel('over'), 'warn');
  assert.equal(statusLevel('under'), 'bad');
  assert.equal(statusLevel('ok'), 'ok');
  assert.equal(statusLevel('limited'), 'info');
});

test('each way has a row for each of its three items, and the Pod stays in the way of the replicas', () => {
  const [byReplicas, byConfig] = schemeGroups(detail());
  assert.equal(byReplicas.first, true);
  assert.deepEqual(
    byReplicas.items.map(i => [i.item, i.now, i.rec]),
    [
      ['replicas', '12', '15'],
      ['cpu', '4 cores', '4 cores'],
      ['memory', '6 GiB', '6 GiB']
    ]
  );
  assert.equal(byReplicas.items[0].level, 'bad');
  assert.equal(byConfig.first, false);
  assert.deepEqual(
    byConfig.items.map(i => [i.item, i.now, i.rec, i.level]),
    [
      ['replicas', '12', '12', 'ok'],
      ['cpu', '4 cores', '3.5 cores', 'warn'],
      ['memory', '6 GiB', '9.94 GiB', 'bad']
    ]
  );
});

test('the Pod is taken first when the replicas cannot do it', () => {
  const [byReplicas, byConfig] = schemeGroups(
    detail({ primary: 'config', direction: 'same', needed: 12, delta: 0, share: 0 })
  );
  assert.equal(byReplicas.first, false);
  assert.equal(byConfig.first, true);
  assert.equal(byReplicas.items[0].level, 'ok');
});

test('the gap of a Requests is its amount of one Pod and its share', () => {
  assert.equal(requestsGap(result('cpu', 4, 3.5, 'over')), '500 mCPU (12.5%)');
  assert.equal(requestsGap(result('cpu', 4, 4, 'ok')), '');
  assert.equal(requestsGap(null), '');
});
