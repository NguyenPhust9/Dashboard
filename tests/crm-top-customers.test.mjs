import assert from 'node:assert/strict';
import test from 'node:test';
import { CUSTOMER_SOURCE, isCustomerMonth, isCustomerSnapshot, parseCustomerRows } from '../lib/crm-top-customers.ts';

const customer = (id, revenue) => ({ id, name: `Khách hàng ${id}`, code: `KH${id}`, revenue });
const apiCustomer = (id, revenue) => ({ AccountID: id, AccountName: `Khách hàng ${id}`, AccountNumber: `KH${id}`, Revenue: revenue });
const snapshot = (rows = [customer('a', 123456789)]) => ({
  month: '2026-11', generatedAt: '2026-11-27T06:43:11.530Z', source: CUSTOMER_SOURCE,
  parameters: {
    organizationUnitId: 1, organizationUnitName: 'THỐNG ĐẠT GROUP', misaCode: '0001',
    fromDate: '2026-10-31T17:00:00.000Z', toDate: '2026-11-30T16:59:59.999Z', displayCount: 10,
  }, rows,
});

test('copies verified CRM fields and exact revenue without changing the returned ranking', () => {
  const input = [apiCustomer(31, 0), apiCustomer(12, 123456789.5), apiCustomer(9, -100)];
  const rows = parseCustomerRows(input);
  assert.deepEqual(rows, [customer('31', 0), customer('12', 123456789.5), customer('9', -100)]);
});

test('accepts API Data arrays, serialized Data and a real empty list', () => {
  const input = [apiCustomer(31, 123456789)];
  assert.deepEqual(parseCustomerRows({ Success: true, IsPermission: true, IsNotPermission: false, Data: input }), parseCustomerRows(input));
  assert.deepEqual(parseCustomerRows({ Data: JSON.stringify(input) }), parseCustomerRows(input));
  assert.deepEqual(parseCustomerRows({ Data: [] }), []);
  assert.deepEqual(parseCustomerRows({ Data: '[]' }), []);
});

test('rejects failed, denied, missing and malformed API payloads', () => {
  for (const invalid of [null, {}, { Data: null }, { Data: '{' }, { Data: '{}' },
    { Success: false, Data: [] }, { success: false, Data: [] },
    { IsPermission: false, Data: [] }, { IsNotPermission: true, Data: [] }]) {
    assert.throws(() => parseCustomerRows(invalid));
  }
  for (const revenue of [undefined, null, '123', NaN, Infinity]) {
    assert.throws(() => parseCustomerRows([apiCustomer(31, 1), apiCustomer(12, revenue)]));
  }
  for (const AccountID of [null, undefined, '31', 1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseCustomerRows([{ ...apiCustomer(31, 1), AccountID }]));
  }
  assert.throws(() => parseCustomerRows([{ ...apiCustomer(31, 1), AccountName: '' }]));
  assert.throws(() => parseCustomerRows([{ ...apiCustomer(31, 1), AccountNumber: null }]));
  assert.throws(() => parseCustomerRows([apiCustomer(31, 1), apiCustomer(31, 2)]));
});

test('accepts exact finite revenue, including zero, and an actual empty ranking', () => {
  for (const revenue of [0, 123456789.5, -100]) {
    assert.equal(isCustomerSnapshot(snapshot([customer('a', revenue)])), true);
  }
  assert.equal(isCustomerSnapshot(snapshot([])), true);
});

test('validates the selected month against the full CRM Vietnam-time range', () => {
  const data = snapshot();
  assert.equal(isCustomerSnapshot(data), true);
  assert.equal(isCustomerSnapshot({ ...data, month: '2026-10' }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, fromDate: '2026-11-01T00:00:00.000Z' } }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, toDate: '2026-11-29T16:59:59.999Z' } }), false);
  for (const month of ['', '2026-1', '2026-13', '0000-01', 'invalid', null]) assert.equal(isCustomerMonth(month), false);
});

test('handles December rollover and leap-year February correctly', () => {
  for (const [month, fromDate, toDate] of [
    ['2026-12', '2026-11-30T17:00:00.000Z', '2026-12-31T16:59:59.999Z'],
    ['2028-02', '2028-01-31T17:00:00.000Z', '2028-02-29T16:59:59.999Z'],
  ]) {
    const data = snapshot();
    assert.equal(isCustomerSnapshot({ ...data, month, parameters: { ...data.parameters, fromDate, toDate } }), true);
  }
});

test('rejects invalid dates and incomplete or mismatched snapshot metadata', () => {
  const data = snapshot();
  for (const generatedAt of ['not-a-date', '2026-02-30T12:00:00.000Z', '2026-11-27']) {
    assert.equal(isCustomerSnapshot({ ...data, generatedAt }), false);
  }
  assert.equal(isCustomerSnapshot({ ...data, source: 'mock' }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: {} }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, displayCount: 0 } }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, organizationUnitId: -1 } }), false);
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, misaCode: '' } }), false);
});

test('rejects duplicate customers, missing identity and non-numeric revenue', () => {
  const data = snapshot();
  assert.equal(isCustomerSnapshot({ ...data, rows: [data.rows[0], data.rows[0]] }), false);
  for (const revenue of [undefined, null, '123', NaN, Infinity]) {
    assert.equal(isCustomerSnapshot({ ...data, rows: [{ ...data.rows[0], revenue }] }), false);
  }
  for (const field of ['id', 'name', 'code']) {
    assert.equal(isCustomerSnapshot({ ...data, rows: [{ ...data.rows[0], [field]: '' }] }), false);
  }
  assert.equal(isCustomerSnapshot({ ...data, parameters: { ...data.parameters, displayCount: 1 }, rows: [customer('a', 1), customer('b', 2)] }), false);
});
