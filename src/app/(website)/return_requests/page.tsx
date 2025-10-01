// src/app/(website)/return_requests/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './return_requests.module.css';
import NavbarAdmin from '../components/NavbarAdmin';
import Link from 'next/link';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

// ✅ รองรับค่าจาก API ใหม่และของเดิมเพื่อความเข้ากันได้ย้อนหลัง
type AllowedReturnStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'รอดำเนินการ'
  | 'อนุมัติ'
  | 'ปฏิเสธ';

type ProductLite = {
  id?: string;
  name?: string;
  imageUrls?: string[];
  price?: unknown;
  stock?: unknown;
  category?: string | null;
};

type OrderItemLite = {
  id?: string;
  productId?: string;
  quantity?: number;
  size?: SizeKey | string;
  unitPrice?: number;
  totalPrice?: number;
  product?: ProductLite | null;
};

type ReturnItemApi = {
  id?: string;
  quantity?: number;
  orderItemId?: string;
  orderItem?: OrderItemLite;
};

type UserLite = {
  id?: string;
  email?: string | null;
  name?: string | null;
};

type OrderLite = {
  id?: string;
  trackingId?: string | null;
  user?: UserLite | null;
};

type ReturnRequestApi = {
  id?: string;
  status?: AllowedReturnStatus;
  reason?: string | null;
  adminNote?: string | null;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
  createdAtThai?: string;
  updatedAtThai?: string;
  items?: ReturnItemApi[];
  order?: OrderLite | null;
};

type ReturnRequestRow = {
  id: string;
  status: AllowedReturnStatus;
  statusDisplay: 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ' | 'ยกเลิกคำขอ';
  reason: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    trackingId: string | null;
    userName: string | null;
    userEmail: string | null;
  } | null;
  totalQty: number;
  totalLines: number;
};

const toStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ✅ ฟอร์แมตเป็นเวลาประเทศไทย
const fmtTH = (iso?: string, th?: string) => {
  if (th && th.trim()) return th;
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
  } catch {
    return iso;
  }
};

// ✅ map สถานะทั้งหมดให้เป็น label ภาษาไทยเดียวกัน
const statusToDisplay = (
  s: AllowedReturnStatus | undefined
): ReturnRequestRow['statusDisplay'] => {
  const raw = (s ?? 'pending') as AllowedReturnStatus;
  switch (raw) {
    case 'pending':
    case 'รอดำเนินการ':
      return 'รอดำเนินการ';
    case 'approved':
    case 'อนุมัติ':
      return 'อนุมัติ';
    case 'rejected':
    case 'ปฏิเสธ':
      return 'ปฏิเสธ';
    case 'cancelled':
      return 'ยกเลิกคำขอ';
    default:
      // ถ้าเจอค่านอกเหนือที่คาด ให้ถือเป็นรอดำเนินการเพื่อกัน UI พัง
      return 'รอดำเนินการ';
  }
};

// ✅ สีป้ายให้ครบ 4 สถานะ
const pillClass = (s: AllowedReturnStatus) => {
  const disp = statusToDisplay(s);
  if (disp === 'รอดำเนินการ') return `${styles.pill} ${styles.pillPending}`;
  if (disp === 'อนุมัติ') return `${styles.pill} ${styles.pillApproved}`;
  if (disp === 'ปฏิเสธ') return `${styles.pill} ${styles.pillRejected}`;
  if (disp === 'ยกเลิกคำขอ') return `${styles.pill} ${styles.pillCancelled}`;
  return styles.pill;
};

export default function ReturnRequestsPage() {
  const [rows, setRows] = useState<ReturnRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ' | 'ยกเลิกคำขอ'
  >('ALL');

  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/return_requests', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);

        const raw: unknown = await res.json();
        if (!Array.isArray(raw)) {
          setRows([]);
          return;
        }

        const mapped: ReturnRequestRow[] = raw.map((r): ReturnRequestRow => {
          const rr = (r ?? {}) as ReturnRequestApi;

          const itemsArr = Array.isArray(rr.items) ? rr.items : [];
          const totalQty = itemsArr.reduce((acc, it) => acc + toNum(it?.quantity), 0);
          const order = rr.order ?? null;

          const userName = order?.user?.name ?? null;
          const userEmail = order?.user?.email ?? null;

          return {
            id: toStr(rr.id),
            status: (rr.status ?? 'pending') as AllowedReturnStatus,
            statusDisplay: statusToDisplay(rr.status),
            reason: rr.reason ?? null,
            adminNote: rr.adminNote ?? null,
            createdAt: fmtTH(rr.createdAt, rr.createdAtThai),
            updatedAt: fmtTH(rr.updatedAt, rr.updatedAtThai),
            order: order
              ? {
                  id: toStr(order.id),
                  trackingId: order.trackingId == null ? null : toStr(order.trackingId),
                  userName,
                  userEmail,
                }
              : null,
            totalQty,
            totalLines: itemsArr.length,
          };
        });

        setRows(mapped);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดคำขอคืนสินค้าไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const statusTerm = statusFilter;

    return rows.filter((r) => {
      const display = r.statusDisplay;
      if (statusTerm !== 'ALL' && display !== statusTerm) return false;

      if (!term) return true;

      const hay = [
        r.id,
        r.order?.id ?? '',
        r.order?.trackingId ?? '',
        r.order?.userName ?? '',
        r.order?.userEmail ?? '',
        r.reason ?? '',
        r.adminNote ?? '',
        r.createdAt ?? '',
        r.updatedAt ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(term);
    });
  }, [rows, q, statusFilter]);

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>คำขอคืนสินค้า</h1>

          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                className={styles.search}
                placeholder="ค้นหา (Request ID, Order ID, ชื่อ, อีเมล, Tracking)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <select
              className={styles.select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              aria-label="กรองสถานะ"
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="รอดำเนินการ">รอดำเนินการ</option>
              <option value="อนุมัติ">อนุมัติ</option>
              <option value="ปฏิเสธ">ปฏิเสธ</option>
              <option value="ยกเลิกคำขอ">ยกเลิกคำขอ</option>
            </select>
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
                  <th>Request ID</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Tracking</th>
                  <th>Items</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Created / Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={styles.empty}>
                      ไม่พบคำขอคืนสินค้า
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.mono}>{r.id}</td>
                      <td>{r.order ? <span className={styles.mono}>ORD-{r.order.id}</span> : '-'}</td>
                      <td>
                        {r.order?.userName ?? '-'}
                        <div className={styles.subtle}>{r.order?.userEmail ?? ''}</div>
                      </td>
                      <td className={styles.mono}>{r.order?.trackingId ?? '-'}</td>
                      <td className={styles.cellCenter}>{r.totalLines}</td>
                      <td className={styles.cellCenter}>{r.totalQty}</td>
                      <td>
                        <span className={pillClass(r.status)}>{r.statusDisplay}</span>
                      </td>
                      <td>
                        <div>{r.createdAt}</div>
                        <div className={styles.subtle}>{r.updatedAt}</div>
                      </td>
                      <td>
                        <Link
                          href={`/return-details/${r.id}`}
                          className={styles.link}
                          title="ไปหน้ารายละเอียดคำขอคืนสินค้า"
                        >
                          ดูคำขอ →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div ref={overlayRef} />
      </div>
    </>
  );
}
