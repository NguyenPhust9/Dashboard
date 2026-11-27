import nextEnv from '@next/env';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCustomerSnapshot } from '../lib/crm-top-customers.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);

async function sourceConfig() {
  const path = process.env.BIKEFORCE_AMIS_ENV_FILE
    || (process.env.AMIS_ACCOUNTING_OVERVIEW_FILE && resolve(dirname(process.env.AMIS_ACCOUNTING_OVERVIEW_FILE), '.env'));
  if (!path) return {};
  const text = await readFile(path, 'utf8');
  return Object.fromEntries(text.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap(line => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}

async function main() {
  const source = await sourceConfig();
  const syncUrl = process.env.DASHBOARD_CUSTOMERS_SYNC_URL
    || (source.DASHBOARD_REPORT26_SYNC_URL || '').replace(/\/amis-report-sync$/, '/amis-top-customers-sync');
  const secret = process.env.AMIS_REPORT_SYNC_SECRET || source.DASHBOARD_REPORT_SYNC_SECRET;
  if (!syncUrl || !secret) throw new Error('Thiếu URL hoặc khóa đồng bộ KH có doanh số cao nhất.');
  const args = [resolve(root, 'scripts/crm-top-customers-read.mjs')];
  const monthArg = process.argv.indexOf('--month');
  if (monthArg >= 0) args.push('--month', process.argv[monthArg + 1] || '');
  let stdout;
  try {
    ({ stdout } = await promisify(execFile)(process.execPath, args, {
      cwd: root, timeout: 180000, windowsHide: true, maxBuffer: 256 * 1024,
    }));
  } catch (error) {
    let message;
    try { message = JSON.parse(error.stdout)?.error; } catch { /* Do not print raw diagnostics. */ }
    throw new Error(message || 'Không đọc được API KH có doanh số cao nhất; giữ bản đồng bộ trước.');
  }
  const snapshot = JSON.parse(stdout.trim());
  if (!isCustomerSnapshot(snapshot)) throw new Error('Dữ liệu KH có doanh số cao nhất không hợp lệ.');
  const response = await fetch(syncUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-amis-report-sync-secret': secret },
    body: JSON.stringify(snapshot), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Không lưu được KH có doanh số cao nhất lên Dashboard (HTTP ${response.status}).`);
  await mkdir(resolve(root, 'data'), { recursive: true });
  await writeFile(resolve(root, `data/crm-top-customers-${snapshot.month}.json`), JSON.stringify(snapshot), 'utf8');
  console.log(`Đã đồng bộ ${snapshot.rows.length} khách hàng từ AMIS CRM, tháng ${snapshot.month}, lúc ${snapshot.generatedAt}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Không đồng bộ được KH có doanh số cao nhất.');
  process.exitCode = 1;
});
