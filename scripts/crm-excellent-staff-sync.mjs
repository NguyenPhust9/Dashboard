import nextEnv from '@next/env';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStaffSnapshot } from '../lib/crm-excellent-staff.ts';

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
  const syncUrl = process.env.DASHBOARD_STAFF_SYNC_URL
    || (process.env.DASHBOARD_REPORT26_SYNC_URL || source.DASHBOARD_REPORT26_SYNC_URL || '').replace(/\/amis-report-sync$/, '/amis-excellent-staff-sync');
  const secret = process.env.AMIS_REPORT_SYNC_SECRET || source.DASHBOARD_REPORT_SYNC_SECRET;
  if (!syncUrl || !secret) throw new Error('Thiếu URL hoặc khóa đồng bộ Nhân viên xuất sắc.');
  const args = [resolve(root, 'scripts/crm-excellent-staff-read.mjs')];
  const monthArg = process.argv.indexOf('--month');
  if (monthArg >= 0) args.push('--month', process.argv[monthArg + 1] || '');
  let stdout;
  try {
    ({ stdout } = await promisify(execFile)(process.execPath, args, {
      cwd: root, timeout: 180000, windowsHide: true, maxBuffer: 256 * 1024,
    }));
  } catch (error) {
    let code;
    try { if (JSON.parse(error.stdout)?.code === 'AUTH_REQUIRED') code = 'AUTH_REQUIRED'; } catch { /* Only relay a known status. */ }
    if (code) throw Object.assign(new Error('Phiên AMIS CRM cần đăng nhập lại.'), { code });
    let message;
    try { message = JSON.parse(error.stdout)?.error; } catch { /* Do not print raw diagnostics. */ }
    throw new Error(message || 'Không đọc được API Nhân viên xuất sắc; giữ bản đồng bộ trước.');
  }
  const snapshot = JSON.parse(stdout.trim());
  if (!isStaffSnapshot(snapshot)) throw new Error('Dữ liệu Nhân viên xuất sắc không hợp lệ.');
  const response = await fetch(syncUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-amis-report-sync-secret': secret },
    body: JSON.stringify(snapshot), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Không lưu được Nhân viên xuất sắc lên Dashboard (HTTP ${response.status}).`);
  await mkdir(resolve(root, 'data'), { recursive: true });
  await writeFile(resolve(root, `data/crm-excellent-staff-${snapshot.month}.json`), JSON.stringify(snapshot), 'utf8');
  console.log(`Đã đồng bộ ${snapshot.rows.length} nhân viên từ AMIS CRM, tháng ${snapshot.month}, lúc ${snapshot.generatedAt}.`);
}

main().catch(error => {
  if (error?.code === 'AUTH_REQUIRED') console.log(JSON.stringify({ code: 'AUTH_REQUIRED' }));
  console.error(error instanceof Error ? error.message : 'Không đồng bộ được Nhân viên xuất sắc.');
  process.exitCode = 1;
});
