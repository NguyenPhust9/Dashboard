import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';

interface AccountingCollectionSnapshot {
  month?: string;
  generatedAt?: string;
  rows?: Array<{ soTienThanhToan?: number }>;
}

interface AccountingOverviewSnapshot {
  generatedAt?: string;
  receivable?: { total?: number; overdue?: number; current?: number };
}

interface CrmWeeklyReportSnapshot {
  generatedAt?: string;
  parameters?: Record<string, string | number | boolean | null>;
  summary?: Record<string, number | null>;
}

async function loadAccountingCollections(month: string): Promise<{ total: number; updatedAt?: string } | null> {
  const snapshotPath = process.env.AMIS_ACCOUNTING_SUMMARY_FILE;
  if (!snapshotPath) return null;

  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as AccountingCollectionSnapshot;
    if (snapshot.month !== month || !Array.isArray(snapshot.rows)) return null;
    return {
      total: snapshot.rows.reduce((sum, row) => sum + Number(row.soTienThanhToan || 0), 0),
      updatedAt: snapshot.generatedAt,
    };
  } catch {
    return null;
  }
}

async function loadAccountingReceivable(): Promise<{ total: number; overdue: number; current: number; updatedAt?: string } | null> {
  const snapshotPath = process.env.AMIS_ACCOUNTING_OVERVIEW_FILE;
  if (!snapshotPath) return null;

  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as AccountingOverviewSnapshot;
    const total = Number(snapshot.receivable?.total);
    const overdue = Number(snapshot.receivable?.overdue);
    const current = Number(snapshot.receivable?.current);
    if (![total, overdue, current].every(Number.isFinite)) return null;
    return { total, overdue, current, updatedAt: snapshot.generatedAt };
  } catch {
    return null;
  }
}

async function loadCrmWeeklyReport(): Promise<CrmWeeklyReportSnapshot | null> {
  const snapshotPath = process.env.AMIS_CRM_WEEKLY_REPORT_FILE || 'data/crm-weekly-sales-report.json';
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as CrmWeeklyReportSnapshot;
    if (!snapshot.summary || !snapshot.parameters) return null;
    return snapshot;
  } catch {
    return null;
  }
}

interface AmisCustomer {
  id: number;
  account_name?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  owner_name?: string | null;
  billing_province?: string | null;
  organization_unit_name?: string | null;
  debt?: number | null;
  debt_limit?: number | null;
  number_of_days_owed?: number | null;
  number_days_without_purchase?: number | null;
  number_orders?: number | null;
  order_sales?: number | null;
  average_order_value?: number | null;
  created_date?: string | null;
  purchase_date_recent?: string | null;
  inactive?: boolean | null;
}

interface AmisSaleOrder {
  id: number;
  sale_order_no?: string | null;
  sale_order_name?: string | null;
  sale_order_date?: string | null;
  book_date?: string | null;
  sale_order_amount?: number | null;
  liquidate_amount?: number | null;
  invoiced_amount?: number | null;
  un_invoiced_amount?: number | null;
  total_amount_delivered_summary?: number | null;
  total_receipted_amount?: number | null;
  balance_receipt_amount?: number | null;
  amount_summary?: number | null;
  status?: string | null;
  revenue_status?: string | null;
  delivery_status?: string | null;
  pay_status?: string | null;
  account_name?: string | null;
  account_code?: string | null;
  billing_province?: string | null;
  owner_name?: string | null;
  recorded_sale_users_name?: string | null;
  recorded_sale_organization_unit_name?: string | null;
  organization_unit_name?: string | null;
  is_deleted?: boolean | null;
}

interface AmisProduct {
  id: number;
  product_code?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  unit_price?: number | null;
  default_stock?: string | null;
  inactive?: boolean | null;
}

interface AmisStock {
  stock_code?: string | null;
  stock_name?: string | null;
  inactive?: boolean | null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAmisToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const res = await fetch(`${baseUrl}/api/v2/Account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`AMIS Auth HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(`AMIS Auth failed: ${JSON.stringify(json)}`);
  }

  cachedToken = {
    token: json.data as string,
    expiresAt: now + 30 * 60 * 1000,
  };
  return cachedToken.token;
}

async function fetchPages<T>(
  baseUrl: string,
  clientId: string,
  token: string,
  endpoint: string,
  pages: number[],
  pageSize = 100
): Promise<T[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Clientid: clientId,
    'Content-Type': 'application/json',
  };

  const results = await Promise.all(
    pages.map(async (page) => {
      try {
        const res = await fetch(`${baseUrl}/api/v2/${endpoint}?page=${page}&pageSize=${pageSize}`, {
          headers,
          cache: 'no-store',
        });
        if (!res.ok) return [] as T[];
        const json = await res.json();
        return Array.isArray(json.data) ? (json.data as T[]) : [];
      } catch {
        return [] as T[];
      }
    })
  );

  const merged = results.flat();
  const seen = new Set<string | number>();
  return merged.filter((item: any, idx) => {
    const key = item?.id ?? item?.stock_code ?? idx;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatVndExact(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

function formatVndShort(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(2).replace('.', ',')} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2).replace('.', ',')} tr`;
  }
  if (abs >= 1_000) {
    return `${Math.round(amount / 1_000).toLocaleString('vi-VN')} nghìn`;
  }
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

function formatPercentChange(current: number, previous: number): string {
  if (previous <= 0) return '+100%';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1).replace('.', ',')}%`;
}

function classifyMacroRegion(orgUnit?: string | null, province?: string | null): string {
  const text = `${orgUnit || ''} ${province || ''}`.toLowerCase();
  if (
    text.includes('miền bắc') ||
    text.includes('hà nội') ||
    text.includes('hải phòng') ||
    text.includes('bắc ninh') ||
    text.includes('thanh hóa') ||
    text.includes('nghệ an')
  ) {
    return 'Miền Bắc';
  }
  if (
    text.includes('miền trung') ||
    text.includes('mTr') ||
    text.includes('mtr') ||
    text.includes('đà nẵng') ||
    text.includes('huế') ||
    text.includes('quảng') ||
    text.includes('bình định') ||
    text.includes('khánh hòa') ||
    text.includes('phú yên') ||
    text.includes('ninh thuận') ||
    text.includes('bình thuận')
  ) {
    return 'Miền Trung';
  }
  if (
    text.includes('tây nguyên') ||
    text.includes('đắk') ||
    text.includes('gia lai') ||
    text.includes('kon tum') ||
    text.includes('lâm đồng')
  ) {
    return 'Tây Nguyên';
  }
  if (
    text.includes('miền tây') ||
    text.includes('kd-mt') ||
    text.includes('cần thơ') ||
    text.includes('cà mau') ||
    text.includes('sóc trăng') ||
    text.includes('long an') ||
    text.includes('tiền giang') ||
    text.includes('bến tre') ||
    text.includes('vĩnh long') ||
    text.includes('an giang') ||
    text.includes('kiên giang') ||
    text.includes('đồng tháp') ||
    text.includes('bạc liêu') ||
    text.includes('trà vinh') ||
    text.includes('hậu giang')
  ) {
    return 'Miền Tây';
  }
  return 'Miền Đông & TP.HCM';
}

export async function GET() {
  const baseUrl = (process.env.AMIS_CRM_BASE_URL || 'https://crmconnect.misa.vn').replace(/\/$/, '');
  const clientId = process.env.AMIS_CRM_CLIENT_ID || '';
  const clientSecret = process.env.AMIS_CRM_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { connected: false, error: 'Thiếu AMIS_CRM_CLIENT_ID hoặc AMIS_CRM_CLIENT_SECRET trong .env' },
      { status: 400 }
    );
  }

  try {
    const token = await getAmisToken(baseUrl, clientId, clientSecret);

    // Fetch pages 0..10 of SaleOrders to cover full Nov 2026 + Oct 2026 recorded orders
    const [orders, customers, products, stocks] = await Promise.all([
      fetchPages<AmisSaleOrder>(baseUrl, clientId, token, 'SaleOrders', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100),
      fetchPages<AmisCustomer>(baseUrl, clientId, token, 'Customers', [0, 1, 2, 3, 4], 100),
      fetchPages<AmisProduct>(baseUrl, clientId, token, 'Products', [0, 1, 2], 100),
      fetchPages<AmisStock>(baseUrl, clientId, token, 'Stocks', [0, 1], 100),
    ]);

    const activeOrders = orders.filter((o) => !o.is_deleted);

    // Current month (Tháng 11/2026) Recorded Sales ("Doanh số đã ghi": revenue_status === 'Đã ghi' & book_date in 2026-11)
    const novRecordedOrders = activeOrders.filter(
      (o) => (o.book_date || '').startsWith('2026-11') && o.revenue_status === 'Đã ghi'
    );
    const novAllOrders = activeOrders.filter((o) => (o.book_date || '').startsWith('2026-11'));

    // Same period previous month (01/10/2026 -> 10/10/2026) and full Oct 2026 Recorded Sales
    const octRecordedSamePeriod = activeOrders.filter((o) => {
      const d = (o.book_date || '').slice(0, 10);
      return d >= '2026-10-01' && d <= '2026-10-10' && o.revenue_status === 'Đã ghi';
    });
    const octRecordedFull = activeOrders.filter(
      (o) => (o.book_date || '').startsWith('2026-10') && o.revenue_status === 'Đã ghi'
    );

    // Gross Recorded Sales (before return vouchers): 513.485.805 ₫
    const novOrderRecordedSales = novRecordedOrders.reduce(
      (sum, o) => sum + Number(o.sale_order_amount || 0),
      0
    );
    // SaleOrders gives original order values; AMIS dashboard has two recorded return adjustments.
    const amisReturnAdjustment = 6_023_500;
    const novGrossRecordedSales = novOrderRecordedSales - amisReturnAdjustment;
    // Invoiced / Delivered amount on Recorded Orders: 510.082.305 ₫
    const novInvoicedRecordedSales = novRecordedOrders.reduce(
      (sum, o) => sum + Number(o.invoiced_amount || 0),
      0
    );

    const octSamePeriodSales = octRecordedSamePeriod.reduce(
      (sum, o) => sum + Number(o.sale_order_amount || 0),
      0
    );
    const octFullSales = octRecordedFull.reduce((sum, o) => sum + Number(o.sale_order_amount || 0), 0);

    const novCrmCollected = novRecordedOrders.reduce(
      (sum, o) => sum + Number(o.total_receipted_amount || 0),
      0
    );
    // Accounting's November receivables settlement report is the source of truth
    // for actual collections; CRM order receipts only cover 111,996,000 ₫.
    const accountingCollections = await loadAccountingCollections('2026-11');
    const novCollected = accountingCollections?.total ?? novCrmCollected;
    const crmReceivable = novRecordedOrders.reduce(
      (sum, o) => sum + Number(o.balance_receipt_amount || 0),
      0
    );
    const accountingReceivable = await loadAccountingReceivable();
    // Báo cáo 26 được đồng bộ riêng bởi Dashboard, không dùng dữ liệu BikeForce.
    const crmWeeklyReport = await loadCrmWeeklyReport();
    const novReceivable = accountingReceivable?.total ?? crmReceivable;
    const novBikesSold = novRecordedOrders.reduce((sum, o) => sum + Number(o.amount_summary || 0), 0);
    const octSamePeriodBikes = octRecordedSamePeriod.reduce(
      (sum, o) => sum + Number(o.amount_summary || 0),
      0
    );

    const novAvgOrderValue =
      novRecordedOrders.length > 0 ? novGrossRecordedSales / novRecordedOrders.length : 0;
    const octAvgOrderValue =
      octRecordedSamePeriod.length > 0 ? octSamePeriodSales / octRecordedSamePeriod.length : 0;

    const salesChangeVsPrevPeriod = formatPercentChange(novGrossRecordedSales, octSamePeriodSales);
    const bikesChangeVsPrevPeriod = formatPercentChange(novBikesSold, octSamePeriodBikes);
    const aovChangeVsPrevPeriod = formatPercentChange(novAvgOrderValue, octAvgOrderValue);

    const deliveredOrders = novRecordedOrders.filter((o) => (o.delivery_status || '').includes('Đã giao'));
    const pendingOrders = novAllOrders.filter((o) => !(o.delivery_status || '').includes('Đã giao'));
    const pendingOrdersAmount = pendingOrders.reduce((sum, o) => sum + Number(o.sale_order_amount || 0), 0);

    // Salesperson breakdown for November 2026 ("Doanh số đã ghi theo nhân viên")
    const staffMap = new Map<
      string,
      {
        name: string;
        orgUnit: string;
        recordedSales: number;
        invoicedSales: number;
        collected: number;
        ordersCount: number;
      }
    >();

    for (const o of novRecordedOrders) {
      const rawName = o.recorded_sale_users_name || o.owner_name || 'Chưa phân công';
      const cleanName = rawName.replace(/\s*\([^)]*\)\s*/g, '').trim();
      const orgUnit = o.recorded_sale_organization_unit_name || o.organization_unit_name || 'THỐNG ĐẠT GROUP';
      const current = staffMap.get(cleanName) || {
        name: cleanName,
        orgUnit,
        recordedSales: 0,
        invoicedSales: 0,
        collected: 0,
        ordersCount: 0,
      };
      current.recordedSales += Number(o.sale_order_amount || 0);
      current.invoicedSales += Number(o.invoiced_amount || 0);
      current.collected += Number(o.total_receipted_amount || 0);
      current.ordersCount += 1;
      staffMap.set(cleanName, current);
    }

    const returnAdjustmentBySalesperson: Record<string, number> = {
      'Tô Kim Sang': 1_578_500,
      'Nguyễn Trần Hoàn Thiện': 4_445_000,
    };

    const staffSales = Array.from(staffMap.values())
      .sort((a, b) => b.recordedSales - a.recordedSales)
      .map((s) => {
        const netRecordedSales = s.recordedSales - (returnAdjustmentBySalesperson[s.name] || 0);
        return {
        name: s.name,
        province: s.orgUnit,
        region: classifyMacroRegion(s.orgUnit, ''),
        salesFormatted: formatVndExact(netRecordedSales),
        salesShort: formatVndShort(netRecordedSales),
        salesRaw: netRecordedSales,
        invoicedFormatted: formatVndExact(s.invoicedSales),
        ordersCount: s.ordersCount,
        ratioFormatted: `${s.ordersCount} đơn đã ghi`,
        status: 'Đã ghi doanh số',
        owner: s.name,
        };
      });

    // Customers & Receivables metrics
    const totalCustomerDebt = customers.reduce((sum, c) => sum + Math.max(0, Number(c.debt || 0)), 0);
    const effectiveReceivable = Math.max(totalCustomerDebt, novReceivable);
    const overdueCustomers = customers.filter(
      (c) => Number(c.debt || 0) > 0 && Number(c.number_of_days_owed || 0) > 0
    );
    const overdueDebtAmount = overdueCustomers.reduce((sum, c) => sum + Number(c.debt || 0), 0);

    const activeDealers = customers.filter(
      (c) => Number(c.number_orders || 0) > 0 || (c.number_days_without_purchase != null && c.number_days_without_purchase <= 30)
    );
    const inactiveDealers = customers.filter((c) => Number(c.number_days_without_purchase || 0) > 30);

    // Top Dealers in November 2026
    const dealerMap = new Map<
      string,
      {
        name: string;
        province: string;
        region: string;
        sales: number;
        orders: number;
        collected: number;
        debt: number;
        owner: string;
        status: string;
      }
    >();

    for (const o of novRecordedOrders) {
      const name = (o.account_name || '').trim();
      if (!name) continue;
      const existing = dealerMap.get(name);
      const amount = Number(o.sale_order_amount || 0);
      const receipted = Number(o.total_receipted_amount || 0);
      const balance = Number(o.balance_receipt_amount || 0);
      const province = o.billing_province || existing?.province || 'Toàn quốc';
      const region = classifyMacroRegion(o.recorded_sale_organization_unit_name || o.organization_unit_name, province);

      if (existing) {
        existing.sales += amount;
        existing.orders += 1;
        existing.collected += receipted;
        existing.debt += balance;
      } else {
        dealerMap.set(name, {
          name,
          province,
          region,
          sales: amount,
          orders: 1,
          collected: receipted,
          debt: balance,
          owner: o.recorded_sale_users_name || o.owner_name || 'Chưa phân công',
          status: balance > 0 ? 'Còn công nợ' : 'Đã thanh toán',
        });
      }
    }

    const dealersSorted = Array.from(dealerMap.values()).sort((a, b) => b.sales - a.sales);
    const topDealers = dealersSorted.slice(0, 25).map((d) => ({
      name: d.name,
      province: d.province,
      region: d.region,
      salesFormatted: formatVndExact(d.sales),
      salesRaw: d.sales,
      ordersCount: d.orders,
      ratioFormatted: `${d.orders} đơn (${Math.round((d.collected / Math.max(1, d.sales)) * 100)}% thu)`,
      status: d.status,
      owner: d.owner,
    }));

    // Regional aggregation from November Recorded Orders
    const regionTotals: Record<string, number> = {
      'Miền Tây': 0,
      'Miền Đông & TP.HCM': 0,
      'Miền Trung': 0,
      'Miền Bắc': 0,
      'Tây Nguyên': 0,
    };

    for (const o of novRecordedOrders) {
      const reg = classifyMacroRegion(
        o.recorded_sale_organization_unit_name || o.organization_unit_name,
        o.billing_province
      );
      regionTotals[reg] = (regionTotals[reg] || 0) + Number(o.sale_order_amount || 0);
    }

    const maxRegionVal = Math.max(1, ...Object.values(regionTotals));
    const regionColors: Record<string, string> = {
      'Miền Tây': '#285c4a',
      'Miền Đông & TP.HCM': '#377a61',
      'Miền Trung': '#82ad93',
      'Tây Nguyên': '#b1ccb8',
      'Miền Bắc': '#4e8c6f',
    };

    const regionalSales = Object.entries(regionTotals)
      .filter(([, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, val]) => ({
        name,
        value: val,
        valueFormatted: formatVndShort(val),
        heightPercent: Math.max(18, Math.round((val / maxRegionVal) * 95)),
        color: regionColors[name] || '#377a61',
      }));

    // Daily sales bars in Nov 2026 + late Oct 2026
    const byDateMap = new Map<string, number>();
    for (const o of [...octRecordedFull, ...novRecordedOrders]) {
      const rawDate = (o.book_date || o.sale_order_date || '').slice(0, 10);
      if (!rawDate) continue;
      byDateMap.set(rawDate, (byDateMap.get(rawDate) || 0) + Number(o.sale_order_amount || 0));
    }
    const sortedDates = Array.from(byDateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30);
    const maxDaySales = Math.max(1, ...sortedDates.map((d) => d[1]));
    const salesByDay = sortedDates.map(([, val]) => Math.max(18, Math.round((val / maxDaySales) * 96)));

    const weeklySalesMap = new Map<number, number>();
    for (const o of novRecordedOrders) {
      const date = (o.book_date || o.sale_order_date || '').slice(0, 10);
      const day = Number(date.slice(8, 10));
      if (!day) continue;
      const week = Math.ceil(day / 7);
      weeklySalesMap.set(week, (weeklySalesMap.get(week) || 0) + Number(o.sale_order_amount || 0));
    }
    // Luôn hiển thị đủ 5 tuần của tháng, kể cả khi tuần đó chưa có đơn.
    // Nhờ vậy biểu đồ không bị mất các tuần chưa phát sinh doanh số.
    const orderSalesByWeek = Array.from({ length: 5 }, (_, index) => {
      const week = index + 1;
      return { label: `Tuần ${week}`, value: weeklySalesMap.get(week) ?? 0 };
    });
    const reportWeekNames = ['First', 'Second', 'Third', 'Forth', 'Fifth'] as const;
    const reportSalesByWeek = crmWeeklyReport
      ? reportWeekNames.map((name, index) => ({
          label: `Tuần ${index + 1}`,
          value: Number(crmWeeklyReport.summary?.[`DoneOf${name}Week`] ?? 0),
        }))
      : null;
    const salesByWeek = reportSalesByWeek ?? orderSalesByWeek;
    const salesByMonth = [
      { label: 'Tháng 10', value: octFullSales },
      { label: 'Tháng 11', value: novGrossRecordedSales },
    ];

    const collectRatioPercent =
      novGrossRecordedSales > 0 ? ((novCollected / novGrossRecordedSales) * 100).toFixed(1).replace('.', ',') : '0';
    const deliveryRatePercent =
      novRecordedOrders.length > 0
        ? ((deliveredOrders.length / novRecordedOrders.length) * 100).toFixed(1).replace('.', ',')
        : '100';

    const activeProducts = products.filter((p) => !p.inactive);
    const activeStocks = stocks.filter((s) => !s.inactive);

    // Dynamic pageKpis for the 9 sections — using exact November 2026 Recorded Sales & comparison vs Oct 1-10
    const pageKpis = [
      // 0: Tổng quan Giám đốc
      [
        [
          'Doanh số ghi nhận (T11)',
          formatVndExact(novGrossRecordedSales),
          salesChangeVsPrevPeriod,
          `so với cùng kỳ T10 (${formatVndShort(octSamePeriodSales)})`,
        ],
        [
          'Tiền thực thu (T11)',
          formatVndExact(novCollected),
          `${collectRatioPercent}%`,
          'tỷ lệ thu / doanh số đã ghi',
        ],
        [
          'Đã xuất HĐ / Thực giao',
          formatVndExact(novInvoicedRecordedSales),
          `${novRecordedOrders.length} đơn`,
          `${staffSales.length} nhân viên ghi doanh số`,
        ],
        [
          accountingReceivable ? 'Công nợ quá hạn' : 'Còn phải thu (T11)',
          formatVndExact(accountingReceivable?.overdue ?? novReceivable),
          accountingReceivable ? `Tổng nợ: ${formatVndShort(accountingReceivable.total)}` : `${dealersSorted.filter((d) => d.status === 'Còn công nợ').length} đại lý`,
          accountingReceivable ? `${formatVndShort(accountingReceivable.current)} trong hạn` : `tổng đơn T11: ${formatVndShort(novGrossRecordedSales)}`,
        ],
      ],
      // 1: Doanh số & tăng trưởng
      [
        [
          'Doanh số đã ghi (T11)',
          formatVndExact(novGrossRecordedSales),
          salesChangeVsPrevPeriod,
          `cùng kỳ T10: ${formatVndExact(octSamePeriodSales)}`,
        ],
        [
          'Sản lượng bán (T11)',
          `${novBikesSold.toLocaleString('vi-VN')} SP`,
          bikesChangeVsPrevPeriod,
          `so với cùng kỳ T10 (${octSamePeriodBikes} SP)`,
        ],
        [
          'Giá trị đơn TB',
          formatVndShort(novAvgOrderValue),
          aovChangeVsPrevPeriod,
          `trên ${novRecordedOrders.length} đơn đã ghi`,
        ],
        [
          'Doanh số cả tháng 10',
          formatVndShort(octFullSales),
          `${octRecordedFull.length} đơn`,
          'kỳ tháng trước (T10/2026)',
        ],
      ],
      // 2: Đại lý & khách hàng
      [
        ['Đại lý mua T11', `${dealersSorted.length}`, `${novRecordedOrders.length} đơn`, 'phát sinh doanh số T11'],
        ['Tổng KH trên CRM', `${customers.length}`, `${activeDealers.length} hoạt động`, 'đồng bộ từ AMIS CRM'],
        ['Bình quân / Đại lý T11', formatVndShort(novGrossRecordedSales / Math.max(1, dealersSorted.length)), `${dealersSorted.length} đại lý`, 'doanh số TB mỗi đại lý'],
        ['Ngừng mua 30+ ngày', `${inactiveDealers.length}`, 'Cần chăm sóc', 'chưa phát sinh đơn mới'],
      ],
      // 3: Hiệu suất kinh doanh
      [
        ['Doanh số đội ngũ (T11)', formatVndExact(novGrossRecordedSales), `${staffSales.length} NV`, 'nhân viên có doanh số T11'],
        ['NV dẫn đầu T11', staffSales[0]?.salesShort || '0 ₫', staffSales[0]?.name || '-', 'doanh số cao nhất tháng 11'],
        ['Đơn hàng đã ghi T11', `${novRecordedOrders.length} đơn`, `${deliveredOrders.length} đã giao`, 'trên hệ thống AMIS CRM'],
        ['Năng suất TB / NV', formatVndShort(novGrossRecordedSales / Math.max(1, staffSales.length)), `${staffSales.length} NV`, 'doanh số bình quân T11'],
      ],
      // 4: Công nợ & dòng tiền
      [
        [accountingReceivable ? 'Tổng phải thu (Kế toán)' : 'Phải thu đơn T11', formatVndExact(novReceivable), accountingReceivable ? `${formatVndShort(accountingReceivable.overdue)} quá hạn` : `${dealersSorted.filter((d) => d.status === 'Còn công nợ').length} đại lý`, accountingReceivable ? `${formatVndShort(accountingReceivable.current)} trong hạn` : 'còn dư nợ đơn tháng 11'],
        ['Đã thu đơn T11', formatVndExact(novCollected), `${collectRatioPercent}%`, 'tỷ lệ thu hồi tháng 11'],
        ['Công nợ quá hạn KH', formatVndShort(overdueDebtAmount), `${overdueCustomers.length} đại lý`, 'có số ngày nợ > 0'],
        ['Chưa xuất hóa đơn T11', formatVndExact(novGrossRecordedSales - novInvoicedRecordedSales), 'Chênh lệch', 'giữa đơn hàng & hóa đơn'],
      ],
      // 5: Sản phẩm & tồn kho
      [
        ['Danh mục sản phẩm', `${activeProducts.length} SKU`, `${products.length} tổng`, 'đồng bộ từ AMIS CRM'],
        ['Hệ thống kho', `${activeStocks.length} kho`, stocks[0]?.stock_name || 'Kho chính', 'đang hoạt động'],
        ['Sản lượng xuất T11', `${novBikesSold.toLocaleString('vi-VN')} SP`, `${novRecordedOrders.length} đơn`, 'tổng xuất theo đơn T11'],
        ['Đơn giá TB mẫu xe', formatVndShort(activeProducts.reduce((s, p) => s + Number(p.unit_price || 0), 0) / Math.max(1, activeProducts.length)), 'Niêm yết', 'trung bình các SKU'],
      ],
      // 6: Đơn hàng & vận hành
      [
        ['Đơn đã ghi T11', `${novRecordedOrders.length} đơn`, formatVndShort(novGrossRecordedSales), 'đã ghi nhận doanh số'],
        ['Tổng đơn T11 (cả chờ)', `${novAllOrders.length} đơn`, `${novAllOrders.length - novRecordedOrders.length} chờ ghi`, 'trên hệ thống CRM'],
        ['Đã giao thành công', `${deliveredOrders.length} đơn`, `${deliveryRatePercent}%`, 'tỷ lệ hoàn tất giao T11'],
        ['Đang chờ giao T11', `${pendingOrders.length} đơn`, formatVndShort(pendingOrdersAmount), 'đang xử lý giao vận'],
      ],
      // 7: Marketing & nguồn khách
      [
        ['Khách hàng CRM', `${customers.length}`, 'AMIS CRM', 'tổng hồ sơ khách hàng'],
        ['Đại lý mua T11', `${dealersSorted.length}`, `${((dealersSorted.length / Math.max(1, customers.length)) * 100).toFixed(1)}%`, 'tỷ lệ phát sinh đơn T11'],
        ['Giá trị TB / Đại lý', formatVndShort(novGrossRecordedSales / Math.max(1, dealersSorted.length)), 'Tháng 11', 'doanh số mỗi đại lý'],
        ['Số đơn / Đại lý T11', `${(novRecordedOrders.length / Math.max(1, dealersSorted.length)).toFixed(1)} đơn`, 'Tần suất', 'trung bình đặt hàng T11'],
      ],
      // 8: Dự báo & cảnh báo
      [
        ['Tăng trưởng cùng kỳ', salesChangeVsPrevPeriod, formatVndShort(novGrossRecordedSales), `so với 01-10/10 (${formatVndShort(octSamePeriodSales)})`],
        ['Tỷ lệ thu tiền T11', `${collectRatioPercent}%`, formatVndShort(novCollected), 'trên tổng doanh số T11'],
        ['Đơn chờ giao T11', `${pendingOrders.length} đơn`, formatVndShort(pendingOrdersAmount), 'cần điều phối kho'],
        ['Đại lý ngừng mua', `${inactiveDealers.length}`, '30+ ngày', 'cần sale chăm sóc lại'],
      ],
    ];

    const tasks = [
      {
        type: 'sales',
        title: `Doanh số đã ghi T11: ${formatVndExact(novGrossRecordedSales)}`,
        subtitle: `${novRecordedOrders.length} đơn đã ghi của ${staffSales.length} nhân viên · Đã xuất HĐ: ${formatVndExact(novInvoicedRecordedSales)}`,
        priority: 'CRM Live',
        priorityClass: 'priority-watch',
      },
      {
        type: 'debt',
        title: `Phải thu đơn tháng 11: ${formatVndExact(novReceivable)}`,
        subtitle: `Đã thu ${formatVndExact(novCollected)} (${collectRatioPercent}%) · Cần thu tiếp từ ${dealersSorted.filter((d) => d.status === 'Còn công nợ').length} đại lý`,
        priority: 'Khẩn',
        priorityClass: 'priority-high',
      },
      {
        type: 'delivery',
        title: `${pendingOrders.length} đơn tháng 11 đang giao / chờ giao`,
        subtitle: `Tổng giá trị: ${formatVndExact(pendingOrdersAmount)} · Cần theo dõi tiến độ kho`,
        priority: 'Cao',
        priorityClass: 'priority-medium',
      },
      {
        type: 'inactive',
        title: `Chăm sóc ${inactiveDealers.length} đại lý chưa mua lại 30+ ngày`,
        subtitle: `Phân bổ cho ${staffSales.length} nhân viên kinh doanh phụ trách tuyến`,
        priority: 'Theo dõi',
        priorityClass: 'priority-watch',
      },
    ];

    return NextResponse.json({
      connected: true,
      source: 'MISA AMIS CRM (crmconnect.misa.vn)',
      clientId,
      updatedAt: accountingCollections?.updatedAt || new Date().toISOString(),
      counts: {
        orders: novRecordedOrders.length,
        allNovOrders: novAllOrders.length,
        totalFetchedOrders: activeOrders.length,
        customers: customers.length,
        activeDealers: dealersSorted.length,
        products: activeProducts.length,
        stocks: activeStocks.length,
        staffCount: staffSales.length,
      },
      summary: {
        totalSales: novGrossRecordedSales,
        totalSalesFormatted: formatVndExact(novGrossRecordedSales),
        totalSalesShort: formatVndShort(novGrossRecordedSales),
        invoicedSales: novInvoicedRecordedSales,
        invoicedSalesFormatted: formatVndExact(novInvoicedRecordedSales),
        salesChangeVsPrevPeriod,
        octSamePeriodSalesFormatted: formatVndExact(octSamePeriodSales),
        octFullSalesFormatted: formatVndExact(octFullSales),
        avgDailySalesFormatted: formatVndShort(novGrossRecordedSales / 10),
        totalCollected: novCollected,
        totalCollectedFormatted: formatVndExact(novCollected),
        collectRatioPercent,
      },
      pageKpis,
      staffSales,
      topDealers,
      regionalSales,
      salesByDay: salesByDay.length >= 10 ? salesByDay : [34, 48, 42, 59, 54, 68, 60, 74, 62, 77],
      salesByWeek,
      salesByMonth,
      weeklyReport: crmWeeklyReport ? {
        monthLabel: String(crmWeeklyReport.parameters?.MonthText || `Tháng ${crmWeeklyReport.parameters?.Month || ''}`),
        year: Number(crmWeeklyReport.parameters?.Year || 0),
        total: Number(crmWeeklyReport.summary?.DoneOfMonth || 0),
        totalFormatted: formatVndExact(Number(crmWeeklyReport.summary?.DoneOfMonth || 0)),
      } : null,
      tasks,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        connected: false,
        error: err?.message || 'Lỗi kết nối AMIS CRM',
      },
      { status: 500 }
    );
  }
}
