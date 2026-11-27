import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { childErrorCode, configFromEnvironment, createHealthReporter, isClaimedJob,
  processClaimedJob, runWorkerCycle, vietnamMonth, WorkerError } from '../scripts/amis-webhook-worker.mjs';

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

test('cloud config works without a source environment and local periodic sync stays disabled', () => {
  const base = { DASHBOARD_REPORT26_SYNC_URL: 'https://dashboard.example/api/amis-report-sync', AMIS_REPORT_SYNC_SECRET: 'test-only' };
  assert.deepEqual(configFromEnvironment(base), {
    jobsUrl: 'https://dashboard.example/api/amis-webhook/jobs', secret: 'test-only', refreshSeconds: 0,
  });
  assert.equal(configFromEnvironment({ ...base, AMIS_WORKER_REFRESH_SECONDS: '300' }).refreshSeconds, 300);
  assert.equal(configFromEnvironment({}, { DASHBOARD_REPORT26_SYNC_URL: base.DASHBOARD_REPORT26_SYNC_URL,
    DASHBOARD_REPORT_SYNC_SECRET: 'fallback-test-only' }).secret, 'fallback-test-only');
  for (const value of ['-1', '1', '59', '60.5', 'Infinity', 'abc', '86401']) {
    assert.throws(() => configFromEnvironment({ ...base, AMIS_WORKER_REFRESH_SECONDS: value }), /REFRESH_SECONDS/);
  }
  assert.throws(() => configFromEnvironment({ ...base, DASHBOARD_WEBHOOK_JOBS_URL: 'http://public.example/jobs' }), /HTTPS/);
  assert.throws(() => configFromEnvironment({ ...base, DASHBOARD_WEBHOOK_JOBS_URL: 'https://name:password@example.com/jobs' }), /HTTPS/);
  assert.equal(configFromEnvironment({ ...base, DASHBOARD_WEBHOOK_JOBS_URL: 'http://127.0.0.1:3000/jobs' }).jobsUrl,
    'http://127.0.0.1:3000/jobs');
});

test('child diagnostics expose only the allowlisted authentication failure code', () => {
  assert.equal(childErrorCode('ordinary output\n{"code":"AUTH_REQUIRED","error":"private text"}\n'), 'AUTH_REQUIRED');
  assert.equal(childErrorCode('{"errorCode":"AUTH_REQUIRED"}'), 'AUTH_REQUIRED');
  for (const output of [undefined, 'AUTH_REQUIRED', '{"error":"AUTH_REQUIRED"}', '{"code":"customer-secret"}', 'x'.repeat(300000)]) {
    assert.equal(childErrorCode(output), 'CRM_REFRESH_FAILED');
  }
});

test('health file is atomic, contains only status metadata and keeps auth failure until success', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'amis-worker-health-'));
  let now = Date.parse('2026-11-27T12:00:00Z');
  const path = join(directory, 'health.json');
  const health = createHealthReporter(path, { now: () => now, intervalMs: 5 });
  try {
    await health.start();
    await health.update('auth_required', { errorCode: 'AUTH_REQUIRED' });
    now += 10000;
    await new Promise(resolve => setTimeout(resolve, 25));
    let result = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(result, { status: 'auth_required', heartbeatAt: '2026-11-27T12:00:10.000Z', lastSuccessAt: null,
      lastErrorCode: 'AUTH_REQUIRED' });
    await health.update('syncing');
    await health.update('idle', { success: true });
    await health.close();
    result = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(result.lastErrorCode, null);
    assert.equal(result.lastSuccessAt, '2026-11-27T12:00:10.000Z');
    assert.deepEqual(await readdir(directory), ['health.json']);
  } finally {
    await health.close();
    await unlink(path).catch(() => {});
    await rmdir(directory);
  }
});

function cycleFixture(overrides = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      claim: async () => { calls.push('claim'); return null; },
      sync: async (kind, month) => { calls.push([kind, month]); },
      acknowledge: async action => { calls.push(action); return true; },
      health: { update: async (status, details) => { calls.push(['health', status, details]); } },
      now: () => Date.parse('2026-11-27T12:00:00Z'),
      ...overrides,
    },
  };
}

test('periodic fallback starts on startup, runs sequentially and waits for its configured interval', async () => {
  const { calls, dependencies } = cycleFixture();
  const state = { nextRefreshAt: 0, lastErrorCode: null };
  const config = { refreshSeconds: 300 };
  assert.deepEqual(await runWorkerCycle(config, state, dependencies), { outcome: 'periodic', month: '2026-11' });
  assert.deepEqual(calls.filter(call => call[0] !== 'health'), ['claim', ['staff', '2026-11'], ['customers', '2026-11']]);
  assert.equal(state.nextRefreshAt, dependencies.now() + 300000);
  calls.length = 0;
  assert.deepEqual(await runWorkerCycle(config, state, dependencies), { outcome: 'idle' });
  assert.deepEqual(calls.filter(call => call[0] !== 'health'), ['claim']);
});

test('webhook claim takes precedence and a completed current-month job postpones fallback refresh', async () => {
  const { calls, dependencies } = cycleFixture({ claim: async () => job });
  const state = { nextRefreshAt: 0, lastErrorCode: 'AUTH_REQUIRED' };
  assert.equal((await runWorkerCycle({ refreshSeconds: 300 }, state, dependencies)).outcome, 'complete');
  assert.deepEqual(calls.filter(call => call[0] !== 'health'), [['staff', '2026-11'], ['customers', '2026-11'], 'complete']);
  assert.equal(state.nextRefreshAt, dependencies.now() + 300000);
  assert.equal(state.lastErrorCode, null);
});

test('a claimed job finishes after shutdown is requested, but shutdown starts no periodic work', async () => {
  const { calls, dependencies } = cycleFixture({ claim: async () => job, shouldStop: () => true });
  const state = { nextRefreshAt: 0, lastErrorCode: null };
  assert.equal((await runWorkerCycle({ refreshSeconds: 300 }, state, dependencies)).outcome, 'complete');
  assert.ok(calls.includes('complete'));
  calls.length = 0;
  assert.equal((await runWorkerCycle({ refreshSeconds: 300 }, { ...state, nextRefreshAt: 0 }, {
    ...dependencies, claim: async () => null,
  })).outcome, 'idle');
  assert.equal(calls.some(call => call[0] === 'staff'), false);
});

test('expired login reports auth_required, retries the job and stays visible while idle', async () => {
  const { calls, dependencies } = cycleFixture({
    claim: async () => job,
    sync: async () => { throw new WorkerError('Login required.', 'AUTH_REQUIRED'); },
  });
  const state = { nextRefreshAt: 0, lastErrorCode: null };
  assert.equal((await runWorkerCycle({ refreshSeconds: 300 }, state, dependencies)).outcome, 'retry');
  assert.ok(calls.includes('fail'));
  assert.equal(state.lastErrorCode, 'AUTH_REQUIRED');
  calls.length = 0;
  await runWorkerCycle({ refreshSeconds: 300 }, state, { ...dependencies, claim: async () => null });
  assert.deepEqual(calls, [['health', 'auth_required', undefined]]);
});

test('periodic errors propagate and postpone the next attempt without claiming success', async () => {
  const { calls, dependencies } = cycleFixture({
    sync: async () => { throw new WorkerError('Login required.', 'AUTH_REQUIRED'); },
  });
  const state = { nextRefreshAt: 0, lastErrorCode: null };
  await assert.rejects(runWorkerCycle({ refreshSeconds: 300 }, state, dependencies), { code: 'AUTH_REQUIRED' });
  assert.equal(state.nextRefreshAt, dependencies.now() + 300000);
  assert.equal(calls.some(call => call[0] === 'health' && call[2]?.success), false);
});

test('successful queue reconnection clears queue errors without inventing a snapshot success', async () => {
  const { calls, dependencies } = cycleFixture();
  const state = { nextRefreshAt: 0, lastErrorCode: 'QUEUE_UNREACHABLE' };
  await runWorkerCycle({ refreshSeconds: 0 }, state, dependencies);
  assert.equal(state.lastErrorCode, null);
  assert.deepEqual(calls, ['claim', ['health', 'idle', { errorCode: null }], ['health', 'idle', undefined]]);
});

test('queue reconnection restores unresolved CRM authentication status', async () => {
  const { calls, dependencies } = cycleFixture();
  const state = { nextRefreshAt: 0, lastErrorCode: 'QUEUE_UNREACHABLE', lastCrmErrorCode: 'AUTH_REQUIRED' };
  await runWorkerCycle({ refreshSeconds: 0 }, state, dependencies);
  assert.equal(state.lastErrorCode, 'AUTH_REQUIRED');
  assert.deepEqual(calls, ['claim', ['health', 'auth_required', { errorCode: 'AUTH_REQUIRED' }], ['health', 'auth_required', undefined]]);
});

test('current-month refresh uses Vietnam midnight rather than the host timezone', () => {
  assert.equal(vietnamMonth(Date.parse('2026-11-30T16:59:59Z')), '2026-11');
  assert.equal(vietnamMonth(Date.parse('2026-11-30T17:00:00Z')), '2026-12');
});
