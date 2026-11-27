import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNTING_OVERVIEW_URL, RECEIVABLE_WIDGET_TITLE, parseReceivableWidget, isRecentWidgetTime } from '../lib/accounting-overview.ts';

const endpoint = process.env.AMIS_ACCOUNTING_BROWSER_ENDPOINT || 'http://127.0.0.1:9223';

function lockProfile() {
  const profile = process.env.AMIS_ACCOUNTING_BROWSER_PROFILE;
  if (!profile) return () => {};
  const lockPath = resolve(profile, 'bikeforce-script.lock');
  if (existsSync(lockPath)) {
    const owner = Number(readFileSync(lockPath, 'utf8'));
    let stale = false;
    if (Number.isInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); } catch (error) { stale = error.code === 'ESRCH'; }
    }
    if (!stale) throw new Error('Phiên AMIS đang đồng bộ dữ liệu khác; ô phải thu sẽ tự thử lại.');
    unlinkSync(lockPath);
  }
  const handle = openSync(lockPath, 'wx');
  try { writeFileSync(handle, String(process.pid)); } finally { closeSync(handle); }
  return () => {
    if (existsSync(lockPath) && readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath);
  };
}

async function ready() {
  try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}

async function connect() {
  if (!(await ready())) {
    const profile = process.env.AMIS_ACCOUNTING_BROWSER_PROFILE;
    const chrome = [process.env.AMIS_CHROME_EXECUTABLE,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ].find(path => path && existsSync(path));
    if (!profile || !existsSync(profile) || !chrome) throw new Error('Chưa kết nối được phiên AMIS Kế toán để tự lấy số.');
    const url = new URL(endpoint);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Chỉ tự khởi động Chrome AMIS trên máy này.');
    const child = spawn(chrome, ['--headless=new', '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${url.port}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { detached: true, stdio: 'ignore', windowsHide: true });
    let launchError;
    child.on('error', error => { launchError = error; });
    child.unref();
    const deadline = Date.now() + 10000;
    while (!(await ready())) {
      if (launchError || Date.now() > deadline) throw new Error('Không mở được phiên AMIS Kế toán.');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return chromium.connectOverCDP(endpoint, { timeout: 10000 });
}

async function main() {
  const releaseLock = lockProfile();
  let browser;
  let page;
  try {
    browser = await connect();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Không có phiên AMIS Kế toán.');
    // A dedicated tab avoids navigating or closing the user's existing tabs.
    page = await context.newPage();
    await page.goto(ACCOUNTING_OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const deadline = Date.now() + 20000;
    let refreshed = false;
    while (Date.now() < deadline) {
      const text = await page.locator('body').innerText();
      if (text.includes('Đang có người dùng khác sử dụng tài khoản này')) {
        throw new Error('Phiên AMIS bị chặn vì tài khoản đang dùng ở máy khác. Chưa lấy được số mới.');
      }
      if (/\/login|\/Login/.test(page.url()) || text.includes('Đăng nhập bằng tài khoản MISA')) {
        throw new Error('Cần đăng nhập lại AMIS Kế toán để tự lấy số.');
      }
      const heading = page.getByText(RECEIVABLE_WIDGET_TITLE, { exact: true });
      if (await heading.count()) {
        // Select the smallest parent containing the full receivable card only.
        const widget = heading.locator('xpath=ancestor::*[contains(., "Triệu đồng") and contains(., "Quá hạn") and (contains(., "Trong Hạn") or contains(., "Trong hạn"))][1]');
        if (await widget.count()) {
          // Ask AMIS to refresh this card only, rather than reading an old
          // cached value from its Overview page or refreshing other widgets.
          const reload = widget.getByText('Tải lại', { exact: true });
          if (!refreshed && await reload.count()) {
            await reload.click();
            refreshed = true;
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          }
          try {
            const widgetText = await widget.innerText();
            const sourceTime = /Số liệu tính đến:\s*(\d{1,2}:\d{2})/u.exec(widgetText)?.[1];
            if (!refreshed || !sourceTime || !isRecentWidgetTime(sourceTime)) {
              throw new Error('Ô phải thu chưa tải xong.');
            }
            const receivable = parseReceivableWidget(widgetText);
            console.log(JSON.stringify({ generatedAt: new Date().toISOString(), sourceTime, receivable }));
            return;
          } catch { /* The widget may still be loading. */ }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error('Không đọc được ô Tổng trong Nợ phải thu theo hạn nợ trên AMIS.');
  } finally {
    try {
      await page?.close().catch(() => {});
      await browser?.close();
    } finally { releaseLock(); }
  }
}

main().catch(error => {
  // Do not expose browser URLs, session identifiers or raw browser diagnostics.
  console.log(JSON.stringify({ error: error instanceof Error && !error.message.includes('Call log:')
    ? error.message : 'Không kết nối được AMIS Kế toán.' }));
  process.exitCode = 1;
});
