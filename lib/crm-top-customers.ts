export const CUSTOMER_SOURCE = 'AMIS CRM · KH có doanh số cao nhất';

export interface CustomerRow {
  id: string;
  name: string;
  code: string;
  revenue: number;
}

export interface CustomerSnapshot {
  month: string;
  generatedAt: string;
  source: typeof CUSTOMER_SOURCE;
  parameters: {
    organizationUnitId: number;
    organizationUnitName: string;
    misaCode: string;
    fromDate: string;
    toDate: string;
    displayCount: number;
  };
  rows: CustomerRow[];
}

export interface CustomerResult {
  snapshot: CustomerSnapshot | null;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isCustomerMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const date = new Date(value);
  // Date.parse alone normalizes impossible calendar dates, such as February 30.
  const day = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

function isCustomerRow(value: unknown): value is CustomerRow {
  return isRecord(value) && isText(value.id) && isText(value.name)
    && isText(value.code) && isAmount(value.revenue);
}

export function isCustomerSnapshot(value: unknown): value is CustomerSnapshot {
  if (!isRecord(value) || !isCustomerMonth(value.month) || !isIsoTimestamp(value.generatedAt)
    || value.source !== CUSTOMER_SOURCE || !isRecord(value.parameters) || !Array.isArray(value.rows)) return false;
  const parameters = value.parameters;
  if (typeof parameters.organizationUnitId !== 'number' || !Number.isInteger(parameters.organizationUnitId)
    || parameters.organizationUnitId < 0 || !isText(parameters.organizationUnitName) || !isText(parameters.misaCode)
    || !isIsoTimestamp(parameters.fromDate) || !isIsoTimestamp(parameters.toDate)
    || typeof parameters.displayCount !== 'number' || !Number.isInteger(parameters.displayCount)
    || parameters.displayCount < 1 || value.rows.length > parameters.displayCount) return false;

  // AMIS month filters cover the full calendar month in Vietnam (UTC+7).
  const start = new Date(`${value.month}-01T00:00:00.000+07:00`);
  const nextMonth = new Date(`${value.month}-01T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end = nextMonth.getTime() - 7 * 60 * 60 * 1000 - 1;
  return Date.parse(parameters.fromDate) === start.getTime() && Date.parse(parameters.toDate) === end
    && value.rows.every(isCustomerRow) && new Set(value.rows.map(row => row.id)).size === value.rows.length;
}

/** Copy the AccountWithTheHighestSale response in the exact ranking returned by CRM. */
export function parseCustomerRows(raw: unknown): CustomerRow[] {
  let data: unknown = raw;
  if (isRecord(data)) {
    if (data.Success === false || data.success === false || data.IsPermission === false || data.IsNotPermission === true) {
      throw new Error('AMIS CRM không trả về danh sách khách hàng có doanh số cao nhất.');
    }
    data = data.Data;
  }
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch { throw new Error('Dữ liệu khách hàng AMIS CRM không hợp lệ.'); }
  }
  if (!Array.isArray(data)) throw new Error('Không có danh sách khách hàng từ AMIS CRM.');

  const rows = data.map((item): CustomerRow => {
    if (!isRecord(item) || typeof item.AccountID !== 'number' || !Number.isSafeInteger(item.AccountID) || item.AccountID < 1) {
      throw new Error('Dòng khách hàng AMIS CRM thiếu mã định danh hợp lệ.');
    }
    const row = { id: String(item.AccountID), name: item.AccountName, code: item.AccountNumber, revenue: item.Revenue };
    if (!isCustomerRow(row)) throw new Error('Dòng khách hàng AMIS CRM thiếu tên, mã khách hàng hoặc doanh số hợp lệ.');
    return row;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Danh sách khách hàng AMIS CRM bị trùng định danh.');
  return rows;
}
