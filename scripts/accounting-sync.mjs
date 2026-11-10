import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(here, '..');
const profileDir = resolve(dashboardRoot, '.amis-accounting-profile');
const outputPath = resolve(dashboardRoot, 'data', 'receivable-employee-summary.json');
const browserEndpoint = 'http://127.0.0.1:9224';
const reportUrl = 'https://actapp.misa.vn/app/RP/ReportList/RPDynamicViewer/SummaryCustomerReceivableByEmployee';
const loginMode = process.argv.includes('--login');
const monthArgIndex = process.argv.indexOf('--month');
const requestedMonth = monthArgIndex >= 0 ? process.argv[monthArgIndex + 1] : undefined;

function reportMonth() {
  if (requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)) return requestedMonth;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `01/${String(monthNumber).padStart(2, '0')}/${year}`,
    to: `${String(lastDay).padStart(2, '0')}/${String(monthNumber).padStart(2, '0')}/${year}`,
  };
}

async function browserReady() {
  try {
    return (await fetch(`${browserEndpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

async function connectBrowser() {
  if (!(await browserReady())) {
    const chrome = [
      process.env.AMIS_CHROME_EXECUTABLE,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ].find((candidate) => candidate && existsSync(candidate));
    if (!chrome) throw new Error('Không tìm thấy Google Chrome.');

    mkdirSync(profileDir, { recursive: true });
    const child = spawn(chrome, [
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=9224',
      `--user-data-dir=${profileDir}`,
      '--no-first-run', '--no-default-browser-check', '--start-maximized', 'about:blank',
    ], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();

    const deadline = Date.now() + 30_000;
    while (!(await browserReady()) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    if (!(await browserReady())) throw new Error('Chrome AMIS không khởi động được.');
  }
  return chromium.connectOverCDP(browserEndpoint);
}

async function setInput(page, index, value) {
  const input = page.locator('input[placeholder="DD/MM/YYYY"]:visible').nth(index);
  await input.click();
  await input.press('Control+A');
  await input.pressSequentially(value);
  await input.press('Tab');
}

async function openReportForMonth(page, month) {
  const { from, to } = dateRange(month);
  const chooseParameters = page.getByRole('button', { name: /Chọn tham số/i }).first();
  await chooseParameters.waitFor({ state: 'visible', timeout: loginMode ? 300_000 : 60_000 });
  await chooseParameters.click();
  await page.locator('input[placeholder="DD/MM/YYYY"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
  await setInput(page, 1, to);
  await setInput(page, 0, from);

  const selectAll = page.locator('label.con-ms-checkbox:visible').filter({ hasText: 'Chọn tất cả' });
  for (let index = 0; index < await selectAll.count(); index += 1) {
    const label = selectAll.nth(index);
    const box = label.locator('input[type="checkbox"]');
    if (!(await box.isChecked())) await label.click();
  }
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  await page.getByText(`Tháng ${Number(month.slice(5))} năm ${month.slice(0, 4)}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 120_000 });
}

async function readRows(page) {
  await page.locator('tr.tr-level-1:visible').first().waitFor({ state: 'visible', timeout: 120_000 });
  const texts = await page.locator('tr.tr-level-1:visible').evaluateAll((rows) => rows.map((row) => row.textContent || ''));
  const rows = texts.flatMap((text) => {
    const match = text.replace(/\s+/g, ' ').trim().match(/^Tên nhân viên:\s*(.+?)\s*\((\d+)\)\s*([\d.,]+)$/u);
    if (!match) return [];
    return [{ tenNhanVien: match[1].trim(), maSo: match[2], soTienThanhToan: Number(match[3].replace(/[^\d]/g, '')) }];
  });
  if (rows.length === 0) throw new Error('Không đọc được dòng tổng theo nhân viên từ báo cáo AMIS.');
  return rows;
}

async function main() {
  const month = reportMonth();
  const browser = await connectBrowser();
  const context = browser.contexts()[0];
  if (!context) throw new Error('Không có Chrome context.');
  const page = await context.newPage();
  try {
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    if (loginMode) console.log('Đăng nhập AMIS Kế toán trong cửa sổ Chrome vừa mở, sau đó chờ script hoàn tất.');
    await openReportForMonth(page, month);
    const rows = await readRows(page);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify({ month, generatedAt: new Date().toISOString(), rows }, null, 2));
    console.log(`Đã lưu ${rows.length} dòng, tổng ${rows.reduce((sum, row) => sum + row.soTienThanhToan, 0).toLocaleString('vi-VN')} ₫.`);
  } finally {
    await page.close().catch(() => {});
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
