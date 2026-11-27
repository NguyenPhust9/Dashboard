import nextEnv from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root, undefined, { info() {}, error() {} });
try {
  let secret = process.env.AMIS_REPORT_SYNC_SECRET;
  const sourcePath = process.env.BIKEFORCE_AMIS_ENV_FILE
    || (process.env.AMIS_ACCOUNTING_OVERVIEW_FILE && resolve(dirname(process.env.AMIS_ACCOUNTING_OVERVIEW_FILE), '.env'));
  if (!secret && sourcePath) {
    const source = await readFile(sourcePath, 'utf8');
    secret = source.replace(/^\uFEFF/, '').split(/\r?\n/)
      .find(line => /^DASHBOARD_REPORT_SYNC_SECRET=/.test(line))?.split('=').slice(1).join('=').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!secret || !/^[A-Za-z0-9_-]+$/.test(secret)) throw new Error('Missing or invalid report sync secret.');
  const template = (await readFile(resolve(root, 'deploy/crm-worker/env.example'), 'utf8')).replace(/\r\n/g, '\n');
  // Exclusive creation avoids overwriting an existing server configuration.
  await writeFile(resolve(root, 'deploy/crm-worker/.env.local'),
    template.replace('AMIS_REPORT_SYNC_SECRET=\n', `AMIS_REPORT_SYNC_SECRET=${secret}\n`), { flag: 'wx', mode: 0o600 });
  console.log('Created deploy/crm-worker/.env.local. Secret not printed; file excluded from Git and Docker builds.');
} catch (error) {
  console.error(error?.code === 'EEXIST' ? 'Server configuration already exists; no file changed.'
    : 'Could not prepare server configuration. Check the local report sync secret.');
  process.exitCode = 1;
}
