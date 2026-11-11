import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { supabaseRestRequest } from '@/lib/supabase';


function envValue(raw: string, key: string) {
  return raw.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() || '';
}

async function getAmisCredentials() {
  // Vercel does not have access to the local BikeForce .env file. Prefer its
  // environment variables there, while retaining the local-file fallback.
  const token = process.env.AMIS_BEARER_TOKEN || '';
  const companyCode = process.env.AMIS_COMPANY_CODE || '';
  const cookie = process.env.AMIS_COOKIE || '';
  if (token && companyCode) return { token, companyCode, cookie };

  const sourceEnvPath = process.env.BIKEFORCE_AMIS_ENV_FILE;
  if (!sourceEnvPath) {
    throw new Error('Thiếu AMIS_BEARER_TOKEN hoặc AMIS_COMPANY_CODE trong Environment Variables.');
  }

  const env = await readFile(sourceEnvPath, 'utf8');
  const fileToken = envValue(env, 'AMIS_BEARER_TOKEN');
  const fileCompanyCode = envValue(env, 'AMIS_COMPANY_CODE');
  if (!fileToken || !fileCompanyCode) {
    throw new Error('File BikeForce thiếu AMIS_BEARER_TOKEN hoặc AMIS_COMPANY_CODE.');
  }
  return {
    token: fileToken,
    companyCode: fileCompanyCode,
    cookie: envValue(env, 'AMIS_COOKIE'),
  };
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

type StoredReport26Payload = {
  month?: string;
  generatedAt?: string;
  parameters?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  rows?: unknown[];
};

function responseFromReport26(payload: StoredReport26Payload, byEmployee: boolean) {
  const summary = payload.summary || {};
  const names = ['First', 'Second', 'Third', 'Forth', 'Fifth'];
  const month = payload.month || '';
  return {
    weeklyReport: {
      monthLabel: `Tháng ${Number(month.slice(5))}`,
      year: Number(month.slice(0, 4)),
      total: Number(summary.DoneOfMonth || 0),
      totalFormatted: `${Number(summary.DoneOfMonth || 0).toLocaleString('vi-VN')} ₫`,
    },
    salesByWeek: names.map((name, index) => ({
      label: `Tuần ${index + 1}`,
      value: Number(summary[`DoneOf${name}Week`] || 0),
    })),
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    byEmployee,
  };
}

async function loadStoredReport26(month: string): Promise<StoredReport26Payload | null> {
  try {
    const rows = await supabaseRestRequest<Array<{ payload?: StoredReport26Payload }>>('amis_report26_snapshots', {
      query: `select=payload&period_month=eq.${month}-01&limit=1`,
    });
    return rows[0]?.payload || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || '2026-10';
  const byEmployee = request.nextUrl.searchParams.get('byEmployee') === 'true';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  try {
    const storedReport = await loadStoredReport26(month);
    if (storedReport) return NextResponse.json(responseFromReport26(storedReport, byEmployee));

    const { token, cookie, companyCode } = await getAmisCredentials();
    const parameters = reportParameters(month, byEmployee);
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', companycode: companyCode, layoutcode: 'Report', 'X-MISA-Language': 'vi-VN', Origin: 'https://amisapp.misa.vn', Referer: 'https://amisapp.misa.vn/crm/report/view/26/0',
    };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch('https://amisapp.misa.vn/crm/g1/api/report/report/Grid', {
      method: 'POST', cache: 'no-store',
      headers,
      body: JSON.stringify({ ID: 26, IsGetCache: false, Data: parameters }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.Success) throw new Error(`AMIS report 26 HTTP ${response.status}`);
    return NextResponse.json(responseFromReport26({
      month,
      generatedAt: new Date().toISOString(),
      parameters,
      summary: payload.SummaryData,
      rows: payload.Data,
    }, byEmployee));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể lấy báo cáo AMIS.' }, { status: 502 });
  }
}
