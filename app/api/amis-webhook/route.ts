import { NextRequest, NextResponse } from 'next/server';
import { authorizedWebhook, readWebhookJson, webhookDigest, webhookMonths, WebhookInputError } from '@/lib/amis-webhook';
import { getSupabaseConfig, supabaseRestRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Acknowledge only after the refresh job is durably committed; never run Chrome here. */
export async function POST(request: NextRequest) {
  const secret = process.env.AMIS_WEBHOOK_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Webhook is not configured.' }, { status: 503 });
  if (!authorizedWebhook(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!getSupabaseConfig().secretKey) return NextResponse.json({ success: false, error: 'Webhook storage is not configured.' }, { status: 503 });

  try {
    const payload = await readWebhookJson(request);
    await supabaseRestRequest('rpc/amis_webhook_enqueue', {
      method: 'POST',
      body: { event_digest: webhookDigest(payload), event_months: webhookMonths(payload).map(month => `${month}-01`) },
    });
    return NextResponse.json({ success: true, code: 200 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof WebhookInputError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    // A non-2xx result allows CRM to retry. Do not claim success when storage failed.
    return NextResponse.json({ success: false, error: 'Unable to queue CRM refresh.' }, { status: 503 });
  }
}
