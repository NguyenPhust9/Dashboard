import { NextRequest, NextResponse } from 'next/server';
import { isCustomerMonth, isCustomerSnapshot } from '@/lib/crm-top-customers';
import type { CustomerResult } from '@/lib/crm-top-customers';
import { supabaseRestRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month');
  const headers = { 'Cache-Control': 'no-store' };
  if (!isCustomerMonth(month)) return NextResponse.json({ snapshot: null, error: 'Tháng không hợp lệ.' }, { status: 400, headers });
  try {
    const records = await supabaseRestRequest<Array<{ payload?: unknown }>>('amis_top_customers_snapshots', {
      query: `select=payload&period_month=eq.${month}-01&limit=1`,
    });
    const payload = records[0]?.payload;
    let result: CustomerResult;
    if (!isCustomerSnapshot(payload) || payload.month !== month) {
      result = { snapshot: null, error: 'Chưa có dữ liệu KH có doanh số cao nhất từ AMIS CRM cho tháng này.' };
    } else {
      const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
      const stale = month === currentMonth && Date.now() - Date.parse(payload.generatedAt) > 15 * 60 * 1000;
      result = {
        snapshot: payload,
        ...(stale ? { error: 'Đang hiển thị bản đồng bộ gần nhất; chưa lấy được số mới từ AMIS CRM.' } : {}),
      };
    }
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ snapshot: null, error: 'Không thể đọc danh sách KH có doanh số cao nhất từ AMIS CRM.' }, { status: 503, headers });
  }
}
