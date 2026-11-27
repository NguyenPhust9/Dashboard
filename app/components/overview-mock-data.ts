// Mockup only. Replace these fixtures when the data sources are confirmed.
export const overviewMockData = {
  staff: [
    { name: 'Nhân viên A', sales: 1_280_000_000, collected: 1_080_000_000, kpi: 108 },
    { name: 'Nhân viên B', sales: 1_125_000_000, collected: 960_000_000, kpi: 96 },
    { name: 'Nhân viên C', sales: 980_000_000, collected: 850_000_000, kpi: 85 },
    { name: 'Nhân viên D', sales: 845_000_000, collected: 720_000_000, kpi: 90 },
    { name: 'Nhân viên E', sales: 720_000_000, collected: 615_000_000, kpi: 82 },
    { name: 'Nhân viên F', sales: 625_000_000, collected: 540_000_000, kpi: 77 },
    { name: 'Nhân viên G', sales: 510_000_000, collected: 425_000_000, kpi: 71 },
  ],
  dealers: Array.from({ length: 20 }, (_, index) => ({
    name: `Đại lý ${String.fromCharCode(65 + index)}`,
    province: ['TP.HCM', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'An Giang'][index % 5],
    sales: (865 - index * 37) * 1_000_000,
    growth: [18.5, 12.8, -5.2, 9.6, -3.4][index % 5],
  })),
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
