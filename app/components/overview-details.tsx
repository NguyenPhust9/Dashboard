'use client';

import { useEffect, useState } from 'react';
import type { StaffResult, StaffSnapshot } from '@/lib/crm-excellent-staff';
import type { CustomerResult, CustomerSnapshot } from '@/lib/crm-top-customers';
import { overviewMockData as data } from './overview-mock-data';
import styles from './overview-details.module.css';

const money = (value: number) => (value / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const staffColors = ['#ff6636', '#83ae97', '#4587df', '#d952d7', '#9fcb28', '#7a6af1', '#ef9d00'];
const initials = (name: string) => {
  const words = name.trim().split(/\s+/);
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? words[words.length - 1][0] : ''}`.toLocaleUpperCase('vi-VN');
};
const readTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa xác định' : date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

export default function OverviewDetails({ month }: { month: string }) {
  const [staffState, setStaffState] = useState<{ month: string; snapshot: StaffSnapshot | null; error?: string; loading: boolean }>({ month, snapshot: null, loading: true });
  const [customerState, setCustomerState] = useState<{ month: string; snapshot: CustomerSnapshot | null; error?: string; loading: boolean }>({ month, snapshot: null, loading: true });
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(30);
  const inactiveRows = data.inactiveDealers.filter(row => row.days >= inactiveDays);
  const conversion = data.funnel.orders / data.funnel.quotes * 100;
  const staff: typeof staffState = staffState.month === month ? staffState : { month, snapshot: null, loading: true };
  const customers: typeof customerState = customerState.month === month ? customerState : { month, snapshot: null, loading: true };

  useEffect(() => {
    let active = true;
    let controller: AbortController;
    let refreshTimer: ReturnType<typeof setTimeout>;
    setStaffState({ month, snapshot: null, loading: true });

    const loadStaff = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      setStaffState(previous => ({ ...previous, loading: true }));
      try {
        const response = await fetch(`/api/crm-excellent-staff?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: controller.signal });
        const result: StaffResult = await response.json();
        if (!active) return;
        if (!result.snapshot || result.snapshot.month !== month || !Array.isArray(result.snapshot.rows)) {
          throw new Error(result.error || 'Chưa lấy được danh sách từ AMIS CRM.');
        }
        setStaffState({ month, snapshot: result.snapshot, error: result.error || (!response.ok ? 'AMIS CRM chưa cập nhật được dữ liệu mới.' : undefined), loading: false });
      } catch (error) {
        if (!active) return;
        setStaffState(previous => ({
          month,
          snapshot: previous.month === month ? previous.snapshot : null,
          error: error instanceof Error && error.name !== 'AbortError' ? error.message : 'Kết nối AMIS CRM quá thời gian chờ.',
          loading: false,
        }));
      } finally {
        clearTimeout(timeout);
        if (active) refreshTimer = setTimeout(loadStaff, 60_000);
      }
    };

    void loadStaff();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(refreshTimer);
    };
  }, [month]);

  useEffect(() => {
    let active = true;
    let controller: AbortController;
    let refreshTimer: ReturnType<typeof setTimeout>;
    setCustomerState({ month, snapshot: null, loading: true });

    const loadCustomers = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      setCustomerState(previous => ({ ...previous, loading: true }));
      try {
        const response = await fetch(`/api/crm-top-customers?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: controller.signal });
        const result: CustomerResult = await response.json();
        if (!active) return;
        if (!result.snapshot || result.snapshot.month !== month || !Array.isArray(result.snapshot.rows)) {
          throw new Error(result.error || 'Chưa lấy được danh sách khách hàng từ AMIS CRM.');
        }
        setCustomerState({ month, snapshot: result.snapshot, error: result.error || (!response.ok ? 'AMIS CRM chưa cập nhật được dữ liệu mới.' : undefined), loading: false });
      } catch (error) {
        if (!active) return;
        setCustomerState(previous => ({
          month,
          snapshot: previous.month === month ? previous.snapshot : null,
          error: error instanceof Error && error.name !== 'AbortError' ? error.message : 'Kết nối AMIS CRM quá thời gian chờ.',
          loading: false,
        }));
      } finally {
        clearTimeout(timeout);
        if (active) refreshTimer = setTimeout(loadCustomers, 60_000);
      }
    };

    void loadCustomers();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(refreshTimer);
    };
  }, [month]);

  return <section className={styles.overview} aria-label="Chi tiết điều hành">
    <div className={styles.mockLabel}><span>Các ô còn lại: dữ liệu mẫu</span><small>Đơn vị tiền các ô mẫu: triệu đồng</small></div>
    <div className={styles.pair}>
      <article className={styles.card} aria-label="Nhân viên xuất sắc">
        <header className={styles.heading}>
          <h2>Nhân viên xuất sắc</h2>
        </header>
        {staff.snapshot ? (staff.snapshot.rows.length ? <ol className={styles.staffList}>
          {staff.snapshot.rows.map((row, index) => <li key={row.id} className={styles.staffRow}>
            <span className={styles.staffAvatar} style={{ backgroundColor: staffColors[index % staffColors.length] }} aria-hidden="true">{initials(row.name)}</span>
            <div className={styles.staffIdentity}><strong>{index + 1}. {row.name}</strong><span>{row.organizationUnit}</span></div>
            <strong className={styles.staffRevenue}>{row.revenue.toLocaleString('vi-VN')}</strong>
          </li>)}
        </ol> : <p className={styles.staffEmpty}>Không có nhân viên trong kỳ đã chọn.</p>) : <p className={styles.staffEmpty} role="status">{staff.loading ? 'Đang tải từ AMIS CRM…' : 'Chưa lấy được dữ liệu nhân viên từ AMIS CRM.'}</p>}
        <div className={styles.staffSource}>
          <span>{staff.snapshot?.source || 'AMIS CRM · Nhân viên xuất sắc'} · {month.split('-').reverse().join('/')} · Đơn vị: đồng</span>
          {staff.snapshot && <span>{staff.error ? 'Bản lưu gần nhất' : 'Đọc lúc'}: {readTime(staff.snapshot.generatedAt)}{staff.loading ? ' · Đang cập nhật…' : ''}</span>}
          {staff.error && <span className={styles.staffError} role="status">{staff.error}{staff.snapshot ? ' Đang hiển thị bản lưu của kỳ đã chọn.' : ''}</span>}
        </div>
      </article>

      <article className={styles.card} aria-label="Top đại lý doanh số">
        <header className={styles.heading}>
          <h2>Top đại lý doanh số</h2>
        </header>
        {customers.snapshot ? (customers.snapshot.rows.length ? <ol className={styles.customerList}>
          {customers.snapshot.rows.map((row, index) => <li key={row.id} className={styles.customerRow}>
            <div className={styles.staffIdentity}><strong>{index + 1} {row.name}</strong><span>{row.code}</span></div>
            <strong className={styles.staffRevenue}>{row.revenue.toLocaleString('vi-VN')}</strong>
          </li>)}
        </ol> : <p className={styles.staffEmpty}>Không có khách hàng trong kỳ đã chọn.</p>) : <p className={styles.staffEmpty} role="status">{customers.loading ? 'Đang tải từ AMIS CRM…' : 'Chưa lấy được dữ liệu khách hàng từ AMIS CRM.'}</p>}
        <div className={styles.staffSource}>
          <span>{customers.snapshot?.source || 'AMIS CRM · KH có doanh số cao nhất'} · {month.split('-').reverse().join('/')} · Đơn vị: đồng</span>
          {customers.snapshot && <span>{customers.error ? 'Bản lưu gần nhất' : 'Đọc lúc'}: {readTime(customers.snapshot.generatedAt)}{customers.loading ? ' · Đang cập nhật…' : ''}</span>}
          {customers.error && <span className={styles.staffError} role="status">{customers.error}{customers.snapshot ? ' Đang hiển thị bản lưu của kỳ đã chọn.' : ''}</span>}
        </div>
      </article>
    </div>

    <div className={styles.pair}>
      <article className={`${styles.card} ${styles.warning}`}>
        <header className={styles.heading}>
          <h2>Đại lý không phát sinh đơn</h2>
          <div className={styles.dayFilter} role="group" aria-label="Số ngày không phát sinh đơn">{[30, 60, 90].map(days => <button type="button" key={days} aria-pressed={inactiveDays === days} onClick={() => setInactiveDays(days)}>{days}</button>)}<span>ngày</span></div>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Đại lý không phát sinh đơn">
            <thead><tr><th>Đại lý</th><th>Phụ trách</th><th className={styles.number}>Số ngày</th><th className={styles.number}>Đơn gần nhất</th></tr></thead>
            <tbody>{inactiveRows.map(row => <tr key={row.name}>
              <td className={styles.name}>{row.name}</td><td className={styles.name}>{row.owner}</td>
              <td className={`${styles.number} ${styles.alert}`}>{row.days}</td><td className={styles.number}>{row.lastOrder}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>

      <article className={`${styles.card} ${styles.danger}`}>
        <header className={styles.heading}><h2>Công nợ quá hạn theo đại lý</h2><button type="button" aria-expanded={showAllOverdue} onClick={() => setShowAllOverdue(value => !value)}>{showAllOverdue ? 'Thu gọn' : 'Chi tiết'}</button></header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Công nợ quá hạn theo đại lý">
            <thead><tr><th>Đại lý</th><th className={styles.number}>Quá hạn</th><th className={styles.number}>Tuổi nợ</th><th>Phụ trách</th></tr></thead>
            <tbody>{data.overdueDealers.slice(0, showAllOverdue ? undefined : 4).map(row => <tr key={row.name}>
              <td className={styles.name}>{row.name}</td><td className={`${styles.number} ${styles.alert}`}>{money(row.amount)}</td>
              <td className={styles.number}>{row.age}</td><td className={styles.name}>{row.owner}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>
    </div>

    <div className={styles.trio}>
      <article className={styles.card}>
        <header className={styles.heading}><h2>Top mẫu xe bán chạy</h2></header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Top mẫu xe bán chạy"><thead><tr><th>Mẫu xe</th><th className={styles.number}>Số xe</th><th className={styles.number}>Tồn</th></tr></thead>
            <tbody>{data.models.map(row => <tr key={row.name}><td>{row.name}</td><td className={styles.number}>{row.sold}</td><td className={styles.number}>{row.stock}</td></tr>)}</tbody>
          </table>
        </div>
      </article>

      <article className={styles.card}>
        <header className={styles.heading}><h2>Phễu báo giá → đơn hàng</h2></header>
        <div className={styles.funnel} aria-label="Các bước từ cơ hội đến đơn hàng">
          <div><span>Cơ hội</span><strong>{data.funnel.opportunities}</strong></div>
          <div style={{ width: `${data.funnel.quotes / data.funnel.opportunities * 100}%` }}><span>Báo giá</span><strong>{data.funnel.quotes}</strong></div>
          <div style={{ width: `${data.funnel.orders / data.funnel.opportunities * 100}%` }}><span>Đơn hàng</span><strong>{data.funnel.orders}</strong></div>
        </div>
        <p className={styles.conversion}>Tỷ lệ chuyển đổi báo giá → đơn: <strong>{conversion.toLocaleString('vi-VN')}%</strong></p>
      </article>

      <article className={`${styles.card} ${styles.warning}`}>
        <header className={styles.heading}><h2>Hàng tồn trên 90 ngày</h2></header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Hàng tồn trên 90 ngày"><thead><tr><th>SKU</th><th className={styles.number}>SL</th><th className={styles.number}>Giá trị vốn</th></tr></thead>
            <tbody>{data.agedStock.map(row => <tr key={row.sku}><td>{row.sku}</td><td className={styles.number}>{row.quantity}</td><td className={styles.number}>{money(row.cost)}</td></tr>)}</tbody>
          </table>
        </div>
      </article>
    </div>
  </section>;
}
