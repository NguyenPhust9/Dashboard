import assert from 'node:assert/strict';
import test from 'node:test';
import { createRankingRefresh } from '../lib/ranking-realtime.ts';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('coalesces a burst during an in-flight read into one trailing read without overlap', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const reads = [];
  const refresh = createRankingRefresh(async signal => {
    const pending = deferred();
    reads.push({ signal, ...pending });
    await pending.promise;
  });
  t.after(() => refresh.stop());
  refresh.refresh();
  refresh.refresh();
  refresh.refresh();
  assert.equal(reads.length, 1);
  reads[0].resolve();
  await settle();
  assert.equal(reads.length, 2);
  reads[1].resolve();
  await settle();
  assert.equal(reads.length, 2);
  t.mock.timers.tick(59_999);
  assert.equal(reads.length, 2);
  t.mock.timers.tick(1);
  assert.equal(reads.length, 3);
  reads[2].resolve();
});

test('changing month/unmount aborts the old read and discards its pending events and timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred();
  let calls = 0;
  let signal;
  const refresh = createRankingRefresh(async nextSignal => {
    calls += 1;
    signal = nextSignal;
    await pending.promise;
  });
  refresh.refresh();
  refresh.refresh();
  refresh.stop();
  assert.equal(signal.aborted, true);
  pending.resolve();
  await settle();
  t.mock.timers.tick(180_000);
  refresh.refresh();
  assert.equal(calls, 1);
});

test('aborts a slow network read after 45 seconds and retains the periodic fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const signals = [];
  const refresh = createRankingRefresh(async signal => {
    calls += 1;
    signals.push(signal);
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  });
  t.after(() => refresh.stop());
  refresh.refresh();
  t.mock.timers.tick(44_999);
  assert.equal(signals[0].aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signals[0].aborted, true);
  await settle();
  t.mock.timers.tick(60_000);
  assert.equal(calls, 2);
});

test('an immediate update replaces the old polling deadline instead of creating a second loop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const refresh = createRankingRefresh(async () => { calls += 1; });
  t.after(() => refresh.stop());
  refresh.refresh();
  await settle();
  t.mock.timers.tick(30_000);
  refresh.refresh();
  await settle();
  t.mock.timers.tick(30_000);
  assert.equal(calls, 2);
  t.mock.timers.tick(30_000);
  assert.equal(calls, 3);
});
