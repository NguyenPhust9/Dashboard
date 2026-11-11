import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type RegionalRow = { name: string; value: number; organizationUnitId: number; misaCode: string };
type RegionalPayload = { month: string; generatedAt: string; parameters: Record<string, unknown>; rows: RegionalRow[] };

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function isPayload(value: unknown): value is RegionalPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<RegionalPayload>;
  return typeof payload.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month)
    && typeof payload.generatedAt === 'string' && Boolean(payload.parameters && typeof payload.parameters === 'object')
    && Array.isArray(payload.rows) && payload.rows.every((row) => row && typeof row.name === 'string' && Number.isFinite(row.value));
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.AMIS_REPORT_SYNC_SECRET || '';
  const receivedSecret = request.headers.get('x-amis-report-sync-secret') || '';
  if (!expectedSecret || !secretsMatch(receivedSecret, expectedSecret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Payload JSON không hợp lệ.' }, { status: 400 }); }
  if (!isPayload(payload) || Number.isNaN(Date.parse(payload.generatedAt))) return NextResponse.json({ error: 'Payload doanh số khu vực không hợp lệ.' }, { status: 400 });
  try {
    await supabaseRestRequest('amis_regional_sales_snapshots', {
      method: 'POST', query: 'on_conflict=period_month', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { period_month: `${payload.month}-01`, generated_at: payload.generatedAt, payload, updated_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Không thể lưu snapshot doanh số khu vực.' }, { status: 500 }); }
}
