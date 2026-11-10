'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bike, Bell, Boxes, BriefcaseBusiness,
  CalendarDays, ChevronDown, CircleHelp, Clock3, CreditCard, Download,
  LayoutDashboard, Menu, MoreHorizontal, Search, Settings2, ShoppingCart,
  Target, TrendingUp, Users, Wallet, X,
} from 'lucide-react';

const sections = [
  { name: 'Tổng quan Giám đốc', icon: LayoutDashboard, short: 'Tổng quan', href: '/' },
  { name: 'Doanh số & tăng trưởng', icon: TrendingUp, short: 'Doanh số', href: '/doanh-so-tang-truong' },
  { name: 'Đại lý & khách hàng', icon: Users, short: 'Đại lý', href: '/dai-ly-khach-hang' },
  { name: 'Hiệu suất kinh doanh', icon: Target, short: 'Hiệu suất', href: '/hieu-suat-kinh-doanh' },
  { name: 'Công nợ & dòng tiền', icon: Wallet, short: 'Công nợ', href: '/cong-no-dong-tien' },
  { name: 'Sản phẩm & tồn kho', icon: Boxes, short: 'Sản phẩm', href: '/san-pham-ton-kho' },
  { name: 'Đơn hàng & vận hành', icon: ShoppingCart, short: 'Đơn hàng', href: '/don-hang-van-hanh' },
  { name: 'Marketing & nguồn khách', icon: Activity, short: 'Marketing', href: '/marketing-nguon-khach' },
  { name: 'Dự báo & cảnh báo', icon: Bell, short: 'Cảnh báo', href: '/du-bao-canh-bao' },
];

const pageDetails = [
  { title: 'Tổng quan điều hành', subtitle: 'Bức tranh kinh doanh toàn diện trong một màn hình', crumbs: 'TỔNG QUAN' },
  { title: 'Doanh số & tăng trưởng', subtitle: 'Doanh số, sản lượng, so sánh cùng kỳ và cơ cấu đóng góp', crumbs: 'KINH DOANH  /  DOANH SỐ' },
  { title: 'Đại lý & khách hàng', subtitle: 'Quy mô, mức độ hoạt động và sức khỏe mạng lưới đại lý', crumbs: 'KINH DOANH  /  ĐẠI LÝ' },
  { title: 'Hiệu suất kinh doanh', subtitle: 'Theo dõi KPI, năng suất và thứ hạng đội ngũ kinh doanh', crumbs: 'KINH DOANH  /  HIỆU SUẤT' },
  { title: 'Công nợ & dòng tiền', subtitle: 'Kiểm soát phải thu, tuổi nợ và dự kiến dòng tiền', crumbs: 'TÀI CHÍNH  /  CÔNG NỢ' },
  { title: 'Sản phẩm & tồn kho', subtitle: 'Mẫu bán chạy, tồn kho theo SKU, vốn tồn và hiệu quả khuyến mãi', crumbs: 'VẬN HÀNH  /  SẢN PHẨM' },
  { title: 'Đơn hàng & vận hành', subtitle: 'Trạng thái đơn, tồn đọng, SLA và tiến độ giao hàng', crumbs: 'VẬN HÀNH  /  ĐƠN HÀNG' },
  { title: 'Marketing & nguồn khách', subtitle: 'Nguồn khách, chuyển đổi, chi phí và hiệu quả chiến dịch', crumbs: 'TĂNG TRƯỞNG  /  MARKETING' },
  { title: 'Dự báo & cảnh báo', subtitle: 'Rủi ro cần xử lý, giao việc theo người phụ trách và dự báo', crumbs: 'ĐIỀU HÀNH  /  CẢNH BÁO' },
];

const fallbackPageKpis = [
  [ ['Doanh số ghi nhận (T11)', '508.102.205 ₫', '-7,7%', 'so với cùng kỳ T10 (550,31 tr)'], ['Tiền thực thu (T11)', '463.812.000 ₫', '91,3%', 'tỷ lệ thu / doanh số đã ghi'], ['Đã xuất HĐ / Thực giao', '510.082.305 ₫', '60 đơn', '10 nhân viên ghi doanh số'], ['Công nợ quá hạn', '4.772.000.000 ₫', 'Tổng nợ: 5.008 triệu', '236 triệu trong hạn'] ],
  [ ['Doanh số đã ghi (T11)', '508.102.205 ₫', '-7,7%', 'cùng kỳ T10: 550.314.323 ₫'], ['Sản lượng bán (T11)', '985 SP', 'Thực tế', 'trên 60 đơn đã ghi'], ['Giá trị đơn TB', '8,47 tr', '60 đơn', 'trên mỗi đơn hàng'], ['Doanh số cả tháng 10', '2,18 tỷ', '647 đơn', 'kỳ tháng trước (T10/2026)'] ],
  [ ['Tổng đại lý', '248', '+16', 'tăng trong năm nay'], ['Đang mua (30 ngày)', '186', '75%', 'trên tổng đại lý'], ['Đại lý mới', '12', '8 đơn đầu', 'trong kỳ hiện tại'], ['Ngừng mua', '18', 'Cần chăm sóc', 'không có đơn 30+ ngày'] ],
  [ ['Doanh số đội ngũ', '508.102.205 ₫', '10 NV', 'nhân viên có doanh số T11'], ['NV dẫn đầu T11', '125,89 tr', 'Tô Kim Sang', 'doanh số cao nhất tháng 11'], ['Đơn hàng đã ghi T11', '60 đơn', '56 đã giao', 'trên hệ thống AMIS CRM'], ['Năng suất TB / NV', '50,81 tr', '10 NV', 'doanh số bình quân T11'] ],
  [ ['Tổng phải thu (Kế toán)', '5.008.000.000 ₫', '4.772 triệu quá hạn', '236 triệu trong hạn'], ['Đã thu đơn T11', '463.812.000 ₫', '91,3%', 'tỷ lệ thu hồi tháng 11'], ['Công nợ quá hạn', '4.772.000.000 ₫', 'Kế toán', 'theo hạn nợ trên AMIS Kế toán'], ['Chưa xuất hóa đơn T11', '3.403.500 ₫', 'Chênh lệch', 'giữa đơn hàng & hóa đơn'] ],
  [ ['Giá trị vốn tồn kho', '12,84 tỷ', '1.248 SKU', 'tại 3 kho hàng'], ['Vòng quay tồn kho', '4,2 lần', '+0,6 lần', 'so với cùng kỳ'], ['Tồn trên 90 ngày', '86 SKU', '1,42 tỷ', 'vốn bị giam'], ['Hàng sắp về', '186 xe', '3,26 tỷ', 'giá trị nhập dự kiến'] ],
  [ ['Đơn hàng trong kỳ', '60 đơn', '514,13 tr', 'đã ghi nhận doanh số'], ['Tổng đơn T11 (cả chờ)', '70 đơn', '10 chờ ghi', 'trên hệ thống CRM'], ['Đã giao thành công', '56 đơn', '93,3%', 'tỷ lệ hoàn tất giao T11'], ['Đang chờ giao T11', '14 đơn', 'Đang xử lý', 'đang xử lý giao vận'] ],
  [ ['Lead mới', '486', '+18,2%', 'so với tháng trước'], ['Lead → khách mua', '12,4%', '+2,1%', 'tỷ lệ chuyển đổi'], ['Chi phí / lead', '184 nghìn', '-8,4%', 'chi phí bình quân'], ['ROAS', '4,8x', '+0,6x', 'hiệu quả quảng cáo'] ],
  [ ['Tăng trưởng cùng kỳ', '-7,7%', '508,10 tr', 'so với 01-10/10 (550,31 tr)'], ['Tỷ lệ thu tiền T11', '91,3%', '463,81 tr', 'trên tổng doanh số T11'], ['Đơn chờ giao T11', '14 đơn', 'Cần xử lý', 'cần điều phối kho'], ['Đại lý ngừng mua', '18', '30+ ngày', 'cần sale chăm sóc lại'] ],
];

const fallbackSalesRows = [
  { name: 'Tô Kim Sang', province: 'Miền Tây 2', region: 'Miền Tây', salesFormatted: '127.473.000 ₫', ratioFormatted: '11 đơn đã ghi', status: 'Đã ghi doanh số' },
  { name: 'Nguyễn Trần Hoàn Thiện', province: 'HCM 4', region: 'Miền Đông & TP.HCM', salesFormatted: '120.189.450 ₫', ratioFormatted: '18 đơn đã ghi', status: 'Đã ghi doanh số' },
  { name: 'Phan Thành Khải', province: 'Miền Trung 2', region: 'Miền Trung', salesFormatted: '98.590.000 ₫', ratioFormatted: '9 đơn đã ghi', status: 'Đã ghi doanh số' },
  { name: 'Nguyễn Nhật Chỉnh', province: 'Miền Tây 4', region: 'Miền Tây', salesFormatted: '40.300.000 ₫', ratioFormatted: '4 đơn đã ghi', status: 'Đã ghi doanh số' },
  { name: 'Nguyễn Trần Đăng Khoa', province: 'Phòng PTM', region: 'Miền Đông & TP.HCM', salesFormatted: '33.309.000 ₫', ratioFormatted: '3 đơn đã ghi', status: 'Đã ghi doanh số' },
];
const fallbackSalesByDay = [34, 48, 42, 59, 54, 68, 60, 74, 62, 77, 69, 84, 72, 91, 79, 88, 74, 96, 82, 73, 91, 77, 98, 85, 93, 78, 89, 72, 96, 86];

interface TableRowItem {
  name: string;
  province: string;
  region: string;
  salesFormatted: string;
  salesRaw?: number;
  ordersCount?: number;
  ratioFormatted: string;
  status: string;
  owner?: string;
}

interface CrmDashboardData {
  connected: boolean;
  source?: string;
  clientId?: string;
  updatedAt?: string;
  error?: string;
  counts?: {
    orders: number;
    allNovOrders?: number;
    totalFetchedOrders?: number;
    customers: number;
    activeDealers: number;
    products: number;
    stocks: number;
    staffCount?: number;
  };
  summary?: {
    totalSales: number;
    totalSalesFormatted: string;
    totalSalesShort?: string;
    invoicedSales?: number;
    invoicedSalesFormatted?: string;
    salesChangeVsPrevPeriod?: string;
    octSamePeriodSalesFormatted?: string;
    octFullSalesFormatted?: string;
    avgDailySalesFormatted: string;
    totalCollected: number;
    totalCollectedFormatted: string;
    collectRatioPercent: string;
  };
  pageKpis?: string[][][];
  staffSales?: TableRowItem[];
  topDealers?: TableRowItem[];
  regionalSales?: Array<{
    name: string;
    value: number;
    valueFormatted: string;
    heightPercent: number;
    color: string;
  }>;
  salesByDay?: number[];
  salesByWeek?: Array<{ label: string; value: number }>;
  salesByMonth?: Array<{ label: string; value: number }>;
  weeklyReport?: { monthLabel: string; year: number; total: number; totalFormatted: string } | null;
  tasks?: Array<{
    type: string;
    title: string;
    subtitle: string;
    priority: string;
    priorityClass: string;
  }>;
}

export default function Dashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const active = Math.max(0, sections.findIndex((section) => section.href === pathname));
  const [period, setPeriod] = useState('Tháng này');
  const [region, setRegion] = useState('Tất cả khu vực');
  const [channel, setChannel] = useState('Tất cả kênh');
  const [tableView, setTableView] = useState<'staff' | 'dealers'>('staff');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [crmData, setCrmData] = useState<CrmDashboardData | null>(null);
  const [loadingCrm, setLoadingCrm] = useState(true);
  const [kpiTarget, setKpiTarget] = useState(0);
  const [kpiTargetInput, setKpiTargetInput] = useState('');
  const [salesPeriodView, setSalesPeriodView] = useState<'week' | 'month'>('week');
  const [reportMonth, setReportMonth] = useState('2026-10');
  const [reportByEmployee, setReportByEmployee] = useState(false);
  const [reportRows, setReportRows] = useState<Array<Record<string, unknown>>>([]);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  }

  const loadAmisData = useCallback(async (showToast = false) => {
    setLoadingCrm(true);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const data: CrmDashboardData = await res.json();
      setCrmData(data);
      if (showToast) {
        if (data.connected) {
          notify(`Đã đồng bộ Doanh số tháng 11: ${data.summary?.totalSalesFormatted} (${data.counts?.orders} đơn đã ghi)`);
        } else {
          notify(`Lỗi kết nối AMIS CRM: ${data.error || 'Không xác định'}`);
        }
      }
    } catch {
      if (showToast) notify('Không thể kết nối tới API server');
    } finally {
      setLoadingCrm(false);
    }
  }, []);

  const loadWeeklyReport = useCallback(async (month: string, byEmployee: boolean) => {
    setLoadingCrm(true);
    try {
      const response = await fetch(`/api/crm-weekly-report?month=${month}&byEmployee=${byEmployee}`, { cache: 'no-store' });
      const report = await response.json();
      if (!response.ok) throw new Error(report.error || 'Không tải được báo cáo tuần.');
      setCrmData(current => current ? { ...current, salesByWeek: report.salesByWeek, weeklyReport: report.weeklyReport } : current);
      setReportRows(Array.isArray(report.rows) ? report.rows : []);
      notify(`Đã tải báo cáo ${report.weeklyReport.monthLabel}/${report.weeklyReport.year}${byEmployee ? ' theo nhân viên' : ''}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được báo cáo tuần.');
    } finally {
      setLoadingCrm(false);
    }
  }, []);

  useEffect(() => {
    loadAmisData(false);
  }, [loadAmisData]);

  useEffect(() => {
    const savedTarget = Number(window.localStorage.getItem('abraham-bike-kpi-target') || 0);
    if (Number.isFinite(savedTarget) && savedTarget > 0) {
      setKpiTarget(savedTarget);
      setKpiTargetInput(savedTarget.toLocaleString('vi-VN'));
    }
  }, []);

  const current = pageDetails[active];
  const kpis = crmData?.connected && crmData.pageKpis ? crmData.pageKpis[active] : fallbackPageKpis[active];
  const collectedAmount = crmData?.summary?.totalCollected ?? 463_812_000;
  const kpiCompletion = kpiTarget > 0 ? (collectedAmount / kpiTarget) * 100 : 0;
  const overviewKpis = active === 0
    ? kpis.map((item, index) => index === 2
      ? ['% hoàn thành KPI', `${kpiCompletion.toFixed(0)}%`, kpiTarget > 0 ? `${collectedAmount.toLocaleString('vi-VN')} ₫ / ${kpiTarget.toLocaleString('vi-VN')} ₫` : 'Nhập KPI để tính %', 'KPI tiền thực thu']
      : item)
    : kpis;
  const activeSalesByDay = crmData?.connected && crmData.salesByDay?.length ? crmData.salesByDay : fallbackSalesByDay;
  const salesPeriodBuckets = useMemo(() => {
    const source = salesPeriodView === 'week' ? crmData?.salesByWeek : crmData?.salesByMonth;
    const fallback = salesPeriodView === 'week'
      ? [{ label: 'Tuần 1', value: 98_000_000 }, { label: 'Tuần 2', value: 122_000_000 }, { label: 'Tuần 3', value: 146_000_000 }, { label: 'Tuần 4', value: 142_000_000 }, { label: 'Tuần 5', value: 0 }]
      : [{ label: 'Tháng 10', value: 2_180_000_000 }, { label: 'Tháng 11', value: 508_102_205 }];
    const values = source?.length ? source : fallback;
    const max = Math.max(1, ...values.map((item) => item.value));
    return values.map((item) => ({ ...item, height: item.value > 0 ? Math.max(18, Math.round((item.value / max) * 96)) : 0 }));
  }, [crmData, salesPeriodView]);
  const weeklyReportPeriod = crmData?.weeklyReport
    ? `${crmData.weeklyReport.monthLabel}/${crmData.weeklyReport.year}`
    : 'Tháng 10/2026';
  const reportDays = crmData?.weeklyReport
    ? new Date(crmData.weeklyReport.year, Number(crmData.weeklyReport.monthLabel.replace(/\D/g, '')), 0).getDate()
    : 31;
  const reportTotal = crmData?.weeklyReport?.total ?? 1_972_566_196;
  const reportAverageDaily = reportTotal / Math.max(1, reportDays);

  const sourceRows: TableRowItem[] = useMemo(() => {
    if (!crmData?.connected) return fallbackSalesRows;
    if (tableView === 'staff' && crmData.staffSales?.length) return crmData.staffSales;
    if (crmData.topDealers?.length) return crmData.topDealers;
    return fallbackSalesRows;
  }, [crmData, tableView]);

  const filteredRows = useMemo(() => {
    return sourceRows.filter((row) => {
      const matchesRegion =
        region === 'Tất cả khu vực' ||
        row.region.toLowerCase().includes(region.toLowerCase()) ||
        row.province.toLowerCase().includes(region.toLowerCase());
      const matchesQuery = `${row.name} ${row.province} ${row.salesFormatted} ${row.status}`
        .toLowerCase()
        .includes(query.toLowerCase());
      return matchesRegion && matchesQuery;
    });
  }, [sourceRows, query, region]);

  const regionalBars = useMemo(() => {
    if (crmData?.connected && crmData.regionalSales?.length) {
      return crmData.regionalSales;
    }
    return [
      { name: 'Miền Tây', valueFormatted: '191,5 tr', heightPercent: 91, color: '#285c4a' },
      { name: 'Miền Đông & TP.HCM', valueFormatted: '194,5 tr', heightPercent: 95, color: '#377a61' },
      { name: 'Miền Trung', valueFormatted: '127,5 tr', heightPercent: 62, color: '#82ad93' },
    ];
  }, [crmData]);

  const syncTimeLabel = useMemo(() => {
    if (!crmData?.updatedAt) return 'Đang đồng bộ...';
    const d = new Date(crmData.updatedAt);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }, [crmData]);

  function downloadCsv() {
    const rows = [
      [tableView === 'staff' ? 'Nhân viên' : 'Đại lý', 'Đơn vị / Tỉnh thành', 'Doanh số đã ghi', 'Số đơn / Tỷ lệ', 'Trạng thái'],
      ...filteredRows.map((r) => [r.name, r.province, r.salesFormatted, r.ratioFormatted, r.status]),
    ];
    const blob = new Blob(['\ufeff' + rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'abraham-bike-doanh-so-amis-crm.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    notify('Đã tải báo cáo CSV từ dữ liệu AMIS CRM');
  }

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Bike size={22} strokeWidth={2.4}/></div><div><strong>ABRAHAM</strong><span>BIKE · BUSINESS</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-avatar">A</div><div className="workspace-copy"><strong>Abraham Bike</strong><span>Quản trị điều hành</span></div><ChevronDown size={15}/></div>
      <div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {sections.map((item, index) => { const Icon = item.icon; return <Link key={item.name} href={item.href} className={`nav-item ${active === index ? 'active' : ''}`} onClick={() => setMenuOpen(false)}><Icon size={17}/><span>{item.name}</span>{index === 8 && <span className="nav-badge">{crmData?.tasks?.length || 4}</span>}</Link>; })}
      </nav>
      <div className="sidebar-bottom"><div className="data-health"><span className="health-dot"/><div><strong>{crmData?.connected ? 'AMIS CRM · Đã kết nối' : 'Đang kết nối AMIS CRM'}</strong><small>{crmData?.connected ? `${crmData.clientId} · lúc ${syncTimeLabel}` : 'Đang tải dữ liệu...'}</small></div><MoreHorizontal size={17}/></div><button className="nav-item" onClick={() => loadAmisData(true)}><Settings2 size={17}/><span>Đồng bộ lại CRM</span></button><div className="profile"><div className="profile-avatar">TN</div><div className="profile-copy"><strong>Trần Ngọc Anh</strong><span>Giám đốc điều hành</span></div><MoreHorizontal size={18}/></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"/>}
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu size={20}/></button><span>Không gian làm việc</span><span className="crumb-sep">/</span><strong>{sections[active].short}</strong></div><div className="top-actions"><div className="sync"><span className="health-dot"/> <span>{loadingCrm ? 'Đang đồng bộ AMIS CRM...' : `AMIS CRM · ${syncTimeLabel}`}</span></div><button className="icon-button" aria-label="Thông báo" onClick={() => notify('Bạn đã xem tất cả thông báo')}><Bell size={18}/><i/></button><div className="top-divider"/><div className="top-avatar">TN</div></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">{current.crumbs}</div><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => loadAmisData(true)} disabled={loadingCrm}><Activity size={16}/> {loadingCrm ? 'Đang tải...' : 'Làm mới CRM'}</button><button className="button button-primary" onClick={downloadCsv}><Download size={16}/> Xuất báo cáo</button></div></div>
        <section className="filter-bar"><div className="filter-label"><Settings2 size={16}/><span>Bộ lọc</span></div><div className="filter-divider"/><label className="filter-field"><CalendarDays size={15}/><select value={period} onChange={e => setPeriod(e.target.value)}><option>Tháng này</option><option>Hôm nay</option><option>7 ngày qua</option><option>Quý này</option><option>Năm nay</option></select><ChevronDown size={13}/></label><label className="filter-field"><span className="filter-key">KV</span><select value={region} onChange={e => setRegion(e.target.value)}><option>Tất cả khu vực</option><option>Miền Tây</option><option>Miền Đông & TP.HCM</option><option>Miền Trung</option><option>Miền Bắc</option><option>Tây Nguyên</option></select><ChevronDown size={13}/></label><label className="filter-field"><BriefcaseBusiness size={15}/><select value={channel} onChange={e => setChannel(e.target.value)}><option>Tất cả kênh</option><option>Đại lý</option><option>Bán lẻ</option><option>Thương mại điện tử</option><option>Dự án</option></select><ChevronDown size={13}/></label><span className="filter-applied">Đang áp dụng <b>{period} (T11/2026)</b> · <b>{region === 'Tất cả khu vực' ? 'THỐNG ĐẠT GROUP' : region}</b></span><button className="more-filter" onClick={() => notify('Đang hiển thị toàn bộ bộ lọc')}><MoreHorizontal size={18}/></button></section>
        <div className="sample-note">
          <span className="note-icon">{crmData?.connected ? '✓' : 'i'}</span>
          <span>
            {crmData?.connected ? (
              <>
                <strong>Dữ liệu thực tế AMIS CRM ({crmData.clientId})</strong> · Tháng 11/2026 có{' '}
                <b>{crmData.counts?.orders}</b> đơn đã ghi doanh số của <b>{crmData.counts?.staffCount}</b> nhân viên (Tổng đơn hàng đã ghi:{' '}
                <b>{crmData.summary?.totalSalesFormatted}</b> · Đã xuất hóa đơn: <b>{crmData.summary?.invoicedSalesFormatted}</b>).
              </>
            ) : loadingCrm ? (
              <>
                <strong>Đang kết nối MISA AMIS CRM...</strong> · Đang xác thực Token và tải dữ liệu thực tế từ{' '}
                <code>crmconnect.misa.vn</code>.
              </>
            ) : (
              <>
                <strong>Chưa tải được dữ liệu AMIS CRM</strong> · {crmData?.error || 'Đang hiển thị dữ liệu mẫu.'}
              </>
            )}
          </span>
          <button onClick={() => loadAmisData(true)}>Đồng bộ ngay <ArrowRight size={13}/></button>
        </div>
        <section className="kpi-grid">
          {overviewKpis.map((item, index) => {
            const isNegative = item[2].startsWith('-');
            return (
              <article className={`kpi-card kpi-${index}`} key={item[0]}>
                <div className="kpi-top">
                  <span>{item[0]}</span>
                  <button aria-label="Tùy chọn"><MoreHorizontal size={17}/></button>
                </div>
                <div className="kpi-value">{item[1]}</div>
                {active === 0 && index === 2 && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64746b', marginBottom: '8px' }}>
                      KPI:
                      <input
                        type="text"
                        inputMode="numeric"
                        value={kpiTargetInput}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '');
                          const target = Number(digits) || 0;
                          setKpiTarget(target);
                          setKpiTargetInput(digits ? target.toLocaleString('vi-VN') : '');
                          window.localStorage.setItem('abraham-bike-kpi-target', String(target));
                        }}
                        placeholder="Nhập số tiền KPI"
                        style={{ width: '100%', border: '1px solid #d8e0dc', borderRadius: '6px', padding: '5px 7px', fontSize: '12px' }}
                      />
                    </label>
                    <div style={{ height: '7px', background: '#e8eeeb', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, kpiCompletion)}%`, background: '#2f7d5d', borderRadius: 'inherit' }} />
                    </div>
                  </>
                )}
                <div className="kpi-foot">
                  <span className={isNegative ? 'neutral' : 'positive'}>
                    {isNegative ? <ArrowDownRight size={14}/> : index < 2 ? <ArrowUpRight size={14}/> : null}
                    {item[2]}
                  </span>
                  <small>{item[3]}</small>
                </div>
                <div className="kpi-spark" aria-hidden="true">
                  <svg viewBox="0 0 100 32" preserveAspectRatio="none">
                    <path d={index === 1 ? 'M0 25 C14 22 16 28 28 19 S45 17 53 20 S70 4 82 11 S91 7 100 3' : 'M0 26 C12 21 16 24 25 19 S39 22 48 13 S63 16 72 9 S86 14 100 4'}/>
                  </svg>
                </div>
              </article>
            );
          })}
        </section>
        <section className="report-controls" aria-label="Tham số báo cáo doanh số tuần">
          <label>Tháng <input type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} /></label>
          <label><input type="checkbox" checked={reportByEmployee} onChange={event => setReportByEmployee(event.target.checked)} /> Xem chi tiết theo nhân viên</label>
          <button className="button button-primary" onClick={() => loadWeeklyReport(reportMonth, reportByEmployee)} disabled={loadingCrm}>Đồng bộ</button>
        </section>
        {reportByEmployee && <section className="report-detail-view"><article className="panel table-panel"><div className="panel-heading"><div><h2>Chi tiết doanh số theo nhân viên · {weeklyReportPeriod}</h2><p>Thực hiện từng tuần từ Báo cáo tiến độ doanh số AMIS CRM</p></div></div><div className="table-scroll"><table><thead><tr><th>NHÂN VIÊN</th><th>TUẦN 1</th><th>TUẦN 2</th><th>TUẦN 3</th><th>TUẦN 4</th><th>TUẦN 5</th><th>TỔNG THÁNG</th></tr></thead><tbody>{reportRows.map((row, index) => { const weeks = ['First', 'Second', 'Third', 'Forth', 'Fifth'].map(name => Number(row[`DoneOf${name}Week`] || 0)); const done = Number(row.DoneOfMonth || 0); return <tr key={String(row.OUEmployeeID || index)}><td><strong>{String(row.OUEmployeeIDText || row.EmployeeName || 'Không rõ')}</strong></td>{weeks.map((value, week) => <td className="amount-cell" key={week}>{value ? `${value.toLocaleString('vi-VN')} ₫` : '-'}</td>)}<td className="amount-cell"><strong>{done.toLocaleString('vi-VN')} ₫</strong></td></tr>; })}{reportRows.length === 0 && <tr><td colSpan={7} className="empty-row">Nhấn “Áp dụng báo cáo” để tải danh sách nhân viên.</td></tr>}</tbody></table></div><div className="table-footer"><span>Tổng: <b>{crmData?.weeklyReport?.totalFormatted || '-'}</b></span></div></article></section>}
        <section className="primary-grid"><article className="panel sales-panel"><div className="panel-heading"><div><h2>{active === 4 ? 'Dự kiến thu công nợ' : active === 8 ? 'Tiến độ và dự báo KPI tháng' : `Doanh số đã ghi theo ${salesPeriodView === 'week' ? 'tuần' : 'tháng'} (AMIS CRM · ${weeklyReportPeriod})`}</h2><p>{active === 4 ? 'Dòng tiền thực thu và phải thu trên đơn hàng' : `Nguồn: Báo cáo tiến độ thực hiện doanh số tuần AMIS CRM · ${weeklyReportPeriod}.`}</p></div><label className="select-chip"><select aria-label="Kiểu tổng hợp doanh số" value={salesPeriodView} onChange={e => setSalesPeriodView(e.target.value as 'week' | 'month')}><option value="week">Theo tuần</option><option value="month">Theo tháng</option></select><ChevronDown size={13}/></label></div><div className="chart-legend"><span><i className="legend-dot green"/> Thực hiện (Báo cáo AMIS)</span></div><div className="chart-wrap"><div className="y-labels"><span>Cao nhất</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="chart"><div className="grid-lines"><i/><i/><i/><i/><i/></div><div className="bars">{salesPeriodBuckets.map((bucket, i) => <div className="bar-slot" key={bucket.label} title={`${bucket.label}: ${bucket.value.toLocaleString('vi-VN')} ₫`}><span className={`bar ${i === salesPeriodBuckets.length - 1 ? 'bar-highlight' : ''}`} style={{height: `${bucket.height}%`}}/></div>)}</div><div className="x-labels">{salesPeriodBuckets.map(bucket => <span key={bucket.label}>{bucket.label}</span>)}</div></div></div><div className="chart-bottom"><div><span>Tổng doanh số</span><strong>{reportTotal.toLocaleString('vi-VN')} ₫</strong></div><div><span>Trung bình / ngày</span><strong>{reportAverageDaily.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} ₫</strong></div><div><span>Mục tiêu tháng</span><strong>{kpiTarget > 0 ? `${kpiTarget.toLocaleString('vi-VN')} ₫` : 'Chưa nhập KPI'}</strong></div></div></article>
          <article className="panel region-panel"><div className="panel-heading"><div><h2>{active === 2 ? 'Đại lý theo khu vực' : 'Doanh số T11 theo khu vực'}</h2><p>Phân bổ từ 59 đơn đã ghi tháng 11/2026</p></div><button className="icon-button small" onClick={() => notify('Đang mở chi tiết khu vực')}><MoreHorizontal size={18}/></button></div><div className="region-summary"><div className="region-total">{crmData?.summary?.totalSalesShort || '513,49 tr'}</div><span className="growth-pill"><ArrowUpRight size={13}/> {crmData?.counts?.orders || 59} đơn T11</span></div><div className="region-chart"><div className="region-y"><span>100%</span><span>66%</span><span>33%</span><span>0</span></div><div className="region-bars"><div className="region-grid"><i/><i/><i/><i/></div>{regionalBars.map((item) => <div className="region-column" key={item.name}><span className="region-bar" style={{height:`${item.heightPercent}%`,background:item.color}}/><small>{item.name}</small></div>)}</div></div><div className="region-legend">{regionalBars.slice(0, 3).map((item) => <span key={item.name}><i style={{background:item.color}}/> {item.name} <b>{item.valueFormatted}</b></span>)}</div></article></section>
        <section className="secondary-grid"><article className="panel table-panel"><div className="panel-heading table-heading"><div><h2>{tableView === 'staff' ? 'Doanh số đã ghi theo Nhân viên (T11/2026)' : 'Doanh số đã ghi theo Đại lý (T11/2026)'}</h2><p>{tableView === 'staff' ? '10 nhân viên có doanh số đã ghi tháng 11/2026 trên AMIS CRM (Tổng: 513.485.805 ₫)' : 'Các đại lý phát sinh đơn hàng đã ghi trong tháng 11/2026'}</p></div><div className="table-tools"><label className="search-box"><Search size={14}/><input aria-label="Tìm kiếm" placeholder={tableView === 'staff' ? 'Tìm nhân viên, bộ phận...' : 'Tìm đại lý, tỉnh thành...'} value={query} onChange={e => setQuery(e.target.value)}/></label><button className="text-button" onClick={() => setTableView(tableView === 'staff' ? 'dealers' : 'staff')}>{tableView === 'staff' ? 'Xem theo Đại lý' : 'Xem theo Nhân viên'} <ArrowRight size={14}/></button></div></div><div className="table-scroll"><table><thead><tr><th>{tableView === 'staff' ? 'NHÂN VIÊN' : 'ĐẠI LÝ / KHÁCH HÀNG'}</th><th>{tableView === 'staff' ? 'ĐƠN VỊ / BỘ PHẬN' : 'TỈNH / KHU VỰC'}</th><th>ĐÃ THỰC HIỆN (CRM)</th><th>SỐ ĐƠN / TỶ LỆ</th><th>TRẠNG THÁI</th><th/></tr></thead><tbody>{filteredRows.slice(0, 12).map((row) => <tr key={row.name}><td><span className="table-avatar">{row.name.split(' ').map(word => word[0]).slice(-2).join('').toUpperCase()}</span><strong>{row.name}</strong></td><td>{row.province}</td><td className="amount-cell">{row.salesFormatted}</td><td><span className="change-up"><ArrowUpRight size={13}/> {row.ratioFormatted}</span></td><td><span className={`status ${row.status === 'Còn công nợ' ? 'status-warn' : ''}`}><i/>{row.status}</span></td><td><button className="row-more" aria-label={`Tùy chọn ${row.name}`} onClick={() => notify(`Đang xem: ${row.name} (${row.salesFormatted})`)}><MoreHorizontal size={17}/></button></td></tr>)}{filteredRows.length === 0 && <tr><td className="empty-row" colSpan={6}>Không tìm thấy dữ liệu phù hợp</td></tr>}</tbody></table></div><div className="table-footer"><span>Hiển thị <b>{Math.min(12, filteredRows.length)}</b> / <b>{filteredRows.length}</b> {tableView === 'staff' ? 'nhân viên' : 'đại lý'} · Tổng đơn đã ghi T11: <b>{crmData?.summary?.totalSalesFormatted || '513.485.805 ₫'}</b></span><div><button disabled>‹</button><button className="current-page">1</button><button onClick={() => setTableView(tableView === 'staff' ? 'dealers' : 'staff')}>2</button></div></div></article>
          <article className="panel tasks-panel"><div className="panel-heading"><div><h2>Thông tin & Việc cần xử lý (CRM)</h2><p>Tổng hợp trực tiếp từ dữ liệu tháng 11/2026</p></div><button className="task-count" onClick={() => router.push('/du-bao-canh-bao')}>{crmData?.tasks?.length || 4} <ArrowRight size={14}/></button></div><div className="task-list">
            {crmData?.connected && crmData.tasks ? (
              crmData.tasks.map((t, idx) => (
                <button className="task-item" key={idx} onClick={() => notify(t.title)}>
                  <span className={`task-mark ${idx === 0 ? 'task-blue' : idx === 1 ? 'task-red' : idx === 2 ? 'task-orange' : 'task-violet'}`}>
                    {idx === 0 ? <TrendingUp size={15}/> : idx === 1 ? <CreditCard size={15}/> : idx === 2 ? <ShoppingCart size={15}/> : <Users size={15}/>}
                  </span>
                  <span className="task-copy">
                    <strong>{t.title}</strong>
                    <small>{t.subtitle}</small>
                  </span>
                  <span className={`priority ${t.priorityClass}`}>{t.priority}</span>
                </button>
              ))
            ) : (
              <>
                <button className="task-item" onClick={() => notify('Đang tải dữ liệu từ AMIS CRM')}><span className="task-mark task-blue"><TrendingUp size={15}/></span><span className="task-copy"><strong>Đang đồng bộ doanh số tháng 11/2026</strong><small>Từ MISA AMIS CRM</small></span><span className="priority priority-watch">CRM</span></button>
              </>
            )}
          </div><button className="all-tasks" onClick={() => router.push('/du-bao-canh-bao')}>Xem tất cả cảnh báo <ArrowRight size={14}/></button></article></section>
        <footer className="page-footer"><span><Clock3 size={13}/> Đồng bộ lần cuối: {syncTimeLabel}</span><span>Nguồn dữ liệu: {crmData?.source || 'AMIS CRM'} <i/> Đơn vị tiền tệ: VND</span></footer>
      </div>
    </main>
    {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
  </div>;
}
