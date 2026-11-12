import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type Payload = { month: string; generatedAt: string; receivable: { total: number; overdue: number; current: number } };

function authorized(received: string, expected: string) {
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}
function valid(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Payload>; const receivable = data.receivable;
  return typeof data.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)
    && typeof data.generatedAt === 'string' && Boolean(receivable)
    && [receivable?.total, receivable?.overdue, receivable?.current].every((n) => typeof n === 'number' && Number.isFinite(n));
}
export async function POST(request: NextRequest) {
  const expected = process.env.AMIS_REPORT_SYNC_SECRET || '';
  if (!authorized(request.headers.get('x-amis-report-sync-secret') || '', expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload: unknown = await request.json().catch(() => null);
  if (!valid(payload)) return NextResponse.json({ error: 'Payload Overview Kế toán không hợp lệ.' }, { status: 400 });
  try {
    await supabaseRestRequest('amis_accounting_overview_snapshots', { method: 'POST', query: 'on_conflict=period_month', prefer: 'resolution=merge-duplicates,return=minimal', body: { period_month: `${payload.month}-01`, generated_at: payload.generatedAt, payload, updated_at: new Date().toISOString() } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Không thể lưu Overview Kế toán.' }, { status: 500 }); }
}
