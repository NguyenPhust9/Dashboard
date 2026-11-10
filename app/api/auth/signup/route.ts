import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.' },
        { status: 400 }
      );
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const secretKey =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !secretKey || secretKey === 'sb_secret_...') {
      return NextResponse.json(
        { error: 'Thiếu SUPABASE_SECRET_KEY trong file .env' },
        { status: 500 }
      );
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.msg || data?.message || 'Không thể tạo tài khoản trên Supabase' },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, user: { id: data.id, email: data.email } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Lỗi server khi tạo tài khoản' },
      { status: 500 }
    );
  }
}
