export const STAFF_SOURCE = 'AMIS CRM · Nhân viên xuất sắc';

export interface StaffRow {
  id: string;
  name: string;
  organizationUnit: string;
  revenue: number;
}

export interface StaffSnapshot {
  month: string;
  generatedAt: string;
  source: typeof STAFF_SOURCE;
  parameters: {
    organizationUnitId: number;
    organizationUnitName: string;
    misaCode: string;
    fromDate: string;
    toDate: string;
    displayCount: number;
  };
  rows: StaffRow[];
}

export interface StaffResult {
  snapshot: StaffSnapshot | null;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isStaffMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const date = new Date(value);
  // Date.parse alone accepts invalid dates such as February 30.
  const day = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

function isStaffRow(value: unknown): value is StaffRow {
  return isRecord(value) && isText(value.id) && isText(value.name)
    && isText(value.organizationUnit) && isAmount(value.revenue);
}

export function isStaffSnapshot(value: unknown): value is StaffSnapshot {
  if (!isRecord(value) || !isStaffMonth(value.month) || !isIsoTimestamp(value.generatedAt)
    || value.source !== STAFF_SOURCE || !isRecord(value.parameters) || !Array.isArray(value.rows)) return false;
  const parameters = value.parameters;
  if (typeof parameters.organizationUnitId !== 'number' || !Number.isInteger(parameters.organizationUnitId)
    || parameters.organizationUnitId < 0 || !isText(parameters.organizationUnitName) || !isText(parameters.misaCode)
    || !isIsoTimestamp(parameters.fromDate) || !isIsoTimestamp(parameters.toDate)
    || typeof parameters.displayCount !== 'number' || !Number.isInteger(parameters.displayCount)
    || parameters.displayCount < 1 || value.rows.length > parameters.displayCount) return false;

  // CRM month filters use Vietnam time, so November begins October 31 at 17:00 UTC.
  const start = new Date(`${value.month}-01T00:00:00.000+07:00`);
  const nextMonth = new Date(`${value.month}-01T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end = nextMonth.getTime() - 7 * 60 * 60 * 1000 - 1;
  return Date.parse(parameters.fromDate) === start.getTime() && Date.parse(parameters.toDate) === end
    && value.rows.every(isStaffRow) && new Set(value.rows.map(row => row.id)).size === value.rows.length;
}

/** Read the ExcellentStaff API response without recalculating or sorting its ranking. */
export function parseStaffRows(raw: unknown): StaffRow[] {
  let data: unknown = raw;
  if (isRecord(data)) {
    if (data.Success === false || data.success === false) throw new Error('AMIS CRM không trả về danh sách nhân viên.');
    data = data.Data;
  }
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch { throw new Error('Dữ liệu nhân viên AMIS CRM không hợp lệ.'); }
  }
  if (!Array.isArray(data)) throw new Error('Không có danh sách nhân viên từ AMIS CRM.');

  const rows = data.map((item): StaffRow => {
    if (!isRecord(item)) throw new Error('Dòng nhân viên AMIS CRM không hợp lệ.');
    const id = isText(item.EmployeeID) ? item.EmployeeID
      : typeof item.ID === 'number' && Number.isInteger(item.ID) ? String(item.ID)
        : isText(item.ID) ? item.ID : null;
    const row = { id, name: item.FullName, organizationUnit: item.OrganizationUnitIDText, revenue: item.Revenue };
    if (!isStaffRow(row)) throw new Error('Dòng nhân viên AMIS CRM thiếu tên, đơn vị hoặc doanh số hợp lệ.');
    return row;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Danh sách nhân viên AMIS CRM bị trùng mã.');
  return rows;
}
