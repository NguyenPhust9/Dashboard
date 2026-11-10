/**
 * Supabase REST & Database helper for Abraham Bike Dashboard.
 * Supports both new Supabase API keys (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY)
 * and legacy keys (NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).
 */

export function getSupabaseConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  const hasValidPublishable =
    Boolean(publishableKey) &&
    publishableKey !== 'sb_publishable_...' &&
    publishableKey !== 'your-anon-public-key';
  const hasValidSecret =
    Boolean(secretKey) &&
    secretKey !== 'sb_secret_...' &&
    secretKey !== 'your-service-role-secret-key';

  const isConfigured =
    Boolean(url) &&
    !url.includes('your-project-id') &&
    (hasValidPublishable || hasValidSecret);

  return {
    url,
    publishableKey,
    secretKey,
    apiKey: hasValidSecret ? secretKey : publishableKey,
    isConfigured,
  };
}

export async function supabaseRestRequest<T = unknown>(
  tableOrPath: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<T> {
  const { url, apiKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) {
    throw new Error('Chưa cấu hình NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY hoặc SUPABASE_SECRET_KEY trong .env');
  }

  const querySuffix = options.query ? `?${options.query.replace(/^\?/, '')}` : '';
  const endpoint = `${url}/rest/v1/${tableOrPath.replace(/^\//, '')}${querySuffix}`;

  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const res = await fetch(endpoint, {
    method: 'GET',
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase HTTP ${res.status}: ${errText}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
