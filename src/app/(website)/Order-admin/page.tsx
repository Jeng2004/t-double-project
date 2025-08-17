'use client';

import styles from './Order-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

const orders = [
  {
    id: 'ORD001',
    status: 'กำลังจัดส่ง',
    trackingId: 'TH1234567890',
    date: '2025-07-20',
  },
  {
    id: 'ORD002',
    status: 'จัดส่งสำเร็จ',
    trackingId: 'TH2345678901',
    date: '2025-07-19',
  },
  {
    id: 'ORD003',
    status: 'รอดำเนินการ',
    trackingId: '-',
    date: '2025-07-18',
  },
];

export default function OrderAdminPage() {
  return (
    <>
      <NavbarAdmin />
      <div className={styles.container}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>รหัสคำสั่งซื้อ</th>
              <th>สถานะ</th>
              <th>Tracking ID</th>
              <th>วันที่สั่งซื้อ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.status}</td>
                <td>{order.trackingId}</td>
                <td>{order.date}</td>
                <td>
                  <button className={styles.actionBtn}>อัปเดต</button>
                  <button className={styles.deleteBtn}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
