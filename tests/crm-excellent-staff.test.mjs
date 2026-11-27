import assert from 'node:assert/strict';
import test from 'node:test';
import { STAFF_SOURCE, isStaffMonth, isStaffSnapshot, parseStaffRows } from '../lib/crm-excellent-staff.ts';

const employee = (id, revenue) => ({ EmployeeID: id, FullName: `Nhân viên ${id}`, OrganizationUnitIDText: 'Miền Tây 2', Revenue: revenue });
const snapshot = (rows = parseStaffRows([employee('a', 123456789)])) => ({
  month: '2026-11', generatedAt: '2026-11-27T06:43:11.530Z', source: STAFF_SOURCE,
  parameters: {
    organizationUnitId: 4, organizationUnitName: 'VẠN THỊNH', misaCode: '0001/0013',
    fromDate: '2026-10-31T17:00:00.000Z', toDate: '2026-11-30T16:59:59.999Z', displayCount: 10,
  }, rows,
});

test('copies exact amounts, names and organization, preserving the CRM ranking', () => {
  const input = [employee('b', 0), employee('a', 123456789.5), employee('c', -100)];
  const result = parseStaffRows(input);
  assert.deepEqual(result.map(row => row.id), ['b', 'a', 'c']);
  assert.deepEqual(result.map(row => row.revenue), [0, 123456789.5, -100]);
  assert.equal(result[0].name, input[0].FullName);
  assert.equal(result[0].organizationUnit, input[0].OrganizationUnitIDText);
});

test('accepts the API Data JSON wrapper, a decoded array and an actual empty list', () => {
  const input = [employee('a', 123456789)];
  assert.deepEqual(parseStaffRows({ Success: true, Data: JSON.stringify(input) }), parseStaffRows(input));
  assert.deepEqual(parseStaffRows({ Data: input }), parseStaffRows(input));
  assert.deepEqual(parseStaffRows({ Data: '[]' }), []);
  assert.equal(isStaffSnapshot(snapshot([])), true);
});

test('rejects missing, failed or malformed API payloads rather than inventing zero revenue', () => {
  for (const invalid of [null, {}, { Data: null }, { Data: '{' }, { Success: false, Data: '[]' }, { Data: '{}' }]) {
    assert.throws(() => parseStaffRows(invalid));
  }
  for (const revenue of [undefined, null, '123', NaN, Infinity]) {
    assert.throws(() => parseStaffRows([employee('a', 1), employee('b', revenue)]));
  }
  assert.throws(() => parseStaffRows([{ ...employee('a', 1), FullName: '' }]));
  assert.throws(() => parseStaffRows([{ ...employee('a', 1), OrganizationUnitIDText: null }]));
  assert.throws(() => parseStaffRows([employee('a', 1), employee('a', 2)]));
});

test('validates the selected month against the full CRM Vietnam-time range', () => {
  const data = snapshot();
  assert.equal(isStaffSnapshot(data), true);
  assert.equal(isStaffSnapshot({ ...data, month: '2026-10' }), false);
  assert.equal(isStaffSnapshot({ ...data, parameters: { ...data.parameters, fromDate: '2026-11-01T00:00:00.000Z' } }), false);
  assert.equal(isStaffSnapshot({ ...data, parameters: { ...data.parameters, toDate: '2026-11-29T16:59:59.999Z' } }), false);
  for (const month of ['', '2026-1', '2026-13', '0000-01', 'invalid']) assert.equal(isStaffMonth(month), false);
});

test('handles December rollover and leap-year February correctly', () => {
  for (const [month, fromDate, toDate] of [
    ['2026-12', '2026-11-30T17:00:00.000Z', '2026-12-31T16:59:59.999Z'],
    ['2028-02', '2028-01-31T17:00:00.000Z', '2028-02-29T16:59:59.999Z'],
  ]) {
    const data = snapshot();
    assert.equal(isStaffSnapshot({ ...data, month, parameters: { ...data.parameters, fromDate, toDate } }), true);
  }
});

test('rejects invalid dates, missing snapshot metadata, duplicate staff and non-numeric money', () => {
  const data = snapshot();
  for (const generatedAt of ['not-a-date', '2026-02-30T12:00:00.000Z', '2026-11-27']) {
    assert.equal(isStaffSnapshot({ ...data, generatedAt }), false);
  }
  assert.equal(isStaffSnapshot({ ...data, source: 'mock' }), false);
  assert.equal(isStaffSnapshot({ ...data, parameters: {} }), false);
  assert.equal(isStaffSnapshot({ ...data, parameters: { ...data.parameters, displayCount: 0 } }), false);
  assert.equal(isStaffSnapshot({ ...data, rows: [data.rows[0], data.rows[0]] }), false);
  assert.equal(isStaffSnapshot({ ...data, rows: [{ ...data.rows[0], revenue: '123' }] }), false);
  assert.equal(isStaffSnapshot({ ...data, rows: [{ ...data.rows[0], organizationUnit: '' }] }), false);
});
