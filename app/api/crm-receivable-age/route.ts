import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  try {
    const snapshots = await supabaseRestRequest<Array<{ payload?: unknown }>>('amis_receivable_age_snapshots', {
      query: `select=payload&period_month=eq.${month}-01&limit=1`,
    });
    const payload = snapshots[0]?.payload;
    if (!payload || typeof payload !== 'object') return NextResponse.json({ pending: true }, { status: 202 });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Không thể đọc công nợ theo tuổi nợ.' }, { status: 500 });
  }
}
