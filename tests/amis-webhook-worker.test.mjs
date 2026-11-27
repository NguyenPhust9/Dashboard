import assert from 'node:assert/strict';
import test from 'node:test';
import { isClaimedJob, processClaimedJob } from '../scripts/amis-webhook-worker.mjs';

const job = { month: '2026-11', leaseToken: '8bc0ad67-7d3a-472f-bd0e-c57dfc8d949b', revision: 2, attempt: 1 };

test('finishes a revision only after both snapshots have been saved sequentially', async () => {
  const calls = [];
  const result = await processClaimedJob(job, {
    sync: async (kind, month) => { calls.push([kind, month]); },
    acknowledge: async (action, value) => { calls.push([action, value.revision]); return true; },
  });
  assert.equal(result, 'complete');
  assert.deepEqual(calls, [['staff', '2026-11'], ['customers', '2026-11'], ['complete', 2]]);
});

test('failed first snapshot never runs the second or acknowledges completion', async () => {
  const calls = [];
  const result = await processClaimedJob(job, {
    sync: async kind => { calls.push(kind); throw new Error('API unavailable'); },
    acknowledge: async action => { calls.push(action); return true; },
  });
  assert.equal(result, 'retry');
  assert.deepEqual(calls, ['staff', 'fail']);
});

test('failed second snapshot preserves retry even after first snapshot succeeded', async () => {
  let acknowledgement;
  const result = await processClaimedJob(job, {
    sync: async kind => { if (kind === 'customers') throw new Error('API unavailable'); },
    acknowledge: async action => { acknowledgement = action; return true; },
  });
  assert.equal(result, 'retry');
  assert.equal(acknowledgement, 'fail');
});

test('stale lease acknowledgement does not claim that a revision was completed', async () => {
  assert.equal(await processClaimedJob(job, { sync: async () => {}, acknowledge: async () => false }), 'stale');
});

test('lost acknowledgement propagates so a server lease can expire and retry', async () => {
  await assert.rejects(processClaimedJob(job, {
    sync: async () => {}, acknowledge: async () => { throw new Error('Network lost'); },
  }), /Network lost/);
});

test('rejects malformed queue jobs before starting any sync command', () => {
  assert.equal(isClaimedJob(job), true);
  for (const invalid of [null, {}, { ...job, month: '2026-13' }, { ...job, month: '--help' },
    { ...job, leaseToken: 'invalid' }, { ...job, revision: 0 }, { ...job, attempt: -1 }]) {
    assert.equal(isClaimedJob(invalid), false);
  }
});
