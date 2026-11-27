import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isStaffSnapshot } from '@/lib/crm-excellent-staff';
import { getSupabaseConfig, supabaseRestRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

function authorized(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.AMIS_REPORT_SYNC_SECRET || '';
  if (!authorized(request.headers.get('x-amis-report-sync-secret') || '', expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const maximumBytes = 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maximumBytes) return NextResponse.json({ error: 'Payload quá lớn.' }, { status: 413 });
  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > maximumBytes) return NextResponse.json({ error: 'Payload quá lớn.' }, { status: 413 });
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Payload Nhân viên xuất sắc không hợp lệ.' }, { status: 400 });
  }
  if (!isStaffSnapshot(payload) || Date.parse(payload.generatedAt) > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Payload Nhân viên xuất sắc không hợp lệ.' }, { status: 400 });
  }
  if (!getSupabaseConfig().secretKey) return NextResponse.json({ error: 'Chưa cấu hình lưu dữ liệu nhân viên.' }, { status: 503 });
  try {
    await supabaseRestRequest('amis_excellent_staff_snapshots', {
      method: 'POST', query: 'on_conflict=period_month', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { period_month: `${payload.month}-01`, generated_at: payload.generatedAt, payload, updated_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể lưu danh sách Nhân viên xuất sắc.' }, { status: 500 });
  }
}
