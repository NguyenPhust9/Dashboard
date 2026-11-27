export const ACCOUNTING_OVERVIEW_URL = 'https://actapp.misa.vn/app/Overview/dashboard';
export const RECEIVABLE_WIDGET_TITLE = 'Nợ phải thu theo hạn nợ';

export interface AccountingOverview {
  generatedAt: string;
  sourceTime?: string;
  receivable: { total: number; overdue: number; current: number };
}

export interface AccountingReceivableResult {
  snapshot: AccountingOverview | null;
  error?: string;
}

// AMIS displays this particular widget in millions, using Vietnamese separators.
// Read only this widget; the adjacent payable widget also has a "Tổng" label.
export function parseReceivableWidget(text: string): AccountingOverview['receivable'] {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const start = normalized.indexOf(RECEIVABLE_WIDGET_TITLE);
  if (start < 0) throw new Error('Không tìm thấy ô Nợ phải thu theo hạn nợ.');
  const widget = normalized.slice(start).split('Nợ phải trả theo hạn nợ')[0];
  const read = (label: string) => {
    const match = new RegExp(`${label}\\s+([0-9]+(?:\\.[0-9]{3})*(?:,[0-9]+)?)\\s*Triệu đồng`, 'iu').exec(widget);
    if (!match) throw new Error(`Không đọc được ${label} trong ô Nợ phải thu theo hạn nợ.`);
    const value = Number(match[1].replace(/\./g, '').replace(',', '.')) * 1_000_000;
    if (!Number.isFinite(value)) throw new Error('Số tiền Kế toán không hợp lệ.');
    return Math.round(value);
  };
  const receivable = { total: read('Tổng'), overdue: read('Quá hạn'), current: read('Trong hạn') };
  // Each of the three figures is independently rounded by AMIS to millions.
  if (Math.abs(receivable.total - receivable.overdue - receivable.current) > 1_000_000) {
    throw new Error('Tổng, quá hạn và trong hạn trên AMIS chưa khớp; chờ tải xong.');
  }
  return receivable;
}

export function isAccountingOverview(value: unknown): value is AccountingOverview {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AccountingOverview>;
  return typeof data.generatedAt === 'string' && Number.isFinite(Date.parse(data.generatedAt))
    && [data.receivable?.total, data.receivable?.overdue, data.receivable?.current]
      .every(amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0);
}

export function latestAccountingOverview(candidates: unknown[]): AccountingOverview | null {
  return candidates.filter(isAccountingOverview)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] ?? null;
}

export function isRecentWidgetTime(time: string, now = new Date()): boolean {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const [hour, minute] = time.split(':').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const currentMinute = Number(parts.find(part => part.type === 'hour')?.value) * 60
    + Number(parts.find(part => part.type === 'minute')?.value);
  return (currentMinute - hour * 60 - minute + 1440) % 1440 <= 1;
}

export function receivableKpi(result: AccountingReceivableResult | null): string[] {
  const snapshot = result?.snapshot;
  if (!snapshot) return ['Còn phải thu', '—', result ? 'Chưa đồng bộ' : 'Đang tải...', 'Tổng · Nợ phải thu theo hạn nợ'];
  const date = new Date(snapshot.generatedAt).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const shortAmount = (amount: number) => {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr`;
    return `${amount.toLocaleString('vi-VN')} ₫`;
  };
  return [
    'Còn phải thu', `${snapshot.receivable.total.toLocaleString('vi-VN')} ₫`,
    `${shortAmount(snapshot.receivable.overdue)} quá hạn`,
    `${shortAmount(snapshot.receivable.current)} trong hạn`,
    `${result?.error ? 'Bản lưu gần nhất' : 'AMIS Kế toán'} · Đọc lúc ${date}`,
  ];
}
