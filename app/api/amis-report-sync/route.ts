import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRestRequest } from '@/lib/supabase';

type Report26Payload = {
  month: string;
  generatedAt: string;
  parameters: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: unknown[];
};

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function isReport26Payload(value: unknown): value is Report26Payload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<Report26Payload>;
  return (
    typeof payload.month === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month) &&
    typeof payload.generatedAt === 'string' &&
    Boolean(payload.parameters && typeof payload.parameters === 'object') &&
    Boolean(payload.summary && typeof payload.summary === 'object') &&
    Array.isArray(payload.rows)
  );
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.AMIS_REPORT_SYNC_SECRET || '';
  const receivedSecret = request.headers.get('x-amis-report-sync-secret') || '';
  if (!expectedSecret || !secretsMatch(receivedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Payload JSON không hợp lệ.' }, { status: 400 });
  }
  if (!isReport26Payload(payload) || Number.isNaN(Date.parse(payload.generatedAt))) {
    return NextResponse.json({ error: 'Payload Report 26 không hợp lệ.' }, { status: 400 });
  }

  try {
    await supabaseRestRequest('amis_report26_snapshots', {
      method: 'POST',
      query: 'on_conflict=period_month',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        period_month: `${payload.month}-01`,
        generated_at: payload.generatedAt,
        payload,
        updated_at: new Date().toISOString(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Không thể lưu snapshot Report 26.' }, { status: 500 });
  }
}
