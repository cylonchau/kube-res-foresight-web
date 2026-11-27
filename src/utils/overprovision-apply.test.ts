import assert from 'node:assert/strict';
import test from 'node:test';
import { applyItems, formField, payloadOf } from './overprovision-apply.ts';

const GIB = 1024 ** 3;

const detail = {
  recommend: {
    cpu: { suggested: 4.45, suggested_limit: 8.9 },
    memory: { suggested: 7 * GIB, suggested_limit: 9.1 * GIB },
    replica_plan: { needed: 13 },
    load_profile: { normal: 11, peak: 14 }
  },
  windows: []
} as unknown as Api.Overprovision.Detail;

test('the recommendations of the dashboard become items with the fields of the module they can go in', () => {
  const items = applyItems(detail);
  assert.deepEqual(
    items.map(item => item.key),
    ['cpuRequests', 'cpuLimits', 'memoryRequests', 'memoryLimits', 'replicas', 'normalReplicas', 'peakReplicas']
  );
  const cpu = items.find(item => item.key === 'cpuRequests')!;
  assert.equal(cpu.targets[0].field, 'pod_cpu_request_milli', 'the usual one is first');
  assert.equal(cpu.targets[0].value, 4450, 'cores are millicores in the module');
  const memory = items.find(item => item.key === 'memoryRequests')!;
  assert.equal(memory.targets[0].value, 7 * GIB);
  assert.deepEqual(
    memory.targets.map(target => target.field),
    ['pod_memory_request_bytes', 'min_memory_bytes', 'max_memory_bytes', 'fallback_memory_bytes']
  );
});

test('a Limits recommendation is the ratio to the Requests, and never below 1', () => {
  const items = applyItems(detail);
  assert.equal(items.find(item => item.key === 'cpuLimits')!.targets[0].value, 2);
  assert.equal(items.find(item => item.key === 'memoryLimits')!.targets[0].value, 1.3);
});

test('the replicas go to the usual field, and the normal and the busiest count to the least and the most', () => {
  const items = applyItems(detail);
  assert.equal(items.find(item => item.key === 'replicas')!.targets[0].field, 'fallback_replicas');
  assert.deepEqual(items.find(item => item.key === 'normalReplicas')!.targets, [{ field: 'min_replicas', value: 11 }]);
  assert.deepEqual(items.find(item => item.key === 'peakReplicas')!.targets, [{ field: 'max_replicas', value: 14 }]);
});

test('nothing is offered where the dashboard recommends nothing', () => {
  assert.deepEqual(applyItems(null), []);
  assert.deepEqual(
    applyItems({
      recommend: { cpu: { suggested: 0, suggested_limit: 0 }, memory: null }
    } as unknown as Api.Overprovision.Detail),
    []
  );
  // a Limits recommendation below the Requests is not a ratio the module can take
  const odd = applyItems({
    recommend: { cpu: { suggested: 2, suggested_limit: 1 } }
  } as unknown as Api.Overprovision.Detail);
  assert.deepEqual(
    odd.map(item => item.key),
    ['cpuRequests']
  );
});

test('only the chosen fields are sent, and the fixed replicas are switched on with their count', () => {
  assert.deepEqual(payloadOf([{ field: 'pod_cpu_request_milli', value: 4450 }]), { pod_cpu_request_milli: 4450 });
  assert.deepEqual(payloadOf([{ field: 'fixed_replicas', value: 13 }]), {
    fixed_replicas: 13,
    fixed_replicas_enabled: true
  });
});

test('the form keeps the memory in MiB and everything else as the module does', () => {
  assert.deepEqual(formField({ field: 'pod_memory_request_bytes', value: 7 * GIB }), {
    key: 'pod_memory_request_mib',
    value: 7168
  });
  assert.deepEqual(formField({ field: 'min_memory_bytes', value: GIB }), { key: 'min_memory_mib', value: 1024 });
  assert.deepEqual(formField({ field: 'fallback_memory_bytes', value: GIB }), {
    key: 'fallback_memory_mib',
    value: 1024
  });
  assert.deepEqual(formField({ field: 'min_replicas', value: 3 }), { key: 'min_replicas', value: 3 });
  assert.deepEqual(formField({ field: 'limit_cpu_ratio', value: 1.5 }), { key: 'limit_cpu_ratio', value: 1.5 });
});

test('the replicas and the Pod are two ways, each with its own items', () => {
  assert.deepEqual(
    applyItems(detail, 'replicas').map(item => item.key),
    ['replicas', 'normalReplicas', 'peakReplicas']
  );
  assert.deepEqual(
    applyItems(detail, 'config').map(item => item.key),
    ['cpuRequests', 'cpuLimits', 'memoryRequests', 'memoryLimits']
  );
});

test('a caliber takes the figures of that percentile alone, not the largest of the three', () => {
  const withCaliber = {
    recommend: {
      cpu: {
        suggested: 4.45,
        suggested_limit: 8.9,
        candidates: [
          { name: 'P90', suggested: 3, suggested_limit: 6 },
          { name: 'P99', suggested: 4.45, suggested_limit: 8.9 }
        ]
      },
      memory: null,
      replica_plan: { needed: 13, by_caliber: { P90: { needed: 9 } } }
    },
    windows: []
  } as unknown as Api.Overprovision.Detail;
  assert.equal(applyItems(withCaliber, 'config', 'P90')[0].targets[0].value, 3000);
  assert.equal(applyItems(withCaliber, 'config', 'all')[0].targets[0].value, 4450);
  assert.equal(applyItems(withCaliber, 'replicas', 'P90')[0].recommended, 9);
  assert.deepEqual(applyItems(withCaliber, 'config', 'P95'), [], 'a percentile with no figure offers nothing');
});
