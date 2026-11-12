import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type DebtAgePayload = {
  month: string;
  generatedAt: string;
  values: {
    totalDebt: number;
    noDueDate: number;
    beforeDue0To30: number;
    overdue1To30: number;
    overdue31To60: number;
    overdue61To90: number;
    overdue91To120: number;
    overdueOver120: number;
    totalOverdue: number;
  };
};

function authorized(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

function validPayload(value: unknown): value is DebtAgePayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DebtAgePayload>;
  const values = data.values;
  if (!values) return false;
  return typeof data.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)
    && typeof data.generatedAt === 'string'
    && Object.values(values).every((amount) => typeof amount === 'number' && Number.isFinite(amount));
}

export async function POST(request: NextRequest) {
  const expected = process.env.AMIS_REPORT_SYNC_SECRET || '';
  if (!authorized(request.headers.get('x-amis-report-sync-secret') || '', expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload: unknown = await request.json().catch(() => null);
  if (!validPayload(payload) || Number.isNaN(Date.parse(payload.generatedAt))) return NextResponse.json({ error: 'Payload công nợ theo tuổi nợ không hợp lệ.' }, { status: 400 });
  try {
    await supabaseRestRequest('amis_receivable_age_snapshots', {
      method: 'POST', query: 'on_conflict=period_month', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { period_month: `${payload.month}-01`, generated_at: payload.generatedAt, payload, updated_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể lưu snapshot công nợ theo tuổi nợ.' }, { status: 500 });
  }
}
