import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

function authorized(request: NextRequest) {
  const expected = process.env.AMIS_REPORT_SYNC_SECRET || '';
  const received = request.headers.get('x-amis-report-sync-secret') || '';
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const jobs = await supabaseRestRequest<Array<{ period_month: string }>>('amis_report26_sync_jobs', {
      query: 'select=period_month&status=eq.PENDING&order=requested_at.asc&limit=1',
    });
    const job = jobs[0];
    if (!job) return NextResponse.json({ job: null });
    await supabaseRestRequest('amis_report26_sync_jobs', {
      method: 'PATCH', query: `period_month=eq.${job.period_month}&status=eq.PENDING`,
      body: { status: 'PROCESSING', started_at: new Date().toISOString(), error_message: null },
    });
    return NextResponse.json({ job: { month: job.period_month.slice(0, 7) } });
  } catch {
    return NextResponse.json({ error: 'Không thể nhận yêu cầu đồng bộ.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { month?: unknown; ok?: unknown; error?: unknown } | null;
  const month = typeof body?.month === 'string' ? body.month : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || typeof body?.ok !== 'boolean') return NextResponse.json({ error: 'Payload không hợp lệ.' }, { status: 400 });
  await supabaseRestRequest('amis_report26_sync_jobs', {
    method: 'PATCH', query: `period_month=eq.${month}-01`,
    body: body.ok ? { status: 'COMPLETED', completed_at: new Date().toISOString(), error_message: null } : { status: 'FAILED', error_message: typeof body.error === 'string' ? body.error.slice(0, 500) : 'Đồng bộ thất bại.' },
  });
  return NextResponse.json({ ok: true });
}
