import { readFileSync } from 'node:fs';

const sourceEnvPath = process.env.BIKEFORCE_AMIS_ENV_FILE ||
  'C:/Users/Acer/Downloads/BikeForce-Bicycle-Sales-Management/BikeForce-Bicycle-Sales-Management/scripts/amis-sync/.env';

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function requestedMonth() {
  const index = process.argv.indexOf('--month');
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Cần truyền --month YYYY-MM.');
  return value;
}

function nextMonth(month) {
  const [year, value] = month.split('-').map(Number);
  return value === 12 ? `${year + 1}-01-01` : `${year}-${String(value + 1).padStart(2, '0')}-01`;
}

async function getAllOrderLines(url, key, month) {
  const rows = [];
  const params = new URLSearchParams({
    select: 'line_total,products(product_name,product_code),orders!inner(order_date,status)',
    'orders.order_date': `gte.${month}-01`,
    'orders.order_date': `lt.${nextMonth(month)}`,
    'orders.status': 'eq.Đã ghi',
    order: 'id.asc',
  });

  for (let start = 0; start < 100_000; start += 1_000) {
    const response = await fetch(`${url}/rest/v1/order_lines?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${start}-${start + 999}`, Prefer: 'count=exact' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`BikeForce order_lines HTTP ${response.status}. Cần cấp quyền SELECT cho service_role.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('BikeForce trả về dữ liệu order_lines không hợp lệ.');
    rows.push(...page);
    if (page.length < 1_000) return rows;
  }
  throw new Error('Số dòng đơn hàng vượt giới hạn an toàn.');
}

async function main() {
  const month = requestedMonth();
  const env = readEnv(sourceEnvPath);
  const bikeforceUrl = (env.BIKEFORCE_SUPABASE_URL || '').replace(/\/$/, '');
  const bikeforceKey = env.BIKEFORCE_SERVICE_ROLE_KEY || '';
  const reportUrl = env.DASHBOARD_REPORT26_SYNC_URL || '';
  const syncUrl = reportUrl.replace(/\/amis-report-sync$/, '/amis-product-sales-sync');
  const secret = env.DASHBOARD_REPORT_SYNC_SECRET || '';
  if (!bikeforceUrl || !bikeforceKey || !syncUrl || !secret) throw new Error('Thiếu cấu hình BikeForce hoặc Dashboard trong scripts/amis-sync/.env.');

  const totals = new Map();
  for (const line of await getAllOrderLines(bikeforceUrl, bikeforceKey, month)) {
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    const name = typeof product?.product_name === 'string' ? product.product_name.trim() : '';
    const value = Number(line.line_total || 0);
    if (!name || !Number.isFinite(value) || value <= 0) continue;
    totals.set(name, { name, value: (totals.get(name)?.value || 0) + value, productCategoryId: 0, misaCode: typeof product?.product_code === 'string' ? product.product_code : '' });
  }

  const rows = [...totals.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  if (!rows.length) throw new Error(`Không có doanh số hàng hóa đã ghi cho ${month}.`);
  const publish = await fetch(syncUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-amis-report-sync-secret': secret },
    body: JSON.stringify({ month, generatedAt: new Date().toISOString(), parameters: { source: 'BikeForce orders synced from AMIS CRM', status: 'Đã ghi' }, rows }), cache: 'no-store',
  });
  if (!publish.ok) throw new Error(`Dashboard doanh số theo hàng hóa HTTP ${publish.status}.`);
  console.log(`Đã đồng bộ ${rows.length} dòng hàng hóa ${month} sang Dashboard.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
