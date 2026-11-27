import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizedWebhook, matchesSecret, parseWebhookJobAction, readWebhookJson,
  vietnamMonth, webhookDigest, webhookMonths,
} from '../lib/amis-webhook.ts';

const now = new Date('2026-11-27T12:00:00.000Z');
const leaseToken = '94c46a70-75c3-4b4e-9075-a24214383c67';

test('receiver requires a dedicated Bearer token and rejects missing/malformed credentials', () => {
  const secret = 'a-secret-only-for-the-webhook';
  assert.equal(authorizedWebhook(`Bearer ${secret}`, secret), true);
  assert.equal(authorizedWebhook(`bearer ${secret}`, secret), true);
  for (const header of [null, '', secret, `Basic ${secret}`, `Bearer ${secret} extra`, 'Bearer wrong', 'Bearer ']) {
    assert.equal(authorizedWebhook(header, secret), false);
  }
  assert.equal(authorizedWebhook('Bearer something', ''), false);
  assert.equal(matchesSecret('', ''), false);
  assert.equal(matchesSecret(null, secret), false);
});

test('reads JSON objects/batches but rejects malformed JSON and scalar input', async () => {
  for (const body of ['{"Data":[]}', '[{"ObjectType":1}]']) {
    assert.deepEqual(await readWebhookJson(new Request('https://example.test', { method: 'POST', body })), JSON.parse(body));
  }
  for (const body of ['', '{broken', 'null', 'true', '123', '"message"']) {
    await assert.rejects(readWebhookJson(new Request('https://example.test', { method: 'POST', body })), error => error.status === 400);
  }
});

test('enforces byte limits with and without Content-Length, including multibyte UTF-8', async () => {
  await assert.rejects(readWebhookJson(new Request('https://example.test', {
    method: 'POST', body: '{}', headers: { 'content-length': '9999' },
  }), 100), error => error.status === 413);
  await assert.rejects(readWebhookJson(new Request('https://example.test', {
    method: 'POST', body: JSON.stringify({ name: 'đ'.repeat(100) }),
  }), 150), error => error.status === 413);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(101)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readWebhookJson(new Request('https://example.test', {
    method: 'POST', body: stream, duplex: 'half',
  }), 100), error => error.status === 413);
  assert.equal(cancelled, true);
});

test('duplicate JSON produces the same fingerprint despite object key order', () => {
  const first = { id: 'test', data: { amount: 1, state: 'updated' } };
  const duplicate = { data: { state: 'updated', amount: 1 }, id: 'test' };
  assert.equal(webhookDigest(first), webhookDigest(duplicate));
  assert.notEqual(webhookDigest(first), webhookDigest({ ...first, id: 'another' }));
  assert.notEqual(webhookDigest([1, 2]), webhookDigest([2, 1]));
  assert.match(webhookDigest(first), /^[0-9a-f]{64}$/);
  let nested = {};
  for (let i = 0; i < 40; i++) nested = { nested };
  assert.throws(() => webhookDigest(nested), error => error.status === 400);
});

test('uses Vietnam month boundaries and cannot be redirected by unknown or future event dates', () => {
  assert.equal(vietnamMonth(new Date('2026-10-31T16:59:59.999Z')), '2026-10');
  assert.equal(vietnamMonth(new Date('2026-10-31T17:00:00.000Z')), '2026-11');
  for (const payload of [{}, { Date: '2099-01-01', month: '2099-01' }, { Date: '2025-01-01' }, [{ month: 'bad' }]]) {
    assert.deepEqual(webhookMonths(payload, now), ['2026-11']);
  }
});

test('worker actions require exact lease metadata and reject future/invalid months', () => {
  assert.deepEqual(parseWebhookJobAction({ action: 'claim' }, now), { action: 'claim' });
  const ack = { action: 'complete', month: '2026-11', leaseToken, revision: 2 };
  assert.deepEqual(parseWebhookJobAction(ack, now), ack);
  for (const invalid of [
    {}, null, { action: 'drop' }, { ...ack, month: '2026-12' }, { ...ack, month: '2026-13' },
    { ...ack, month: '0000-01' }, { ...ack, revision: 0 }, { ...ack, revision: 1.2 },
    { ...ack, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...ack, leaseToken: 'bad' },
  ]) assert.throws(() => parseWebhookJobAction(invalid, now), error => error.status === 400);
});
