import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type RegionalSnapshot = { payload?: { generatedAt?: string; rows?: unknown[] } };
type RegionalRow = { name?: unknown; value?: unknown; organizationUnitId?: unknown; misaCode?: unknown };

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  try {
    const snapshots = await supabaseRestRequest<RegionalSnapshot[]>('amis_regional_sales_snapshots', { query: `select=payload&period_month=eq.${month}-01&limit=1` });
    const payload = snapshots[0]?.payload;
    if (!payload) return NextResponse.json({ pending: true }, { status: 202 });
    const sourceRows = Array.isArray(payload.rows) ? payload.rows as RegionalRow[] : [];
    const rows = sourceRows.map((row) => ({
      name: typeof row.name === 'string' ? row.name : 'Không rõ', value: Number(row.value || 0),
      organizationUnitId: Number(row.organizationUnitId || 0), misaCode: typeof row.misaCode === 'string' ? row.misaCode : '',
    }));
    return NextResponse.json({ generatedAt: payload.generatedAt || null, rows });
  } catch { return NextResponse.json({ error: 'Không thể đọc doanh số khu vực.' }, { status: 500 }); }
}
