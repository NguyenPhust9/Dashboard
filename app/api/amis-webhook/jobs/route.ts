import { NextRequest, NextResponse } from 'next/server';
import { matchesSecret, parseWebhookJobAction, readWebhookJson, WebhookInputError, type WebhookJob } from '@/lib/amis-webhook';
import { getSupabaseConfig, supabaseRestRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!matchesSecret(request.headers.get('x-amis-report-sync-secret'), process.env.AMIS_REPORT_SYNC_SECRET || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!getSupabaseConfig().secretKey) return NextResponse.json({ error: 'Queue storage is not configured.' }, { status: 503 });
  try {
    const action = parseWebhookJobAction(await readWebhookJson(request, 4096));
    if (action.action === 'claim') {
      const job = await supabaseRestRequest<WebhookJob | null>('rpc/amis_webhook_claim', { method: 'POST', body: {} });
      return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const accepted = await supabaseRestRequest<boolean>('rpc/amis_webhook_finish', {
      method: 'POST', body: {
        job_month: `${action.month}-01`, job_lease: action.leaseToken,
        job_revision: action.revision, job_success: action.action === 'complete',
      },
    });
    if (!accepted) return NextResponse.json({ error: 'Job lease is stale or expired.' }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof WebhookInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to access the CRM refresh queue.' }, { status: 503 });
  }
}
