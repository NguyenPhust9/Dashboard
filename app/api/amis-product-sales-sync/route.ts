import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type ProductRow = { name: string; value: number; productCategoryId?: number; misaCode?: string };
type ProductPayload = { month: string; generatedAt: string; parameters: Record<string, unknown>; rows: ProductRow[] };

function authorized(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

function validPayload(value: unknown): value is ProductPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ProductPayload>;
  return typeof data.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)
    && typeof data.generatedAt === 'string' && Boolean(data.parameters && typeof data.parameters === 'object')
    && Array.isArray(data.rows) && data.rows.every((row) => row && typeof row.name === 'string' && Number.isFinite(row.value));
}

export async function POST(request: NextRequest) {
  const expected = process.env.AMIS_REPORT_SYNC_SECRET || '';
  if (!authorized(request.headers.get('x-amis-report-sync-secret') || '', expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload: unknown = await request.json().catch(() => null);
  if (!validPayload(payload) || Number.isNaN(Date.parse(payload.generatedAt))) return NextResponse.json({ error: 'Payload doanh số dòng xe không hợp lệ.' }, { status: 400 });
  try {
    await supabaseRestRequest('amis_product_sales_snapshots', {
      method: 'POST', query: 'on_conflict=period_month', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { period_month: `${payload.month}-01`, generated_at: payload.generatedAt, payload, updated_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể lưu snapshot doanh số dòng xe.' }, { status: 500 });
  }
}
