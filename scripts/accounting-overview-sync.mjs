import nextEnv from '@next/env';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAccountingOverview } from '../lib/accounting-overview.ts';

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
  const syncUrl = process.env.DASHBOARD_ACCOUNTING_SYNC_URL
    || (source.DASHBOARD_REPORT26_SYNC_URL || '').replace(/\/amis-report-sync$/, '/amis-accounting-overview-sync');
  const secret = process.env.AMIS_REPORT_SYNC_SECRET || source.DASHBOARD_REPORT_SYNC_SECRET;
  if (!syncUrl || !secret) throw new Error('Thiếu URL hoặc khóa đồng bộ Dashboard Kế toán.');

  let stdout;
  try {
    ({ stdout } = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/accounting-overview-read.mjs')], {
      cwd: root, timeout: 65_000, windowsHide: true, maxBuffer: 64 * 1024,
    }));
  } catch (error) {
    let message;
    try { message = JSON.parse(error.stdout)?.error; } catch { /* Do not log raw browser errors. */ }
    throw new Error(message || 'Không đọc được số mới từ AMIS Kế toán; giữ nguyên bản đồng bộ trước.');
  }
  const snapshot = JSON.parse(stdout.trim());
  if (!isAccountingOverview(snapshot)) throw new Error('AMIS trả về số phải thu không hợp lệ.');
  const month = new Date(snapshot.generatedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7);
  const response = await fetch(syncUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-amis-report-sync-secret': secret },
    body: JSON.stringify({ month, ...snapshot }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Không lưu được số phải thu lên Dashboard (HTTP ${response.status}).`);
  await mkdir(resolve(root, 'data'), { recursive: true });
  await writeFile(resolve(root, 'data/accounting-receivable-live.json'), JSON.stringify(snapshot), 'utf8');
  console.log(`Đã tự đồng bộ phải thu ${snapshot.receivable.total.toLocaleString('vi-VN')} ₫ lên ${new URL(syncUrl).host} lúc ${snapshot.sourceTime || snapshot.generatedAt}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Đồng bộ phải thu không thành công.');
  process.exitCode = 1;
});
