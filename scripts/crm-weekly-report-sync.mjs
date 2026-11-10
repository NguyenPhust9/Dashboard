import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(here, '..');
const outputPath = resolve(dashboardRoot, 'data', 'crm-weekly-sales-report.json');
const bikeforceEnvPath = process.env.BIKEFORCE_AMIS_ENV ||
  'C:/Users/Acer/Downloads/BikeForce-Bicycle-Sales-Management/BikeForce-Bicycle-Sales-Management/scripts/amis-sync/.env';
const reportUrl = 'https://amisapp.misa.vn/crm/g1/api/report/report/Grid';

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

const reportParameters = {
  Year: 2026, Month: '10', ReportTypeID: 5, ReportTypeIDText: 'Doanh số đề nghị ghi',
  StatisticalsBy: '1,3', StatisticalsByText: 'Đơn hàng,Trả lại hàng bán', Period: 13,
  FromDate: '2026-09-30T17:00:00.000Z', ToDate: '2026-10-31T16:59:59.999Z',
  AnalysisType: 2, AnalysisTypeText: 'Cơ cấu tổ chức', OrganizationUnitID: 4,
  OrganizationUnitIDText: 'VẠN THỊNH', MISACode: '0001/0013', ID: 26,
  IsFilterDraffSaleOrder: false, IsLastOrganization: 0, ReportDynamicID: 0,
  Config: { GroupColumn: [], Filter: [], Formula: '', FormulaContent: '' },
  FromDateWeek1: '2026-10-01T00:00:00.000Z', ToDateWeek1: '2026-10-04T00:00:00.000Z',
  FromDateWeek2: '2026-10-05T00:00:00.000Z', ToDateWeek2: '2026-10-11T00:00:00.000Z',
  FromDateWeek3: '2026-10-12T00:00:00.000Z', ToDateWeek3: '2026-10-18T00:00:00.000Z',
  FromDateWeek4: '2026-10-19T00:00:00.000Z', ToDateWeek4: '2026-10-25T00:00:00.000Z',
  FromDateWeek5: '2026-10-26T00:00:00.000Z', ToDateWeek5: '2026-10-31T00:00:00.000Z',
  ProductStatisticsID: '1', ProductStatisticsIDText: 'Hàng hóa', WeekText: '', HasPermission: true,
  Weeks: null, GroupID: null, MonthText: 'Tháng 10', IsDisplay: true, IsViewEmployee: false,
};

async function main() {
  const sourceEnv = readEnv(bikeforceEnvPath);
  const token = sourceEnv.AMIS_BEARER_TOKEN;
  const cookie = sourceEnv.AMIS_COOKIE;
  const companyCode = sourceEnv.AMIS_COMPANY_CODE;
  if (!token || !cookie || !companyCode) {
    throw new Error('Thiếu phiên AMIS CRM đã lưu của BikeForce. Hãy chạy đồng bộ CRM của BikeForce để làm mới phiên.');
  }

  const response = await fetch(reportUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*', Authorization: `Bearer ${token}`,
      Cookie: cookie, 'Content-Type': 'application/json', companycode: companyCode,
      layoutcode: 'Report', 'X-MISA-Language': 'vi-VN', Origin: 'https://amisapp.misa.vn',
      Referer: 'https://amisapp.misa.vn/crm/report/view/26/0',
    },
    body: JSON.stringify({ ID: 26, IsGetCache: false, Data: reportParameters }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`AMIS report 26 HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload?.Success || !Array.isArray(payload.Data) || !payload.SummaryData) {
    throw new Error('AMIS không trả về dữ liệu hợp lệ từ báo cáo 26.');
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(), source: 'AMIS CRM report 26',
    parameters: reportParameters, summary: payload.SummaryData, rows: payload.Data,
  }, null, 2));
  console.log(`Đã đồng bộ báo cáo 26: ${reportParameters.MonthText}; tổng ${Number(payload.SummaryData.DoneOfMonth || 0).toLocaleString('vi-VN')} ₫.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
