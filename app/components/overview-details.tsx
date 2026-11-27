'use client';

import { useState } from 'react';
import { overviewMockData as data } from './overview-mock-data';
import styles from './overview-details.module.css';

const money = (value: number) => (value / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

export default function OverviewDetails() {
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [showTop20, setShowTop20] = useState(false);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(30);
  const inactiveRows = data.inactiveDealers.filter(row => row.days >= inactiveDays);
  const conversion = data.funnel.orders / data.funnel.quotes * 100;

  return <section className={styles.overview} aria-label="Chi tiết điều hành — dữ liệu mẫu">
    <div className={styles.mockLabel}><span>Dữ liệu mẫu</span><small>Đơn vị tiền: triệu đồng</small></div>
    <div className={styles.pair}>
      <article className={styles.card}>
        <header className={styles.heading}>
          <h2>Top nhân viên kinh doanh</h2>
          <button type="button" aria-expanded={showAllStaff} onClick={() => setShowAllStaff(value => !value)}>{showAllStaff ? 'Thu gọn' : 'Chi tiết'}</button>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Top nhân viên kinh doanh">
            <thead><tr><th>#</th><th>Nhân viên</th><th className={styles.number}>Doanh số</th><th className={styles.number}>Thực thu</th><th className={styles.number}>% KPI</th></tr></thead>
            <tbody>{data.staff.slice(0, showAllStaff ? undefined : 5).map((row, index) => <tr key={row.name}>
              <td className={styles.rank}>{index + 1}</td><td className={styles.name}>{row.name}</td>
              <td className={styles.number}>{money(row.sales)}</td><td className={styles.number}>{money(row.collected)}</td>
              <td className={styles.number}>{row.kpi}%</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>

      <article className={styles.card}>
        <header className={styles.heading}>
          <h2>Top đại lý doanh số</h2>
          <button type="button" aria-expanded={showTop20} onClick={() => setShowTop20(value => !value)}>{showTop20 ? 'Top 5' : 'Top 20'}</button>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Top đại lý doanh số">
            <thead><tr><th>#</th><th>Đại lý</th><th>Tỉnh</th><th className={styles.number}>Doanh số</th><th className={styles.number}>Tăng/giảm</th></tr></thead>
            <tbody>{data.dealers.slice(0, showTop20 ? 20 : 5).map((row, index) => <tr key={row.name}>
              <td className={styles.rank}>{index + 1}</td><td className={styles.name}>{row.name}</td><td className={styles.name}>{row.province}</td>
              <td className={styles.number}>{money(row.sales)}</td>
              <td className={`${styles.number} ${row.growth < 0 ? styles.negative : styles.positive}`}>{percent(row.growth)}</td>
            </tr>)}</tbody>
          </table>
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
