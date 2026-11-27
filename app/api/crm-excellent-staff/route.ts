import { NextRequest, NextResponse } from 'next/server';
import { isStaffMonth, isStaffSnapshot } from '@/lib/crm-excellent-staff';
import type { StaffResult } from '@/lib/crm-excellent-staff';
import { supabaseRestRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month');
  const headers = { 'Cache-Control': 'no-store' };
  if (!isStaffMonth(month)) return NextResponse.json({ snapshot: null, error: 'Tháng không hợp lệ.' }, { status: 400, headers });
  try {
    const records = await supabaseRestRequest<Array<{ payload?: unknown }>>('amis_excellent_staff_snapshots', {
      query: `select=payload&period_month=eq.${month}-01&limit=1`,
    });
    const payload = records[0]?.payload;
    let result: StaffResult;
    if (!isStaffSnapshot(payload) || payload.month !== month) {
      result = { snapshot: null, error: 'Chưa có dữ liệu Nhân viên xuất sắc từ AMIS CRM cho tháng này.' };
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
    return NextResponse.json({ snapshot: null, error: 'Không thể đọc danh sách Nhân viên xuất sắc từ AMIS CRM.' }, { status: 503, headers });
  }
}
