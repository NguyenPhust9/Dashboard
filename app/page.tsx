'use client';

import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bike, Bell, Boxes, BriefcaseBusiness,
  CalendarDays, ChevronDown, CircleHelp, Clock3, CreditCard, Download, FileSpreadsheet,
  LayoutDashboard, LifeBuoy, Menu, MoreHorizontal, Search, Settings2, ShoppingCart,
  Target, TrendingUp, Users, Wallet, X,
} from 'lucide-react';

const sections = [
  { name: 'Tổng quan Giám đốc', icon: LayoutDashboard, short: 'Tổng quan' },
  { name: 'Doanh số & tăng trưởng', icon: TrendingUp, short: 'Doanh số' },
  { name: 'Đại lý & khách hàng', icon: Users, short: 'Đại lý' },
  { name: 'Hiệu suất kinh doanh', icon: Target, short: 'Hiệu suất' },
  { name: 'Công nợ & dòng tiền', icon: Wallet, short: 'Công nợ' },
  { name: 'Sản phẩm & tồn kho', icon: Boxes, short: 'Sản phẩm' },
  { name: 'Đơn hàng & vận hành', icon: ShoppingCart, short: 'Đơn hàng' },
  { name: 'Marketing & nguồn khách', icon: Activity, short: 'Marketing' },
  { name: 'Dự báo & cảnh báo', icon: Bell, short: 'Cảnh báo' },
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

const pageKpis = [
  [ ['Doanh số ghi nhận', '8,42 tỷ', '+12,8%', 'so với kỳ trước'], ['Tiền thực thu', '6,18 tỷ', '73,4%', 'tỷ lệ thu / doanh số'], ['Hoàn thành KPI', '78%', 'Còn 2,38 tỷ', 'dự báo cuối kỳ 94%'], ['Công nợ quá hạn', '1,26 tỷ', '12 đại lý', 'tổng phải thu 8,70 tỷ'] ],
  [ ['Doanh số ghi nhận', '8,42 tỷ', '+12,8%', 'so với cùng kỳ'], ['Sản lượng bán', '342 xe', '+8,2%', 'so với cùng kỳ'], ['Giá trị đơn TB', '24,6 tr', '+4,3%', 'trên mỗi đơn hàng'], ['Đơn hủy, trả hàng', '12 đơn', '3,5%', 'tỷ lệ trên tổng đơn'] ],
  [ ['Tổng đại lý', '248', '+16', 'tăng trong năm nay'], ['Đang mua (30 ngày)', '186', '75%', 'trên tổng đại lý'], ['Đại lý mới', '12', '8 đơn đầu', 'trong kỳ hiện tại'], ['Ngừng mua', '18', 'Cần chăm sóc', 'không có đơn 30+ ngày'] ],
  [ ['Doanh số đội ngũ', '8,42 tỷ', '+12,8%', 'so với cùng kỳ'], ['KPI trung bình', '78%', '12 / 18', 'nhân viên đạt tiến độ'], ['Đơn hàng mới', '342', '+8,2%', 'đơn được ghi nhận'], ['Năng suất / NV', '467 tr', '+6,4%', 'doanh số bình quân'] ],
  [ ['Tổng phải thu', '8,70 tỷ', '248 đại lý', 'còn dư nợ'], ['Công nợ quá hạn', '1,26 tỷ', '12 đại lý', 'chiếm 14,5% dư nợ'], ['Đã thu trong kỳ', '6,18 tỷ', '73,4%', 'tỷ lệ thu hồi'], ['Đến hạn 7 ngày', '840 tr', '5 đại lý', 'dự kiến cần thu'] ],
  [ ['Giá trị vốn tồn kho', '12,84 tỷ', '1.248 SKU', 'tại 3 kho hàng'], ['Vòng quay tồn kho', '4,2 lần', '+0,6 lần', 'so với cùng kỳ'], ['Tồn trên 90 ngày', '86 SKU', '1,42 tỷ', 'vốn bị giam'], ['Hàng sắp về', '186 xe', '3,26 tỷ', 'giá trị nhập dự kiến'] ],
  [ ['Đơn hàng trong kỳ', '342 đơn', '+8,2%', 'so với cùng kỳ'], ['Giá trị tồn đọng', '1,82 tỷ', '46 đơn', 'đang xử lý'], ['Đơn quá SLA', '8 đơn', 'Cần xử lý', 'chậm so với cam kết'], ['Giao đúng hẹn', '92,4%', '+3,1%', 'so với tháng trước'] ],
  [ ['Lead mới', '486', '+18,2%', 'so với tháng trước'], ['Lead → khách mua', '12,4%', '+2,1%', 'tỷ lệ chuyển đổi'], ['Chi phí / lead', '184 nghìn', '-8,4%', 'chi phí bình quân'], ['ROAS', '4,8x', '+0,6x', 'hiệu quả quảng cáo'] ],
  [ ['Dự báo cuối kỳ', '94%', 'KPI tháng', 'ước tính hiện tại'], ['Cảnh báo khẩn', '3', 'Cần xử lý ngay', 'trong danh sách'], ['Cảnh báo cao', '8', 'Giao phụ trách', 'đang chờ xử lý'], ['Đang theo dõi', '14', 'Theo dõi sát', 'cập nhật hằng ngày'] ],
];

const salesRows = [
  ['Đại lý Minh Phát', 'TP. Hồ Chí Minh', '1,24 tỷ', '+18,2%', 'Đang mua'],
  ['Xe đạp Thành Công', 'Hà Nội', '986 tr', '+12,6%', 'Đang mua'],
  ['Cửa hàng Hoàng Nam', 'Đà Nẵng', '864 tr', '+8,4%', 'Đang mua'],
  ['Đại lý Hồng Hà', 'Cần Thơ', '728 tr', '-4,2%', 'Theo dõi'],
  ['Xe đạp Phương Trang', 'Đồng Nai', '642 tr', '+15,8%', 'Đang mua'],
];
const salesByDay = [34, 48, 42, 59, 54, 68, 60, 74, 62, 77, 69, 84, 72, 91, 79, 88, 74, 96, 82, 73, 91, 77, 98, 85, 93, 78, 89, 72, 96, 86];

function moneyLabel(value: string, unit: string) { return <>{value}<small>{unit}</small></>; }

export default function Dashboard() {
  const [active, setActive] = useState(0);
  const [period, setPeriod] = useState('Tháng này');
  const [region, setRegion] = useState('Tất cả khu vực');
  const [channel, setChannel] = useState('Tất cả kênh');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const current = pageDetails[active];
  const kpis = pageKpis[active];
  const filteredRows = useMemo(() => salesRows.filter(row => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query]);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  function downloadCsv() {
    const rows = [['Đại lý', 'Tỉnh thành', 'Doanh số', 'Tăng giảm', 'Trạng thái'], ...filteredRows];
    const blob = new Blob(['\ufeff' + rows.map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'abraham-bike-bao-cao.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    notify('Đã tải báo cáo CSV');
  }

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Bike size={22} strokeWidth={2.4}/></div><div><strong>ABRAHAM</strong><span>BIKE · BUSINESS</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-avatar">A</div><div className="workspace-copy"><strong>Abraham Bike</strong><span>Quản trị điều hành</span></div><ChevronDown size={15}/></div>
      <div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {sections.map((item, index) => { const Icon = item.icon; return <button key={item.name} className={`nav-item ${active === index ? 'active' : ''}`} onClick={() => { setActive(index); setMenuOpen(false); }}><Icon size={17}/><span>{item.name}</span>{index === 8 && <span className="nav-badge">11</span>}</button>; })}
      </nav>
      <div className="sidebar-bottom"><div className="data-health"><span className="health-dot"/><div><strong>Dữ liệu đã đồng bộ</strong><small>AMIS CRM · 8 phút trước</small></div><MoreHorizontal size={17}/></div><button className="nav-item"><Settings2 size={17}/><span>Cài đặt</span></button><button className="nav-item"><CircleHelp size={17}/><span>Trợ giúp & hỗ trợ</span></button><div className="profile"><div className="profile-avatar">TN</div><div className="profile-copy"><strong>Trần Ngọc Anh</strong><span>Giám đốc điều hành</span></div><MoreHorizontal size={18}/></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"/>}
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu size={20}/></button><span>Không gian làm việc</span><span className="crumb-sep">/</span><strong>{sections[active].short}</strong></div><div className="top-actions"><div className="sync"><span className="health-dot"/> <span>Đồng bộ lúc 09:42</span></div><button className="icon-button" aria-label="Thông báo" onClick={() => notify('Bạn đã xem tất cả thông báo')}><Bell size={18}/><i/></button><div className="top-divider"/><div className="top-avatar">TN</div></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">{current.crumbs}</div><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => notify('Dữ liệu đã được làm mới')}><Activity size={16}/> Làm mới</button><button className="button button-primary" onClick={downloadCsv}><Download size={16}/> Xuất báo cáo</button></div></div>
        <section className="filter-bar"><div className="filter-label"><Settings2 size={16}/><span>Bộ lọc</span></div><div className="filter-divider"/><label className="filter-field"><CalendarDays size={15}/><select value={period} onChange={e => setPeriod(e.target.value)}><option>Tháng này</option><option>Hôm nay</option><option>7 ngày qua</option><option>Quý này</option><option>Năm nay</option></select><ChevronDown size={13}/></label><label className="filter-field"><span className="filter-key">KV</span><select value={region} onChange={e => setRegion(e.target.value)}><option>Tất cả khu vực</option><option>Miền Bắc</option><option>Miền Trung</option><option>Miền Nam</option></select><ChevronDown size={13}/></label><label className="filter-field"><BriefcaseBusiness size={15}/><select value={channel} onChange={e => setChannel(e.target.value)}><option>Tất cả kênh</option><option>Đại lý</option><option>Bán lẻ</option><option>Thương mại điện tử</option><option>Dự án</option></select><ChevronDown size={13}/></label><span className="filter-applied">Đang áp dụng <b>{period}</b> · <b>{region === 'Tất cả khu vực' ? 'Toàn quốc' : region}</b></span><button className="more-filter" onClick={() => notify('Đang hiển thị toàn bộ bộ lọc')}><MoreHorizontal size={18}/></button></section>
        <div className="sample-note"><span className="note-icon">i</span><span><strong>Dữ liệu minh họa</strong> · Chỉ số và biểu đồ đang dùng số liệu mẫu để trình bày giao diện, chưa kết nối AMIS CRM.</span><button onClick={() => notify('Kết nối dữ liệu: AMIS CRM')}>Tìm hiểu thêm <ArrowRight size={13}/></button></div>
        <section className="kpi-grid">{kpis.map((item, index) => <article className={`kpi-card kpi-${index}`} key={item[0]}><div className="kpi-top"><span>{item[0]}</span><button aria-label="Tùy chọn"><MoreHorizontal size={17}/></button></div><div className="kpi-value">{item[1]}</div><div className="kpi-foot"><span className={item[2].startsWith('+') || item[2].includes('%') && index !== 2 ? 'positive' : index === 3 && active !== 0 ? 'neutral' : 'positive'}>{index < 2 && active !== 8 ? <ArrowUpRight size={14}/> : null}{item[2]}</span><small>{item[3]}</small></div><div className="kpi-spark" aria-hidden="true"><svg viewBox="0 0 100 32" preserveAspectRatio="none"><path d={index === 1 ? 'M0 25 C14 22 16 28 28 19 S45 17 53 20 S70 4 82 11 S91 7 100 3' : 'M0 26 C12 21 16 24 25 19 S39 22 48 13 S63 16 72 9 S86 14 100 4'}/></svg></div></article>)}</section>
        <section className="primary-grid"><article className="panel sales-panel"><div className="panel-heading"><div><h2>{active === 4 ? 'Dự kiến thu công nợ' : active === 8 ? 'Tiến độ và dự báo KPI tháng' : 'Doanh số theo ngày'}</h2><p>{active === 4 ? 'Dòng tiền dự kiến trong 30 ngày tới' : 'So sánh kết quả thực hiện với kế hoạch'}</p></div><button className="select-chip" onClick={() => notify('Đang xem theo ngày')}>Theo ngày <ChevronDown size={13}/></button></div><div className="chart-legend"><span><i className="legend-dot green"/> Thực hiện</span><span><i className="legend-line"/> Kế hoạch</span><span><i className="legend-dot gray"/> Cùng kỳ</span></div><div className="chart-wrap"><div className="y-labels"><span>1,2 tỷ</span><span>900 tr</span><span>600 tr</span><span>300 tr</span><span>0</span></div><div className="chart"><div className="grid-lines"><i/><i/><i/><i/><i/></div><div className="bars">{salesByDay.map((height, i) => <div className="bar-slot" key={i}><span className={`bar ${i === 23 ? 'bar-highlight' : ''}`} style={{ height: `${height}%` }}/></div>)}</div><svg className="trend-line" viewBox="0 0 1000 200" preserveAspectRatio="none"><path d="M0 132 C100 125 100 102 200 110 S300 86 400 99 S500 67 600 83 S700 49 800 62 S900 37 1000 28"/></svg><div className="x-labels"><span>01 Thg 11</span><span>07 Thg 11</span><span>14 Thg 11</span><span>21 Thg 11</span><span>30 Thg 11</span></div></div></div><div className="chart-bottom"><div><span>Tổng doanh số</span><strong>8,42 tỷ <em><ArrowUpRight size={13}/> 12,8%</em></strong></div><div><span>Trung bình / ngày</span><strong>280,6 tr</strong></div><div><span>Mục tiêu tháng</span><strong>10,8 tỷ <small>78% hoàn thành</small></strong></div></div></article>
          <article className="panel region-panel"><div className="panel-heading"><div><h2>{active === 2 ? 'Đại lý theo khu vực' : 'Doanh số theo khu vực'}</h2><p>Phân bổ kết quả kinh doanh</p></div><button className="icon-button small" onClick={() => notify('Đang mở chi tiết khu vực')}><MoreHorizontal size={18}/></button></div><div className="region-summary"><div className="region-total">8,42 <small>tỷ đồng</small></div><span className="growth-pill"><ArrowUpRight size={13}/> 12,8%</span></div><div className="region-chart"><div className="region-y"><span>3 tỷ</span><span>2 tỷ</span><span>1 tỷ</span><span>0</span></div><div className="region-bars"><div className="region-grid"><i/><i/><i/><i/></div>{[['Miền Bắc',72,'#377a61'],['Miền Trung',42,'#82ad93'],['Miền Nam',91,'#285c4a'],['Tây Nguyên',28,'#b1ccb8']].map(([name,height,color]) => <div className="region-column" key={name as string}><span className="region-bar" style={{height:`${height}%`,background:color as string}}/><small>{name}</small></div>)}</div></div><div className="region-legend"><span><i style={{background:'#285c4a'}}/> Miền Nam <b>3,62 tỷ</b></span><span><i style={{background:'#377a61'}}/> Miền Bắc <b>2,48 tỷ</b></span><span><i style={{background:'#82ad93'}}/> Miền Trung <b>1,64 tỷ</b></span></div></article></section>
        <section className="secondary-grid"><article className="panel table-panel"><div className="panel-heading table-heading"><div><h2>{active === 1 ? 'Doanh số theo đại lý' : active === 3 ? 'Hiệu suất nhân viên kinh doanh' : 'Top đại lý doanh số'}</h2><p>5 đại lý có doanh số cao nhất trong kỳ</p></div><div className="table-tools"><label className="search-box"><Search size={14}/><input aria-label="Tìm đại lý" placeholder="Tìm đại lý..." value={query} onChange={e => setQuery(e.target.value)}/></label><button className="text-button" onClick={() => notify('Đang mở danh sách đại lý')}>Xem tất cả <ArrowRight size={14}/></button></div></div><div className="table-scroll"><table><thead><tr><th>ĐẠI LÝ</th><th>TỈNH / THÀNH</th><th>DOANH SỐ</th><th>TĂNG / GIẢM</th><th>TRẠNG THÁI</th><th/></tr></thead><tbody>{filteredRows.map((row, i) => <tr key={row[0]}><td><span className="table-avatar">{row[0].split(' ').map(word => word[0]).slice(0,2).join('')}</span><strong>{row[0]}</strong></td><td>{row[1]}</td><td className="amount-cell">{row[2]}</td><td><span className={row[3].startsWith('+') ? 'change-up' : 'change-down'}>{row[3].startsWith('+') ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {row[3]}</span></td><td><span className={`status ${row[4] === 'Theo dõi' ? 'status-warn' : ''}`}><i/>{row[4]}</span></td><td><button className="row-more" aria-label={`Tùy chọn ${row[0]}`} onClick={() => notify(`Đang xem ${row[0]}`)}><MoreHorizontal size={17}/></button></td></tr>)}{filteredRows.length === 0 && <tr><td className="empty-row" colSpan={6}>Không tìm thấy đại lý phù hợp</td></tr>}</tbody></table></div><div className="table-footer"><span>Hiển thị <b>{filteredRows.length}</b> trên 248 đại lý</span><div><button disabled>‹</button><button className="current-page">1</button><button onClick={() => notify('Đang xem trang 2')}>2</button><button onClick={() => notify('Đang xem trang 3')}>3</button><span>…</span><button onClick={() => notify('Đang xem trang tiếp theo')}>›</button></div></div></article>
          <article className="panel tasks-panel"><div className="panel-heading"><div><h2>Việc cần xử lý</h2><p>Ưu tiên trong hôm nay</p></div><button className="task-count" onClick={() => setActive(8)}>6 <ArrowRight size={14}/></button></div><div className="task-list"><button className="task-item" onClick={() => notify('Đã mở hồ sơ công nợ đại lý Minh Phát')}><span className="task-mark task-red"><CreditCard size={15}/></span><span className="task-copy"><strong>Công nợ quá hạn trên 90 ngày</strong><small>Đại lý Minh Phát · Phụ trách: Hoàng Nam</small></span><span className="priority priority-high">Khẩn</span></button><button className="task-item" onClick={() => notify('Đã mở hồ sơ đại lý Thành Công')}><span className="task-mark task-orange"><Users size={15}/></span><span className="task-copy"><strong>Đại lý ngừng mua 60 ngày</strong><small>Xe đạp Thành Công · 12/11</small></span><span className="priority priority-medium">Cao</span></button><button className="task-item" onClick={() => notify('Đã mở cảnh báo KPI khu vực')}><span className="task-mark task-blue"><Target size={15}/></span><span className="task-copy"><strong>Nguy cơ không đạt KPI tháng</strong><small>Khu vực miền Trung · Quản lý vùng</small></span><span className="priority priority-medium">Cao</span></button><button className="task-item" onClick={() => notify('Đã mở báo cáo tồn kho mẫu xe')}><span className="task-mark task-violet"><Boxes size={15}/></span><span className="task-copy"><strong>Mẫu xe bán chạy sắp hết tồn</strong><small>City 700C · Tồn kho còn 8 xe</small></span><span className="priority priority-watch">Theo dõi</span></button></div><button className="all-tasks" onClick={() => setActive(8)}>Xem tất cả cảnh báo <ArrowRight size={14}/></button></article></section>
        <footer className="page-footer"><span><Clock3 size={13}/> Cập nhật lần cuối: 09:42, 09/11/2026</span><span>Nguồn dữ liệu: AMIS CRM <i/> Đơn vị tiền tệ: VND</span></footer>
      </div>
    </main>
    {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
  </div>;
}
