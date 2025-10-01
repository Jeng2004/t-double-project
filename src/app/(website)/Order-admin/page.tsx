'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Order-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'ลูกค้าคืนสินค้า'; // ✅ รองรับสถานะคืนสินค้า

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  product?: { name?: string | null } | null;
};

type OrderRow = {
  id: string;
  trackingId: string | null;
  status: AllowedStatus;
  createdAt: string;
  createdAtThai?: string | null;
  totalAmount?: number | null;
  orderItems?: OrderItem[];
  user?: { name?: string | null; email?: string | null } | null;
};

const STATUS_LIST: AllowedStatus[] = [
  'ยกเลิก',
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
  'ลูกค้าคืนสินค้า', // ✅ เพิ่มในรายการเลือก
];

const fmtTH = (iso: string, thai?: string | null) => {
  if (thai && thai.trim()) return thai;
  try {
    return new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
  } catch {
    return iso;
  }
};
const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); }
};

export default function OrderAdmin2Page() {
  const router = useRouter();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [openForId, setOpenForId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<AllowedStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [popPos, setPopPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);

        const raw: unknown = await res.json();
        if (!Array.isArray(raw)) {
          setRows([]);
          return;
        }

        const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
        const toNum = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        const toStatus = (v: unknown): AllowedStatus => {
          const s = String(v ?? '');
          return (STATUS_LIST as string[]).includes(s) ? (s as AllowedStatus) : 'รอดำเนินการ';
        };

        const mapped: OrderRow[] = raw.map((o): OrderRow => {
          const ro = (o ?? {}) as Record<string, unknown>;

          const itemsRaw = Array.isArray(ro.orderItems) ? ro.orderItems : [];
          const orderItems: OrderItem[] = itemsRaw.map((it): OrderItem => {
            const r = (it ?? {}) as Record<string, unknown>;
            const p = (r.product as Record<string, unknown> | undefined) ?? undefined;

            return {
              id: toStr(r.id),
              quantity: toNum(r.quantity),
              unitPrice: typeof r.unitPrice === 'number' ? r.unitPrice : null,
              totalPrice: typeof r.totalPrice === 'number' ? r.totalPrice : null,
              product: p ? { name: (p.name as string | null | undefined) ?? null } : null,
            };
          });

          const u = (ro.user as Record<string, unknown> | undefined) ?? undefined;

          return {
            id: toStr(ro.id),
            trackingId: ro.trackingId == null ? null : toStr(ro.trackingId),
            status: toStatus(ro.status),
            createdAt: toStr(ro.createdAt),
            createdAtThai: ro.createdAtThai == null ? null : toStr(ro.createdAtThai),
            totalAmount: typeof ro.totalAmount === 'number' ? ro.totalAmount : null,
            orderItems,
            user: u ? { name: (u.name as string | null | undefined) ?? null, email: (u.email as string | null | undefined) ?? null } : null,
          };
        });

        setRows(mapped);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดคำสั่งซื้อไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const id = r.id.toLowerCase();
      const name = (r.user?.name ?? '').toLowerCase();
      const email = (r.user?.email ?? '').toLowerCase();
      const tracking = (r.trackingId ?? '').toLowerCase();
      return id.includes(term) || name.includes(term) || email.includes(term) || tracking.includes(term);
    });
  }, [rows, q]);

  const calcTotal = (r: OrderRow): number => {
    if (typeof r.totalAmount === 'number') return r.totalAmount;
    return (r.orderItems ?? []).reduce((acc, it) => {
      const line = it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * (it.quantity || 0) : 0);
      return acc + (line || 0);
    }, 0);
  };

  // ✅ สีสถานะให้ตรงกับหน้าแสดงออเดอร์ (badge*)
  const pillClass = (s: AllowedStatus) => {
    switch (s) {
      case 'ยกเลิก':
        return `${styles.pill} ${styles.pillCancelled}`;
      case 'รอดำเนินการ':
        return `${styles.pill} ${styles.pillPending}`;
      case 'กำลังดำเนินการจัดเตรียมสินค้า':
        return `${styles.pill} ${styles.pillPreparing}`;
      case 'กำลังดำเนินการจัดส่งสินค้า':
        return `${styles.pill} ${styles.pillShipping}`;
      case 'จัดส่งสินค้าสำเร็จเเล้ว':
        return `${styles.pill} ${styles.pillCompleted}`;
      case 'ลูกค้าคืนสินค้า':
        return `${styles.pill} ${styles.pillReturn}`;
      default:
        return styles.pill;
    }
  };

  const openPopover = (order: OrderRow, e: React.MouseEvent) => {
    setOpenForId(order.id);
    setDraftStatus(order.status);
    setPopPos({ x: e.clientX, y: e.clientY });
  };
  const closePopover = () => {
    setOpenForId(null);
    setDraftStatus(null);
  };

  useEffect(() => {
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closePopover(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const saveStatus = async () => {
    if (!openForId || !draftStatus) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/orders/${encodeURIComponent(openForId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: draftStatus }),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);

      setRows((prev) => prev.map((r) => (r.id === openForId ? { ...r, status: draftStatus } : r)));
      closePopover();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const goToDetails = (id: string) => {
    router.push(`/Order-details-admin/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>คำสั่งซื้อ</h1>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.search}
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>กำลังโหลด…</div>
        ) : err ? (
          <div className={styles.error}>❌ {err}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer Name</th>
                  <th>Order Date</th>
                  <th>Total Amount</th>
                  <th>Order Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.empty}>ไม่พบคำสั่งซื้อ</td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => goToDetails(r.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') goToDetails(r.id); }}
                          title="ดูรายละเอียดคำสั่งซื้อ"
                        >
                          #{r.id}
                        </button>
                      </td>
                      <td>{r.user?.name ?? 'Name'}</td>
                      <td>{fmtTH(r.createdAt, r.createdAtThai)}</td>
                      <td>฿{nf(calcTotal(r))}</td>
                      <td>
                        <button
                          type="button"
                          className={pillClass(r.status)}
                          onClick={(e) => openPopover(r, e)}
                          title="เปลี่ยนสถานะ"
                        >
                          {r.status}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openForId && (
        <>
          <div ref={overlayRef} className={styles.overlay} onClick={closePopover} />
          <div
            className={styles.popover}
            style={{ left: Math.max(16, popPos.x - 160), top: Math.max(16, popPos.y + 10) }}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.popList}>
              {STATUS_LIST.map((s) => (
                <label key={s} className={styles.popOption}>
                  <input
                    type="radio"
                    name="order-status"
                    value={s}
                    checked={draftStatus === s}
                    onChange={() => setDraftStatus(s)}
                  />
                  <span className={pillClass(s)}>{s}</span>
                </label>
              ))}
            </div>
            <div className={styles.popActions}>
              <button className={styles.btnGhost} onClick={closePopover} disabled={saving}>ยกเลิก</button>
              <button className={styles.btnPrimary} onClick={saveStatus} disabled={saving || !draftStatus}>
                {saving ? 'กำลังอัปเดต…' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
