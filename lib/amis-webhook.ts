import { createHash, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_MAX_BYTES = 1024 * 1024;

export class WebhookInputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function matchesSecret(received: string | null, expected: string): boolean {
  if (!expected || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function webhookAuthFailure(header: string | null, secret: string): 'missing' | 'format' | 'mismatch' | null {
  if (!header) return 'missing';
  const token = header.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return 'format';
  return matchesSecret(token, secret) ? null : 'mismatch';
}

export function authorizedWebhook(header: string | null, secret: string): boolean {
  return webhookAuthFailure(header, secret) === null;
}

/** Stop reading at the limit, including chunked requests without Content-Length. */
export async function readWebhookJson(request: Request, maximumBytes = WEBHOOK_MAX_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maximumBytes) throw new WebhookInputError('Payload too large.', 413);
  if (!request.body) throw new WebhookInputError('A JSON payload is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new WebhookInputError('Payload too large.', 413);
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (value === null || typeof value !== 'object') throw new WebhookInputError('A JSON object or array is required.');
    return value;
  } catch (error) {
    if (error instanceof WebhookInputError) throw error;
    throw new WebhookInputError('Invalid JSON payload.');
  } finally {
    reader.releaseLock();
  }
}

/** Stable digest used to recognize duplicate deliveries without logging payloads. */
export function webhookDigest(payload: unknown): string {
  let entries = 0;
  const canonical = (value: unknown, depth: number): string => {
    if (depth > 32 || ++entries > 50000) throw new WebhookInputError('Payload is too complex.');
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key], depth + 1)}`).join(',')}}`;
  };
  return createHash('sha256').update(canonical(payload, 0)).digest('hex');
}

export interface WebhookPayloadSchema {
  version: 1;
  fields: { path: string; type: string }[];
  arrays: { path: string; length: number }[];
  unknownKeys: number;
  truncated: boolean;
  layoutCodes: ('account' | 'sale_order')[];
  actions: (1 | 2)[];
}

// Names from the public AMIS CRM webhook/SaleOrder contracts. Unknown keys may
// themselves contain customer data, so neither their names nor values are kept.
const webhookSchemaKeys = new Set([
  'layout_code', 'action', 'objects', 'id', 'book_date', 'sale_order_date',
  'revenue_status', 'sale_order_amount', 'total_summary', 'liquidate_amount',
  'recorded_sale_users_name', 'recorded_sale_organization_unit_name',
  'customer_code', 'customer_name', 'employee_code', 'owner_name',
]);

/** Bounded schema diagnostics only: no names, IDs, dates, amounts or other values. */
export function webhookPayloadSchema(payload: unknown): WebhookPayloadSchema {
  const schema: WebhookPayloadSchema = {
    version: 1, fields: [], arrays: [], unknownKeys: 0, truncated: false, layoutCodes: [], actions: [],
  };
  const seen = new Set<string>();
  let visited = 0;
  const inspect = (value: unknown, path: string, depth: number) => {
    if (depth > 5 || path.length > 160 || ++visited > 500) { schema.truncated = true; return; }
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const identity = `${path}:${type}`;
    if (!seen.has(identity)) {
      if (schema.fields.length >= 100) { schema.truncated = true; return; }
      seen.add(identity);
      schema.fields.push({ path, type });
    }
    if (Array.isArray(value)) {
      if (schema.arrays.length < 20) schema.arrays.push({ path, length: value.length });
      else schema.truncated = true;
      // Sample shapes; the original count is retained, never the actual rows.
      if (value.length > 20) schema.truncated = true;
      for (const item of value.slice(0, 20)) inspect(item, `${path}[]`, depth + 1);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (!webhookSchemaKeys.has(key)) { schema.unknownKeys += 1; continue; }
      // Only documented, finite enums are safe to retain as metadata.
      if (key === 'layout_code' && (item === 'account' || item === 'sale_order') && !schema.layoutCodes.includes(item)) {
        schema.layoutCodes.push(item);
      }
      if (key === 'action' && (item === 1 || item === 2) && !schema.actions.includes(item)) schema.actions.push(item);
      inspect(item, `${path}.${key}`, depth + 1);
    }
  };
  inspect(payload, '$', 0);
  return schema;
}

export function vietnamMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/**
 * Until AMIS's business-date fields are verified, any authenticated event is an
 * invalidation of the current month. Unknown dates must not select other months.
 * The webhook is never treated as the source of ranking amounts.
 */
export function webhookMonths(_payload: unknown, now: Date = new Date()): string[] {
  return [vietnamMonth(now)];
}

export interface WebhookJob {
  month: string;
  leaseToken: string;
  revision: number;
  attempt: number;
}

export type WebhookJobAction = { action: 'claim' } | {
  action: 'complete' | 'fail'; month: string; leaseToken: string; revision: number;
};

export function parseWebhookJobAction(value: unknown, now = new Date()): WebhookJobAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebhookInputError('Invalid worker action.');
  const body = value as Record<string, unknown>;
  if (body.action === 'claim') return { action: 'claim' };
  if ((body.action !== 'complete' && body.action !== 'fail')
    || typeof body.month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(body.month)
    || body.month > vietnamMonth(now)
    || typeof body.leaseToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.leaseToken)
    || typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 1) {
    throw new WebhookInputError('Invalid worker action.');
  }
  return { action: body.action, month: body.month, leaseToken: body.leaseToken, revision: body.revision };
}
