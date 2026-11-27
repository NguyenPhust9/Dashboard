import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';
import { isAccountingOverview, latestAccountingOverview } from '@/lib/accounting-overview';
import type { AccountingReceivableResult } from '@/lib/accounting-overview';

export const runtime = 'nodejs';

const cacheFile = resolve(process.cwd(), 'data', 'accounting-receivable-live.json');
const refreshInterval = 60_000;
let lastAttempt = 0;
let result: AccountingReceivableResult | null = null;
let pending: Promise<AccountingReceivableResult> | null = null;

async function readSnapshot(path: string | undefined) {
  try { return path ? JSON.parse(await readFile(path, 'utf8')) : null; }
  catch { return null; }
}

async function readLiveOverview(): Promise<unknown> {
  return new Promise((resolveResult) => {
    execFile(process.execPath, [resolve(process.cwd(), 'scripts', 'accounting-overview-read.mjs')],
      { timeout: 65_000, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
        try { resolveResult(JSON.parse(stdout.trim())); }
        catch { resolveResult({ error: error ? 'Không kết nối được AMIS Kế toán.' : 'Dữ liệu AMIS không hợp lệ.' }); }
      });
  });
}

async function refresh(): Promise<AccountingReceivableResult> {
  lastAttempt = Date.now();
  const candidates: unknown[] = await Promise.all([
    result?.snapshot, readSnapshot(cacheFile), readSnapshot(process.env.AMIS_ACCOUNTING_OVERVIEW_FILE),
    supabaseRestRequest<Array<{ payload?: unknown }>>('amis_accounting_overview_snapshots', {
      query: 'select=payload&order=generated_at.desc&limit=1',
    }).then(rows => rows[0]?.payload).catch(() => null),
  ]);
  let error: string | undefined;
  // Local deployments read the actual AMIS widget. Hosted deployments can use
  // the existing accounting sync feed; they never try to launch local Chrome.
  if (!process.env.VERCEL && (process.env.AMIS_ACCOUNTING_BROWSER_PROFILE || process.env.AMIS_ACCOUNTING_BROWSER_ENDPOINT)) {
    const live = await readLiveOverview();
    if (isAccountingOverview(live)) {
      candidates.push(live);
      // The live number remains usable if the deployment has read-only storage.
      try {
        await mkdir(resolve(process.cwd(), 'data'), { recursive: true });
        await writeFile(cacheFile, JSON.stringify(live), 'utf8');
      } catch { /* Memory cache and AMIS remain available. */ }
    } else {
      error = (live as { error?: string })?.error || 'Chưa lấy được số mới từ AMIS Kế toán.';
    }
  }
  const snapshot = latestAccountingOverview(candidates);
  if (!error && (!snapshot || Date.now() - Date.parse(snapshot.generatedAt) > 10 * refreshInterval)) {
    error = 'Chưa có dữ liệu đồng bộ mới từ AMIS Kế toán.';
  }
  result = { snapshot, ...(error ? { error } : {}) };
  return result;
}

export async function GET() {
  if (!pending && (!result || Date.now() - lastAttempt >= refreshInterval)) {
    pending = refresh().finally(() => { pending = null; });
  }
  const data = pending ? await pending : result;
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
