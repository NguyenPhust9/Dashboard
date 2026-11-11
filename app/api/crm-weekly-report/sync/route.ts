import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseRestRequest } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Bạn cần đăng nhập để đồng bộ báo cáo.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { month?: unknown } | null;
  const month = typeof body?.month === 'string' ? body.month : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  }

  try {
    await supabaseRestRequest('amis_report26_sync_jobs', {
      method: 'POST',
      query: 'on_conflict=period_month',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { period_month: `${month}-01`, status: 'PENDING', requested_at: new Date().toISOString(), started_at: null, completed_at: null, error_message: null },
    });
    return NextResponse.json({ ok: true, status: 'PENDING' }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Không thể tạo yêu cầu đồng bộ.' }, { status: 500 });
  }
}
