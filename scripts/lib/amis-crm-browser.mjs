import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const messages = Object.freeze({
  AUTH_REQUIRED: 'Cần đăng nhập lại phiên AMIS CRM trên máy đồng bộ.',
  BROWSER_CONFIG_ERROR: 'Cấu hình phiên trình duyệt AMIS CRM không hợp lệ.',
  BROWSER_BUSY: 'Phiên AMIS đang đồng bộ tác vụ khác; sẽ thử lại ở lượt sau.',
  BROWSER_UNAVAILABLE: 'Không kết nối được trình duyệt AMIS CRM trên máy đồng bộ.',
  READ_FAILED: 'Không đọc được dữ liệu AMIS CRM; giữ bản đồng bộ trước.',
});

class AmisBrowserError extends Error {
  constructor(code) {
    super(messages[code]);
    this.code = code;
  }
}

const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const failure = code => new AmisBrowserError(code);

/** Only fixed messages leave a reader; Playwright diagnostics can contain headers. */
export function amisReaderError(error) {
  const code = error instanceof AmisBrowserError ? error.code : 'READ_FAILED';
  return { error: messages[code], code };
}

export function amisBrowserConfig(env = process.env) {
  const profile = env.AMIS_CRM_BROWSER_PROFILE || env.AMIS_ACCOUNTING_BROWSER_PROFILE;
  const endpoint = env.AMIS_CRM_BROWSER_ENDPOINT || env.AMIS_ACCOUNTING_BROWSER_ENDPOINT || 'http://127.0.0.1:9223';
  const autostart = (env.AMIS_CRM_BROWSER_AUTOSTART ?? 'true').trim().toLowerCase();
  let url;
  try { url = new URL(endpoint); } catch { throw failure('BROWSER_CONFIG_ERROR'); }
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || !['true', 'false', '1', '0'].includes(autostart)) {
    throw failure('BROWSER_CONFIG_ERROR');
  }
  return {
    profile,
    endpoint: url.origin,
    autostart: ['true', '1'].includes(autostart),
    executable: env.AMIS_CHROME_EXECUTABLE,
  };
}

function readLock(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 32) return { invalid: true };
    const content = readFileSync(path, 'utf8');
    return { content, owner: /^\d+$/.test(content) ? Number(content) : NaN, ino: stat.ino, mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw failure('BROWSER_UNAVAILABLE');
  }
}

function sameLock(left, right) {
  return left && right && !left.invalid && !right.invalid
    && left.content === right.content && left.ino === right.ino && left.mtimeMs === right.mtimeMs;
}

/** Keep the numeric PID format used by existing accounting and ranking workers. */
export async function acquireAmisProfileLock(profile, {
  waitMs = 20000, pollMs = 500, checkProcess = pid => process.kill(pid, 0),
} = {}) {
  try {
    if (!profile || !statSync(profile).isDirectory()) throw failure('BROWSER_CONFIG_ERROR');
  } catch { throw failure('BROWSER_CONFIG_ERROR'); }
  const path = resolve(profile, 'bikeforce-script.lock');
  const deadline = Date.now() + waitMs;
  for (;;) {
    let handle;
    try {
      // Trying the exclusive create first also handles another waiter winning a race.
      handle = openSync(path, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw failure('BROWSER_UNAVAILABLE');
    }
    if (handle !== undefined) {
      try { writeFileSync(handle, String(process.pid)); }
      catch {
        closeSync(handle);
        try { unlinkSync(path); } catch { /* Preserve the original failure. */ }
        throw failure('BROWSER_UNAVAILABLE');
      }
      closeSync(handle);
      const owned = readLock(path);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          if (sameLock(owned, readLock(path))) unlinkSync(path);
        } catch { /* A reader must not remove a replacement lock or mask its result. */ }
      };
    }
    const observed = readLock(path);
    if (!observed) continue;
    let stale = false;
    if (Number.isSafeInteger(observed.owner) && observed.owner > 0) {
      try { checkProcess(observed.owner); }
      catch (error) { stale = error.code === 'ESRCH'; }
    }
    if (stale && sameLock(observed, readLock(path))) {
      try { unlinkSync(path); }
      catch (error) { if (error.code !== 'ENOENT') throw failure('BROWSER_UNAVAILABLE'); }
      continue;
    }
    if (Date.now() >= deadline) throw failure('BROWSER_BUSY');
    await wait(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
}

export function amisBrowserExecutable(config, platform = process.platform, exists = existsSync) {
  const defaults = platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const executable = [config.executable, ...defaults].find(path => path && exists(path));
  if (!executable) throw failure('BROWSER_UNAVAILABLE');
  return executable;
}

export async function connectAmisBrowser(config = amisBrowserConfig(), {
  fetchVersion = globalThis.fetch,
  launch = spawn,
  connect = (endpoint, options) => chromium.connectOverCDP(endpoint, options),
  executable = amisBrowserExecutable,
} = {}) {
  async function ready() {
    try {
      return (await fetchVersion(`${config.endpoint}/json/version`, {
        signal: AbortSignal.timeout(1000), redirect: 'error',
      })).ok;
    } catch { return false; }
  }
  if (!(await ready())) {
    // A hosted supervisor owns the browser lifecycle; readers must not compete with it.
    if (!config.autostart) throw failure('BROWSER_UNAVAILABLE');
    const url = new URL(config.endpoint);
    let child;
    try {
      child = launch(executable(config), [
        '--headless=new', `--remote-debugging-address=${url.hostname.replace(/^\[|\]$/g, '')}`,
        `--remote-debugging-port=${url.port || (url.protocol === 'https:' ? '443' : '80')}`,
        `--user-data-dir=${config.profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
      ], { detached: true, stdio: 'ignore', windowsHide: true });
    } catch { throw failure('BROWSER_UNAVAILABLE'); }
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('exit', () => { failed = true; });
    child.unref();
    const deadline = Date.now() + 10000;
    while (!(await ready())) {
      if (failed || Date.now() >= deadline) throw failure('BROWSER_UNAVAILABLE');
      await wait(300);
    }
  }
  try { return await connect(config.endpoint, { timeout: 10000 }); }
  catch { throw failure('BROWSER_UNAVAILABLE'); }
}

export function assertAmisAuthenticated({ url = '', text = '', status } = {}) {
  let loginUrl = false;
  try {
    const parsed = new URL(url);
    loginUrl = /(^|\.)(?:login|signin)\./i.test(parsed.hostname)
      || /\/(?:login|signin|sign-in)(?:\/|$|[?#])/i.test(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch { /* A missing URL alone does not prove that authentication expired. */ }
  if (status === 401 || loginUrl
    || /Đăng nhập bằng tài khoản MISA|Đang có người dùng khác sử dụng tài khoản này|Phiên đăng nhập (?:đã )?hết hạn/i.test(text)) {
    throw failure('AUTH_REQUIRED');
  }
}

/** Close only this reader's tab and CDP connection; retain the persistent browser session. */
export async function openAmisCrmSession(config = amisBrowserConfig(), {
  lockProfile = acquireAmisProfileLock, connectBrowser = connectAmisBrowser,
} = {}) {
  const release = await lockProfile(config.profile);
  let browser;
  let page;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try { await page?.close().catch(() => {}); await browser?.close().catch(() => {}); }
    finally { release(); }
  }
  try {
    browser = await connectBrowser(config);
    const context = browser.contexts()[0];
    if (!context) throw failure('BROWSER_UNAVAILABLE');
    page = await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    return { page, context, close };
  } catch (error) {
    await close();
    throw error;
  }
}
