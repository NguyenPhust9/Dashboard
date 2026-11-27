import { chromium } from '@playwright/test';
import { access, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const profile = process.env.AMIS_CRM_BROWSER_PROFILE;
let context;
let stopped = false;
const stop = async () => { stopped = true; await context?.close().catch(() => {}); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  if (!profile) throw new Error('Profile missing');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  for (let attempts = 0; attempts < 60; attempts += 1) {
    if (await access('/tmp/.X11-unix/X99').then(() => true, () => false)) break;
    await delay(500);
  }
  if (!stopped) {
    context = await chromium.launchPersistentContext(profile, {
      headless: false, chromiumSandbox: true, viewport: null,
      args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9223',
        '--no-first-run', '--no-default-browser-check'],
    });
    const closed = new Promise(resolve => context.once('close', resolve));
    // Keep one tab for interactive login. Readers create and close their own tabs.
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://amisapp.misa.vn/crm/dashboard/main', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    }).catch(() => {});
    console.log('CRM browser ready on the private container interface.');
    if (stopped) await context.close();
    await closed;
  }
} catch {
  console.error('CRM browser stopped; supervisor will restart it.');
  process.exitCode = 1;
}
