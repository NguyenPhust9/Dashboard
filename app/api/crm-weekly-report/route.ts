import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';


function envValue(raw: string, key: string) {
  return raw.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() || '';
}

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function reportParameters(monthValue: string, byEmployee: boolean) {
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // AMIS closes tuần đầu vào Chủ nhật. Khi mùng 1 đã là Chủ nhật,
  // báo cáo AMIS nhóm 01–08 vào Tuần 1 (không tách riêng ngày 01).
  const firstWeekEnd = firstDayOfWeek === 0 ? 8 : 8 - firstDayOfWeek;
  const ranges: Array<[number, number]> = [[1, firstWeekEnd]];
  for (let start = firstWeekEnd + 1; start <= lastDay; start += 7) ranges.push([start, Math.min(start + 6, lastDay)]);
  while (ranges.length < 5) ranges.push([lastDay, lastDay]);
  const data: Record<string, unknown> = {
    Year: year, Month: String(month), ReportTypeID: 5, ReportTypeIDText: 'Doanh số đề nghị ghi',
    StatisticalsBy: '1,3', StatisticalsByText: 'Đơn hàng,Trả lại hàng bán', Period: 13,
    FromDate: isoDate(year, month, 1), ToDate: new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999)).toISOString(),
    AnalysisType: 2, AnalysisTypeText: 'Cơ cấu tổ chức', OrganizationUnitID: 4, OrganizationUnitIDText: 'VẠN THỊNH',
    MISACode: '0001/0013', ID: 26, IsFilterDraffSaleOrder: false, IsLastOrganization: 0, ReportDynamicID: 0,
    Config: { GroupColumn: [], Filter: [], Formula: '', FormulaContent: '' }, ProductStatisticsID: '1',
    ProductStatisticsIDText: 'Hàng hóa', WeekText: '', HasPermission: true, Weeks: null, GroupID: null,
    MonthText: `Tháng ${month}`, IsDisplay: true, IsViewEmployee: byEmployee,
  };
  ranges.slice(0, 5).forEach(([from, to], index) => {
    data[`FromDateWeek${index + 1}`] = isoDate(year, month, from);
    data[`ToDateWeek${index + 1}`] = isoDate(year, month, to);
  });
  return data;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || '2026-10';
  const byEmployee = request.nextUrl.searchParams.get('byEmployee') === 'true';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  try {
    const sourceEnvPath = process.env.BIKEFORCE_AMIS_ENV_FILE;
    if (!sourceEnvPath) throw new Error('Chưa cấu hình BIKEFORCE_AMIS_ENV_FILE.');
    const env = await readFile(sourceEnvPath, 'utf8');
    const token = envValue(env, 'AMIS_BEARER_TOKEN');
    const cookie = envValue(env, 'AMIS_COOKIE');
    const companyCode = envValue(env, 'AMIS_COMPANY_CODE');
    const parameters = reportParameters(month, byEmployee);
    const response = await fetch('https://amisapp.misa.vn/crm/g1/api/report/report/Grid', {
      method: 'POST', cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*', Authorization: `Bearer ${token}`, Cookie: cookie, 'Content-Type': 'application/json', companycode: companyCode, layoutcode: 'Report', 'X-MISA-Language': 'vi-VN', Origin: 'https://amisapp.misa.vn', Referer: 'https://amisapp.misa.vn/crm/report/view/26/0' },
      body: JSON.stringify({ ID: 26, IsGetCache: false, Data: parameters }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.Success) throw new Error(`AMIS report 26 HTTP ${response.status}`);
    const names = ['First', 'Second', 'Third', 'Forth', 'Fifth'];
    const weeklyReport = { monthLabel: `Tháng ${Number(month.slice(5))}`, year: Number(month.slice(0, 4)), total: Number(payload.SummaryData.DoneOfMonth || 0), totalFormatted: `${Number(payload.SummaryData.DoneOfMonth || 0).toLocaleString('vi-VN')} ₫` };
    return NextResponse.json({ weeklyReport, salesByWeek: names.map((name: string, index) => ({ label: `Tuần ${index + 1}`, value: Number(payload.SummaryData[`DoneOf${name}Week`] || 0) })), rows: payload.Data, byEmployee });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể lấy báo cáo AMIS.' }, { status: 502 });
  }
}
