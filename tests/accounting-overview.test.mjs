import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountingOverview, latestAccountingOverview, parseReceivableWidget, receivableKpi, isRecentWidgetTime } from '../lib/accounting-overview.ts';

const widget = (total, overdue, current) => `Nợ phải thu theo hạn nợ
Tổng ${total} Triệu đồng
Quá hạn ${overdue} Triệu đồng
Trong Hạn ${current} Triệu đồng`;
const snapshot = (generatedAt, total = 6_041_000_000) => ({
  generatedAt, receivable: { total, overdue: total, current: 0 },
});

test('reads the receivable Total with Vietnamese thousands separators and million units', () => {
  assert.deepEqual(parseReceivableWidget(widget('6.041', '4.018', '2.023')), {
    total: 6_041_000_000, overdue: 4_018_000_000, current: 2_023_000_000,
  });
});

test('reads a changed total automatically, including decimal millions and zero', () => {
  assert.equal(parseReceivableWidget(widget('23,5', '20', '3,5')).total, 23_500_000);
  assert.equal(parseReceivableWidget(widget('0', '0', '0')).total, 0);
});

test('does not read the financial position or the adjacent payable Total', () => {
  const text = `Tình hình tài chính Phải thu (1.234) ${widget('8.000', '7.000', '1.000')}
    Nợ phải trả theo hạn nợ Tổng 99.999 Triệu đồng Quá hạn 99.999 Triệu đồng Trong Hạn 0 Triệu đồng`;
  assert.equal(parseReceivableWidget(text).total, 8_000_000_000);
  assert.throws(() => parseReceivableWidget('Nợ phải trả theo hạn nợ Tổng 99 Triệu đồng'));
});

test('rejects an incomplete widget or missing units instead of publishing partial numbers', () => {
  assert.throws(() => parseReceivableWidget('Nợ phải thu theo hạn nợ Tổng 6.041'));
  assert.throws(() => parseReceivableWidget(widget('6.041', '1', '1')));
  // The AMIS widget rounds each amount independently.
  assert.equal(parseReceivableWidget(widget('10', '6', '5')).total, 10_000_000);
});

test('picks the newest valid snapshot, irrespective of whether it came from disk or Supabase', () => {
  const old = snapshot('2026-11-12T09:44:20Z');
  const recent = snapshot('2026-11-27T04:00:00Z', 7_000_000_000);
  assert.equal(latestAccountingOverview([old, recent]), recent);
  assert.equal(latestAccountingOverview([recent, old]), recent);
  assert.equal(latestAccountingOverview([null, { receivable: { total: 123 } }]), null);
});

test('null, strings, missing amounts and invalid timestamps are not valid financial data', () => {
  for (const invalid of [null, '6041', NaN, Infinity]) {
    assert.equal(isAccountingOverview({ ...snapshot('2026-11-27T04:00:00Z'), receivable: { total: invalid, overdue: 0, current: 0 } }), false);
  }
  assert.equal(isAccountingOverview(snapshot('not-a-date')), false);
});

test('the card uses the overview Total, handles zero, and identifies a cached value after a failed sync', () => {
  const data = snapshot('2026-11-27T04:00:00Z', 0);
  assert.equal(receivableKpi({ snapshot: data })[1], '0 ₫');
  assert.equal(receivableKpi({ snapshot: data })[2], '0 ₫ quá hạn');
  assert.equal(receivableKpi({ snapshot: data })[3], '0 ₫ trong hạn');
  assert.match(receivableKpi({ snapshot: data, error: 'Session expired' })[4], /^Bản lưu gần nhất · Đọc lúc /);
  assert.equal(receivableKpi({ snapshot: null, error: 'Session expired' })[1], '—');
  assert.equal(receivableKpi(null)[1], '—');
});

test('keeps overdue and current amounts visible below the total, with sync metadata separate', () => {
  const data = { generatedAt: '2026-11-27T04:00:00Z', receivable: { total: 6_041_000_000, overdue: 4_018_000_000, current: 2_023_000_000 } };
  const kpi = receivableKpi({ snapshot: data });
  assert.equal(kpi[1], '6.041.000.000 ₫');
  assert.equal(kpi[2], '4,02 tỷ quá hạn');
  assert.equal(kpi[3], '2,02 tỷ trong hạn');
  assert.match(kpi[4], /^AMIS Kế toán · Đọc lúc /);
  assert.deepEqual(receivableKpi({ snapshot: data, error: 'Session expired' }).slice(1, 4), kpi.slice(1, 4));
});

test('does not stamp an old AMIS widget as freshly updated when refresh has not completed', () => {
  const now = new Date('2026-11-27T04:12:00Z');
  assert.equal(isRecentWidgetTime('10:17', now), false);
  assert.equal(isRecentWidgetTime('11:12', now), true);
  assert.equal(isRecentWidgetTime('11:11', now), true);
  assert.equal(isRecentWidgetTime('11:13', now), false);
  assert.equal(isRecentWidgetTime('23:59', new Date('2026-11-26T17:00:00Z')), true);
});
