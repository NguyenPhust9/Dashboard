import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  acquireAmisProfileLock, amisBrowserConfig, amisBrowserExecutable, amisReaderError,
  assertAmisAuthenticated, connectAmisBrowser, openAmisCrmSession,
} from '../scripts/lib/amis-crm-browser.mjs';

const hasCode = code => error => amisReaderError(error).code === code;
function profile(t) {
  const path = mkdtempSync(join(tmpdir(), 'amis-reader-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('hosted configuration stays loopback-only and preserves existing Windows aliases', () => {
  const legacy = amisBrowserConfig({ AMIS_ACCOUNTING_BROWSER_PROFILE: 'C:/profile' });
  assert.equal(legacy.profile, 'C:/profile');
  assert.equal(legacy.endpoint, 'http://127.0.0.1:9223');
  assert.equal(legacy.autostart, true);
  const hosted = amisBrowserConfig({
    AMIS_CRM_BROWSER_PROFILE: '/var/lib/amis-crm/profile',
    AMIS_CRM_BROWSER_ENDPOINT: 'http://[::1]:9223/', AMIS_CRM_BROWSER_AUTOSTART: 'false',
  });
  assert.equal(hosted.autostart, false);
  assert.equal(hosted.endpoint, 'http://[::1]:9223');
  for (const endpoint of ['https://remote.example:9223', 'http://secret@127.0.0.1:9223',
    'http://127.0.0.1:9223/private', 'http://127.0.0.1:9223?token=secret', 'file:///tmp/browser']) {
    assert.throws(() => amisBrowserConfig({ AMIS_CRM_BROWSER_ENDPOINT: endpoint }), hasCode('BROWSER_CONFIG_ERROR'));
  }
});

test('supervised browser downtime never launches another browser and hides underlying errors', async () => {
  const config = amisBrowserConfig({ AMIS_CRM_BROWSER_AUTOSTART: 'false' });
  let launches = 0;
  await assert.rejects(connectAmisBrowser(config, {
    fetchVersion: async () => { throw new Error('private diagnostics Bearer secret'); },
    launch: () => { launches++; }, connect: () => assert.fail('must not connect'),
  }), error => {
    assert.equal(amisReaderError(error).code, 'BROWSER_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(amisReaderError(error)), /secret|diagnostics/);
    return true;
  });
  assert.equal(launches, 0);
});

test('supervised ready browser uses CDP without autostart and sanitizes connection errors', async () => {
  const config = amisBrowserConfig({ AMIS_CRM_BROWSER_AUTOSTART: 'false' });
  const browser = {};
  assert.equal(await connectAmisBrowser(config, {
    fetchVersion: async () => ({ ok: true }),
    launch: () => assert.fail('supervisor owns Chrome'),
    connect: async (endpoint, options) => {
      assert.equal(endpoint, 'http://127.0.0.1:9223');
      assert.equal(options.timeout, 10000);
      return browser;
    },
  }), browser);
  await assert.rejects(connectAmisBrowser(config, {
    fetchVersion: async () => ({ ok: true }), connect: async () => { throw new Error('Bearer secret'); },
  }), hasCode('BROWSER_UNAVAILABLE'));
});

test('local autostart preserves the configured profile and resolves platform executables', async () => {
  assert.equal(amisBrowserExecutable({}, 'win32', value => value.includes('Program Files/Google')),
    'C:/Program Files/Google/Chrome/Application/chrome.exe');
  assert.equal(amisBrowserExecutable({}, 'linux', value => value === '/usr/bin/chromium'), '/usr/bin/chromium');
  assert.equal(amisBrowserExecutable({ executable: '/custom/chrome' }, 'linux', () => true), '/custom/chrome');
  let polls = 0;
  let launchArgs;
  const config = amisBrowserConfig({ AMIS_CRM_BROWSER_PROFILE: 'C:/profile with spaces' });
  const child = new EventEmitter();
  child.unref = () => {};
  await connectAmisBrowser(config, {
    fetchVersion: async () => ({ ok: ++polls > 1 }),
    executable: () => '/test/chrome',
    launch: (path, args, options) => { launchArgs = { path, args, options }; return child; },
    connect: async () => ({}),
  });
  assert.equal(launchArgs.path, '/test/chrome');
  assert.ok(launchArgs.args.includes('--user-data-dir=C:/profile with spaces'));
  assert.ok(launchArgs.args.includes('--remote-debugging-address=127.0.0.1'));
  assert.equal(launchArgs.options.windowsHide, true);
});

test('profile lock serializes competing readers and releases only its own lock', async t => {
  const directory = profile(t);
  const lock = join(directory, 'bikeforce-script.lock');
  const first = await acquireAmisProfileLock(directory);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  await assert.rejects(acquireAmisProfileLock(directory, { waitMs: 20, pollMs: 5 }), hasCode('BROWSER_BUSY'));
  const next = acquireAmisProfileLock(directory, { waitMs: 100, pollMs: 5 });
  first();
  const release = await next;
  assert.equal(existsSync(lock), true);
  first(); // An older reader must not release the next reader's lock.
  assert.equal(existsSync(lock), true);
  unlinkSync(lock);
  writeFileSync(lock, '123456');
  release();
  assert.equal(readFileSync(lock, 'utf8'), '123456');
});

test('only ESRCH proves a stale lock; malformed and inaccessible owners stay protected', async t => {
  const directory = profile(t);
  const lock = join(directory, 'bikeforce-script.lock');
  writeFileSync(lock, '123456');
  const release = await acquireAmisProfileLock(directory, {
    checkProcess: () => { throw Object.assign(new Error(), { code: 'ESRCH' }); },
  });
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  release();
  for (const content of ['123456', '', 'not-a-pid']) {
    writeFileSync(lock, content);
    await assert.rejects(acquireAmisProfileLock(directory, {
      waitMs: 10, pollMs: 2,
      checkProcess: () => { throw Object.assign(new Error(), { code: 'EPERM' }); },
    }), hasCode('BROWSER_BUSY'));
    assert.equal(readFileSync(lock, 'utf8'), content);
  }
});

test('authentication failures have a fixed machine code without copying browser or API text', () => {
  for (const input of [{ status: 401 }, { url: 'https://amisapp.misa.vn/crm/Login?token=secret' },
    { url: 'https://login.misa.vn/?token=secret' }, { text: 'Phiên đăng nhập đã hết hạn secret' },
    { text: 'Đang có người dùng khác sử dụng tài khoản này' }]) {
    assert.throws(() => assertAmisAuthenticated(input), error => {
      assert.equal(amisReaderError(error).code, 'AUTH_REQUIRED');
      assert.doesNotMatch(JSON.stringify(amisReaderError(error)), /secret/);
      return true;
    });
  }
  assert.doesNotThrow(() => assertAmisAuthenticated({ status: 403, url: 'https://amisapp.misa.vn/crm/dashboard/main' }));
  assert.equal(amisReaderError(new Error('Authorization: Bearer secret')).code, 'READ_FAILED');
  assert.doesNotMatch(JSON.stringify(amisReaderError(new Error('Authorization: Bearer secret'))), /secret/);
});

test('session closes its own tab, disconnects, and releases the lock after setup failure', async () => {
  const calls = [];
  const page = { setViewportSize: async () => {}, close: async () => { calls.push('page'); } };
  const context = { newPage: async () => page, close: () => assert.fail('shared context must remain open') };
  const adapters = {
    lockProfile: async () => () => { calls.push('release'); },
    connectBrowser: async () => ({ contexts: () => [context], close: async () => { calls.push('disconnect'); } }),
  };
  const session = await openAmisCrmSession({}, adapters);
  assert.equal(session.page, page);
  await session.close();
  await session.close();
  assert.deepEqual(calls, ['page', 'disconnect', 'release']);
  calls.length = 0;
  page.setViewportSize = async () => { throw new Error('failed setup'); };
  await assert.rejects(openAmisCrmSession({}, adapters), /failed setup/);
  assert.deepEqual(calls, ['page', 'disconnect', 'release']);
});

test('both reader CLIs return a safe failure code and release their locks when supervised Chrome is down', async t => {
  for (const name of ['crm-excellent-staff-read.mjs', 'crm-top-customers-read.mjs']) {
    const directory = profile(t);
    await assert.rejects(promisify(execFile)(process.execPath, [
      fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), '--month', '2026-11',
    ], {
      timeout: 10000, windowsHide: true,
      env: { ...process.env, AMIS_CRM_BROWSER_PROFILE: directory,
        AMIS_CRM_BROWSER_ENDPOINT: 'http://127.0.0.1:1', AMIS_CRM_BROWSER_AUTOSTART: 'false' },
    }), error => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stdout).code, 'BROWSER_UNAVAILABLE');
      assert.equal(existsSync(join(directory, 'bikeforce-script.lock')), false);
      return true;
    });
  }
});
