// C:\Users\yodsa\t-double-project\src\app\(website)\Order-admin\page.tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './Order-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว';

const ALLOWED_STATUS: AllowedStatus[] = [
  'ยกเลิก',
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
];

type OrderItem = {
  id: string;
  productId: string;
  size: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  product?: { name: string };
};

type OrderRow = {
  id: string;
  trackingId: string | null;
  status: AllowedStatus;
  createdAt: string;           // ISO
  createdAtThai?: string | null;
  orderItems?: OrderItem[];    // from API include
  user?: { email?: string | null; name?: string | null };
};

const fmtTH = (iso: string, thai?: string | null) => {
  if (thai && thai.trim()) return thai;
  try {
    return new Date(iso).toLocaleString('th-TH', { hour12: false });
  } catch {
    return iso;
  }
};

const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); }
};

export default function OrderAdminPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // แสดงรายละเอียดใต้แถวนั้น

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} ${t}`);
      }
      const data: unknown = await res.json();

      if (!Array.isArray(data)) {
        setRows([]);
        return;
      }
      const mapped: OrderRow[] = (Array.isArray(data) ? data : []).map((o) => ({
        id: o.id,
        trackingId: o.trackingId ?? null,
        status: o.status as AllowedStatus,
        createdAt: o.createdAt,
        createdAtThai: o.createdAtThai ?? null,
        orderItems: o.orderItems ?? [],
        user: o.user ?? undefined,
      }));
      setRows(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'โหลดคำสั่งซื้อไม่สำเร็จ';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const onChangeStatus = (id: string, next: AllowedStatus) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    try {
      setSavingId(id);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: row.status }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PATCH ${res.status}: ${t}`);
      }
      await load();
      alert('อัปเดตสถานะสำเร็จ');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  };

  // ใช้แทน “ลบ” = ยกเลิกออเดอร์
  const cancelOrder = async (id: string) => {
    if (!confirm('ต้องการยกเลิกคำสั่งซื้อนี้หรือไม่?')) return;
    try {
      setSavingId(id);
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'ยกเลิก' }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PATCH ${res.status}: ${t}`);
      }
      await load();
      alert('ยกเลิกคำสั่งซื้อสำเร็จ');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <NavbarAdmin />
      <div className={styles.container}>
        {loading ? (
          <div>กำลังโหลดคำสั่งซื้อ…</div>
        ) : err ? (
          <div style={{ color: '#c00', marginBottom: 12 }}>
            ❌ {err}{' '}
            <button
              onClick={load}
              style={{
                marginLeft: 8, background: '#000', color: '#fff',
                border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              }}
            >
              ลองใหม่
            </button>
          </div>
        ) : (
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>ไม่มีคำสั่งซื้อ</td>
                </tr>
              ) : (
                rows.map((o) => {
                  const isOpen = !!expanded[o.id];
                  return (
                    // แสดง 2 แถวต่อคำสั่งซื้อ: แถวหลัก + แถวรายละเอียด (ถ้าเปิด)
                    <FragmentWrapper key={o.id}>
                      <tr>
                        <td>
                          <button
                            onClick={() => toggleExpand(o.id)}
                            className={styles.expandBtn}
                            title={isOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                          >
                            {isOpen ? '▾' : '▸'}
                          </button>
                          <span className={styles.orderId}>{o.id}</span>
                          {o.user?.email && (
                            <div className={styles.muted}>ลูกค้า: {o.user.name ?? '-'} | {o.user.email}</div>
                          )}
                        </td>
                        <td>
                          <select
                            value={o.status}
                            onChange={(e) => onChangeStatus(o.id, e.target.value as AllowedStatus)}
                            disabled={savingId === o.id}
                            style={{ padding: 6 }}
                          >
                            {ALLOWED_STATUS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td>{o.trackingId || '-'}</td>
                        <td>{fmtTH(o.createdAt, o.createdAtThai)}</td>
                        <td>
                          <button
                            className={styles.actionBtn}
                            onClick={() => saveRow(o.id)}
                            disabled={savingId === o.id}
                          >
                            {savingId === o.id ? 'กำลังอัปเดต…' : 'อัปเดต'}
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => cancelOrder(o.id)}
                            disabled={savingId === o.id}
                          >
                            ยกเลิก
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className={styles.detailRow}>
                          <td colSpan={5}>
                            {(o.orderItems?.length ?? 0) === 0 ? (
                              <div className={styles.muted}>ไม่มีรายการสินค้าในคำสั่งซื้อ</div>
                            ) : (
                              <div className={styles.itemsWrap}>
                                <div className={styles.itemsHeader}>
                                  <div>สินค้า</div>
                                  <div>ไซส์</div>
                                  <div>จำนวน</div>
                                  <div>ราคาต่อหน่วย</div>
                                  <div>ราคารวม</div>
                                </div>
                                {o.orderItems!.map((it) => (
                                  <div key={it.id} className={styles.itemRow}>
                                    <div className={styles.itemName}>{it.product?.name ?? it.productId}</div>
                                    <div>{it.size}</div>
                                    <div>{it.quantity}</div>
                                    <div>{it.unitPrice != null ? `${nf(it.unitPrice)}฿` : '-'}</div>
                                    <div>{it.totalPrice != null ? `${nf(it.totalPrice)}฿` : '-'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </FragmentWrapper>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/** เลี่ยง import React, { Fragment } — ใช้ wrapper เล็ก ๆ */
function FragmentWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
