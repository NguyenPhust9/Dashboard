import nextEnv from '@next/env';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_SOURCE, isCustomerMonth, isCustomerSnapshot, parseCustomerRows } from '../lib/crm-top-customers.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);
const profile = process.env.AMIS_CRM_BROWSER_PROFILE || process.env.AMIS_ACCOUNTING_BROWSER_PROFILE;
const endpoint = process.env.AMIS_CRM_BROWSER_ENDPOINT || process.env.AMIS_ACCOUNTING_BROWSER_ENDPOINT || 'http://127.0.0.1:9223';
const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds));

function requestedMonth() {
  const index = process.argv.indexOf('--month');
  const month = index >= 0 ? process.argv[index + 1]
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
  if (!isCustomerMonth(month)) throw new Error('Tháng phải có định dạng YYYY-MM.');
  return month;
}

async function lockProfile() {
  if (!profile || !existsSync(profile)) throw new Error('Chưa cấu hình phiên trình duyệt AMIS.');
  const path = resolve(profile, 'bikeforce-script.lock');
  const deadline = Date.now() + 20000;
  while (existsSync(path)) {
    const owner = Number(readFileSync(path, 'utf8'));
    let stale = false;
    if (Number.isInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); } catch (error) { stale = error.code === 'ESRCH'; }
    }
    if (stale) { unlinkSync(path); break; }
    if (Date.now() >= deadline) throw new Error('Phiên AMIS đang đồng bộ tác vụ khác; sẽ thử lại ở lượt sau.');
    await wait(500);
  }
  const handle = openSync(path, 'wx');
  try { writeFileSync(handle, String(process.pid)); } finally { closeSync(handle); }
  return () => { if (existsSync(path) && readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); };
}

async function ready() {
  try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}

async function connect() {
  const url = new URL(endpoint);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Phiên trình duyệt AMIS phải chạy trên máy đồng bộ.');
  if (!(await ready())) {
    const executable = [process.env.AMIS_CHROME_EXECUTABLE,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ].find(path => path && existsSync(path));
    if (!executable) throw new Error('Không tìm thấy Chrome của máy đồng bộ AMIS.');
    const child = spawn(executable, ['--headless=new', '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${url.port}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { detached: true, stdio: 'ignore', windowsHide: true });
    let failed = false;
    child.on('error', () => { failed = true; });
    child.unref();
    const deadline = Date.now() + 10000;
    while (!(await ready())) {
      if (failed || Date.now() >= deadline) throw new Error('Không mở được phiên Chrome AMIS.');
      await wait(300);
    }
  }
  return chromium.connectOverCDP(endpoint, { timeout: 10000 });
}

async function readRanking(month) {
  const release = await lockProfile();
  let browser;
  let page;
  try {
    browser = await connect();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Không có phiên AMIS CRM.');
    page = await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
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
      if (/\/login|\/Login/.test(page.url()) || /Đăng nhập bằng tài khoản MISA|Đang có người dùng khác sử dụng tài khoản này/.test(text)) {
        throw new Error('Cần đăng nhập lại phiên AMIS CRM trên máy đồng bộ.');
      }
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
    try { await page?.close().catch(() => {}); await browser?.close(); }
    finally { release(); }
  }
}

try { console.log(JSON.stringify(await readRanking(requestedMonth()))); }
catch (error) {
  // Never print raw browser diagnostics, headers or session credentials.
  const message = error instanceof Error && !/Call log:|https?:|Target page|browserType\.|page\./.test(error.message)
    ? error.message : 'Không đọc được API KH có doanh số cao nhất; giữ bản đồng bộ trước.';
  console.log(JSON.stringify({ error: message }));
  process.exitCode = 1;
}
