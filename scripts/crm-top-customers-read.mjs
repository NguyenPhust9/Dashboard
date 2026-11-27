import nextEnv from '@next/env';
import { amisReaderError, assertAmisAuthenticated, openAmisCrmSession } from './lib/amis-crm-browser.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_SOURCE, isCustomerMonth, isCustomerSnapshot, parseCustomerRows } from '../lib/crm-top-customers.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);
const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds));

function requestedMonth() {
  const index = process.argv.indexOf('--month');
  const month = index >= 0 ? process.argv[index + 1]
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
  if (!isCustomerMonth(month)) throw new Error('Tháng phải có định dạng YYYY-MM.');
  return month;
}

async function readRanking(month) {
  const session = await openAmisCrmSession();
  const { page, context } = session;
  try {
    let captured;
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname !== 'amisapp.misa.vn' || !/^\/crm\/g\d+\/api\/dashboard\/Dashboard\/55\/data$/.test(url.pathname)) return;
      try {
        const body = request.postDataJSON();
        const param = typeof body?.Param === 'string' ? JSON.parse(body.Param) : null;
        if (body?.DashboardID === 63 && param?.DashboardKey === 'AccountWithTheHighestSale') captured = { request, body, param };
      } catch { /* Ignore unrelated or incomplete widget requests. */ }
    });
    await page.goto('https://amisapp.misa.vn/crm/dashboard/main', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const heading = page.getByText('KH có doanh số cao nhất', { exact: true });
    const deadline = Date.now() + 30000;
    let scrolled = false;
    while (!captured && Date.now() < deadline) {
      const text = await page.locator('body').innerText();
      assertAmisAuthenticated({ url: page.url(), text });
      if (!scrolled && await heading.count()) { await heading.scrollIntoViewIfNeeded(); scrolled = true; }
      await wait(300);
    }
    if (!captured) throw new Error('Không nhận được API của ô KH có doanh số cao nhất.');

    const [year, value] = month.split('-').map(Number);
    const fromDate = new Date(Date.UTC(year, value - 1, 1, -7)).toISOString();
    const toDate = new Date(Date.UTC(year, value, 1, -7) - 1).toISOString();
    // Keep the widget's actual organisation and revenue settings. Only the
    // requested month and cache refresh flags change; never sum SaleOrders.
    const param = { ...captured.param, Period: 13, FromDate: fromDate, ToDate: toDate,
      DateData: { FromDate: fromDate, ToDate: toDate, Period: 13 },
      IsGetNew: true, IsGetCache: false, IsGetCacheClient: false };
    const body = { ...captured.body, IsGetNew: true, Param: JSON.stringify(param) };
    const requestHeaders = await captured.request.allHeaders();
    const headers = Object.fromEntries(Object.entries(requestHeaders).filter(([name]) =>
      ['authorization', 'companycode', 'layoutcode', 'content-type', 'x-misa-language', 'origin', 'referer'].includes(name.toLowerCase())));
    const response = await context.request.post(captured.request.url(), { headers, data: body, timeout: 25000 });
    assertAmisAuthenticated({ url: response.url(), status: response.status() });
    if (!response.ok()) throw new Error(`API KH có doanh số cao nhất trả HTTP ${response.status()}.`);
    const rows = parseCustomerRows(await response.json());
    const snapshot = {
      month, generatedAt: new Date().toISOString(), source: CUSTOMER_SOURCE,
      parameters: {
        organizationUnitId: param.OrganizationUnitID,
        organizationUnitName: param.OrganizationUnitIDText,
        misaCode: param.MISACode, fromDate, toDate, displayCount: param.DisplayItemNumber,
      }, rows,
    };
    if (!isCustomerSnapshot(snapshot)) throw new Error('Dữ liệu KH có doanh số cao nhất không hợp lệ.');
    return snapshot;
  } finally {
    await session.close();
  }
}

try { console.log(JSON.stringify(await readRanking(requestedMonth()))); }
catch (error) {
  console.log(JSON.stringify(amisReaderError(error)));
  process.exitCode = 1;
}
