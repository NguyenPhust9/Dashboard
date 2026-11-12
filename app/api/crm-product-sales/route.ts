import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type Snapshot = { payload?: { generatedAt?: string; rows?: unknown[] } };
type ProductRow = { name?: unknown; value?: unknown; productCategoryId?: unknown; misaCode?: unknown };

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  try {
    const snapshots = await supabaseRestRequest<Snapshot[]>('amis_product_sales_snapshots', { query: `select=payload&period_month=eq.${month}-01&limit=1` });
    const payload = snapshots[0]?.payload;
    if (!payload) return NextResponse.json({ pending: true }, { status: 202 });
    const rows = (Array.isArray(payload.rows) ? payload.rows : []).map((row) => {
      const item = row as ProductRow;
      return {
        name: typeof item.name === 'string' ? item.name : 'Không rõ',
        value: Number(item.value || 0),
        productCategoryId: Number(item.productCategoryId || 0),
        misaCode: typeof item.misaCode === 'string' ? item.misaCode : '',
      };
    });
    return NextResponse.json({ generatedAt: payload.generatedAt || null, rows });
  } catch {
    return NextResponse.json({ error: 'Không thể đọc doanh số theo dòng xe.' }, { status: 500 });
  }
}
