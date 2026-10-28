import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotReasonText } from './snapshot-text.ts';

test('the phrases the server gives become message keys with their figures', () => {
  assert.deepEqual(snapshotReasonText('first recommendation of the module'), { key: 'why_first', params: {} });
  assert.deepEqual(snapshotReasonText('replicas 3 -> 5'), { key: 'why_replicas', params: { from: '3', to: '5' } });
  assert.deepEqual(snapshotReasonText('Pod resource spec v1 -> v2'), {
    key: 'why_spec',
    params: { from: '1', to: '2' }
  });
  assert.deepEqual(snapshotReasonText('algorithm none -> ewma'), {
    key: 'why_algorithm',
    params: { from: 'none', to: 'ewma' }
  });
  assert.deepEqual(snapshotReasonText('mode auto -> admission'), {
    key: 'why_mode',
    params: { from: 'auto', to: 'admission' }
  });
  assert.equal(snapshotReasonText('periodic: the recommendation stood for an hour').key, 'why_periodic');
  assert.equal(snapshotReasonText('degraded').key, 'why_degraded');
  assert.equal(snapshotReasonText('recovered from degradation').key, 'why_recovered');
  assert.equal(
    snapshotReasonText('replicas, resources or algorithm changed (marked when the history was introduced)').key,
    'why_backfill'
  );
});

test('a phrase it does not know is shown as it is, not lost', () => {
  assert.deepEqual(snapshotReasonText('something new'), { key: 'why_other', params: { text: 'something new' } });
  assert.deepEqual(snapshotReasonText(''), { key: 'why_other', params: { text: '' } });
  assert.deepEqual(snapshotReasonText(undefined), { key: 'why_other', params: { text: '' } });
});
