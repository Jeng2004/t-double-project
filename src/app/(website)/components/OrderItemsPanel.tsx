// src/app/(website)/components/OrderItemsPanel.tsx
'use client';

import styles from './OrderItemsPanel.module.css';

type OrderItem = {
  id: string;
  size: string;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  product?: { name?: string | null } | null;
};

const fmt = (n?: number | null) =>
  typeof n === 'number' && Number.isFinite(n) ? `${n.toLocaleString('th-TH')}฿` : '-';

export default function OrderItemsPanel({ items }: { items?: OrderItem[] }) {
  if (!items || items.length === 0) {
    return <div className={styles.empty}>ไม่มีสินค้าในออเดอร์นี้</div>;
  }

  const grand = items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>สินค้า</th>
            <th>ไซส์</th>
            <th>จำนวน</th>
            <th>ราคา/ชิ้น</th>
            <th>ราคารวม</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.product?.name ?? '-'}</td>
              <td>{it.size}</td>
              <td>{it.quantity}</td>
              <td>{fmt(it.unitPrice)}</td>
              <td>{fmt(it.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.totalLabel} colSpan={4}>รวมทั้งออเดอร์</td>
            <td className={styles.totalValue}>{fmt(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
