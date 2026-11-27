import { createBrowserClient } from '@supabase/ssr';

export type RankingKind = 'staff' | 'customers';

let subscriptionId = 0;

/** Only subscribe to update metadata; customer/staff snapshots stay behind the API. */
export function subscribeToRankingUpdates(month: string, kind: RankingKind, refresh: () => void) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key || typeof window === 'undefined') return () => {};

  let active = true;
  try {
    const client = createBrowserClient(url, key);
    const channel = client.channel(`ranking:${month}:${kind}:${++subscriptionId}`, {
      config: { postgres_changes_options: { wait: true } },
    }).on('postgres_changes', {
      event: '*', schema: 'public', table: 'amis_ranking_updates', filter: `period_month=eq.${month}-01`,
    }, payload => {
      if (!active || payload.eventType === 'DELETE') return;
      if (payload.new.period_month === `${month}-01` && payload.new.kind === kind) refresh();
    }).subscribe(status => {
      // Reconcile anything missed whenever the realtime connection is established.
      if (active && status === 'SUBSCRIBED') refresh();
    });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  } catch {
    // The existing API polling remains usable if realtime is not configured.
    return () => { active = false; };
  }
}

/** Coalesce updates during a fetch, then read again so the last event cannot be lost. */
export function createRankingRefresh(load: (signal: AbortSignal) => Promise<void>, intervalMs = 60_000, timeoutMs = 45_000) {
  let active = true;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const run = async () => {
    if (!active) return;
    clearTimeout(timer);
    if (running) {
      pending = true;
      return;
    }
    running = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      await load(controller.signal);
    } finally {
      clearTimeout(timeout);
      running = false;
      if (active) {
        if (pending) {
          pending = false;
          void run();
        } else {
          timer = setTimeout(() => void run(), intervalMs);
        }
      }
    }
  };

  return {
    refresh: () => { void run(); },
    stop: () => {
      active = false;
      pending = false;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
