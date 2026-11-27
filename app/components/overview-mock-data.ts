// Mockup only. Replace these fixtures when the data sources are confirmed.
export const overviewMockData = {
  inactiveDealers: [
    { name: 'Đại lý F', owner: 'Nhân viên A', days: 123, lastOrder: '27/07' },
    { name: 'Đại lý G', owner: 'Nhân viên B', days: 86, lastOrder: '02/09' },
    { name: 'Đại lý H', owner: 'Nhân viên C', days: 62, lastOrder: '26/09' },
    { name: 'Đại lý I', owner: 'Nhân viên D', days: 35, lastOrder: '23/10' },
  ],
  overdueDealers: [
    { name: 'Đại lý A', amount: 385_000_000, age: '>90 ngày', owner: 'Nhân viên A' },
    { name: 'Đại lý J', amount: 268_000_000, age: '61–90 ngày', owner: 'Nhân viên E' },
    { name: 'Đại lý K', amount: 192_000_000, age: '31–60 ngày', owner: 'Nhân viên B' },
    { name: 'Đại lý L', amount: 145_000_000, age: '1–30 ngày', owner: 'Nhân viên C' },
    { name: 'Đại lý M', amount: 98_000_000, age: '31–60 ngày', owner: 'Nhân viên D' },
    { name: 'Đại lý N', amount: 72_000_000, age: '1–30 ngày', owner: 'Nhân viên F' },
  ],
  models: [
    { name: 'Mẫu M1', sold: 186, stock: 42 },
    { name: 'Mẫu M2', sold: 154, stock: 36 },
    { name: 'Mẫu M3', sold: 128, stock: 58 },
    { name: 'Mẫu M4', sold: 96, stock: 24 },
    { name: 'Mẫu M5', sold: 82, stock: 31 },
  ],
  funnel: { opportunities: 240, quotes: 192, orders: 120 },
  agedStock: [
    { sku: 'SKU-001', quantity: 28, cost: 168_000_000 },
    { sku: 'SKU-002', quantity: 19, cost: 123_500_000 },
    { sku: 'SKU-003', quantity: 15, cost: 97_500_000 },
    { sku: 'SKU-004', quantity: 12, cost: 72_000_000 },
    { sku: 'SKU-005', quantity: 8, cost: 48_000_000 },
  ],
};
