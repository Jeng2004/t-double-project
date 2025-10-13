// src/app/(website)/Specail-admin/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Specail-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

/** ให้สถานะตรงกับหน้า Special-admin-id/[id] */
type AllowedStatus =
  | 'ยกเลิก'
  | 'ยกเลิก - คืนเงินเรียบร้อย'
  | 'รอชำระเงิน'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'ลูกค้าคืนสินค้า';

type SpecialOrder = {
  id: string;
  productName: string;
  sizeDetail: string;
  quantity: number;
  price?: number | null;
  totalAmount?: number | null;
  status: AllowedStatus;
  createdAt: string;
  createdAtThai?: string | null;
  trackingId?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

type SpecialOrderApi = {
  id?: string | number;
  productName?: string | null;
  sizeDetail?: string | null;
  quantity?: number | string | null;
  price?: number | null;
  totalAmount?: number | null;
  status?: string | null;
  createdAt?: string | null;
  createdAtThai?: string | null;
  trackingId?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

/** รวมสถานะทั้งหมดที่อยากให้หน้า list รองรับ */
const STATUS_LIST: AllowedStatus[] = [
  'ยกเลิก',
  'ยกเลิก - คืนเงินเรียบร้อย',
  'รอชำระเงิน',
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
  'ลูกค้าคืนสินค้า',
];

const nf = (n: number) => new Intl.NumberFormat('th-TH').format(n);
const fmtTH = (iso: string, thai?: string | null) =>
  thai && thai.trim()
    ? thai
    : new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const toStr = (v: unknown) => (v == null ? '' : String(v));
const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** parse สถานะจาก API ให้คงสถานะจริง ถ้าไม่อยู่ในลิสต์จะ fallback เป็น 'รอดำเนินการ' */
const toStatus = (s: unknown): AllowedStatus => {
  const raw = String(s ?? '').trim();
  if ((STATUS_LIST as string[]).includes(raw)) return raw as AllowedStatus;
  return 'รอดำเนินการ';
};

/** map class ป้ายสถานะ โดยพยายามใช้ class เดิมที่มีอยู่ */
const pillClass = (s: AllowedStatus) => {
  switch (s) {
    case 'ยกเลิก':
    case 'ยกเลิก - คืนเงินเรียบร้อย':
      return `${styles.pill} ${styles.pillCancelled}`; // ใช้สีเดียวกับยกเลิก
    case 'รอชำระเงิน':
      return `${styles.pill} ${styles.pillUnpaid}`;
    case 'รอดำเนินการ':
      return `${styles.pill} ${styles.pillPending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า':
      return `${styles.pill} ${styles.pillPreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า':
      return `${styles.pill} ${styles.pillShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว':
      return `${styles.pill} ${styles.pillCompleted}`;
    case 'ลูกค้าคืนสินค้า':
      // ถ้าไม่มีคลาสเฉพาะ ให้ใช้ cancelled (หรือจะเปลี่ยนเป็น completed ก็ได้)
      return `${styles.pill} ${styles.pillCancelled}`;
    default:
      return styles.pill;
  }
};

export default function SpecailAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SpecialOrder[]>([]);
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
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch('/api/special-orders', { cache: 'no-store' });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);

        let jsonUnknown: unknown;
        try {
          jsonUnknown = JSON.parse(text);
        } catch {
          jsonUnknown = text;
        }

        let listUnknown: unknown[] = [];
        if (Array.isArray(jsonUnknown)) {
          listUnknown = jsonUnknown;
        } else if (isRecord(jsonUnknown) && Array.isArray(jsonUnknown.orders)) {
          listUnknown = jsonUnknown.orders as unknown[];
        } else if (isRecord(jsonUnknown) && jsonUnknown.order) {
          listUnknown = [jsonUnknown.order as unknown];
        }

        const mapped: SpecialOrder[] = listUnknown.map((rowUnknown) => {
          const o = rowUnknown as SpecialOrderApi;
          return {
            id: toStr(o.id),
            productName: toStr(o.productName ?? 'Special Order'),
            sizeDetail: toStr(o.sizeDetail ?? ''),
            quantity: toNum(o.quantity ?? 0),
            price: typeof o.price === 'number' ? o.price : null,
            totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : null,
            status: toStatus(o.status),
            createdAt: toStr(o.createdAt ?? new Date().toISOString()),
            createdAtThai: o.createdAtThai ?? null,
            trackingId: o.trackingId ?? null,
            user: o.user ? { name: o.user.name ?? null, email: o.user.email ?? null } : null,
          };
        });

        setRows(mapped);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดออเดอร์พิเศษไม่สำเร็จ');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.id.toLowerCase().includes(term) ||
        (r.user?.name ?? '').toLowerCase().includes(term) ||
        (r.user?.email ?? '').toLowerCase().includes(term) ||
        (r.trackingId ?? '').toLowerCase().includes(term)
    );
  }, [rows, q]);

  const openPopover = (order: SpecialOrder, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenForId(order.id);
    setDraftStatus(order.status);
    setPopPos({ x: e.clientX, y: e.clientY });
  };

  const saveStatus = async () => {
    if (!openForId || !draftStatus) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/special-orders/${encodeURIComponent(openForId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: draftStatus }),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);

      setRows((prev) => prev.map((r) => (r.id === openForId ? { ...r, status: draftStatus } : r)));
      setOpenForId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const goToDetails = (id: string) => {
    router.push(`/Special-admin-id/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>จัดการออเดอร์พิเศษ</h1>
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
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Size / หมายเหตุ</th>
                  <th>จำนวน</th>
                  <th>ราคา</th>
                  <th>สถานะ</th>
                  <th>วันที่สั่งซื้อ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
                      ไม่พบออเดอร์พิเศษ
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          className={styles.linkBtn}
                          onClick={() => goToDetails(r.id)}
                        >
                          #{r.id}
                        </button>
                      </td>
                      <td>{r.user?.name ?? '-'}</td>
                      <td>{r.productName}</td>
                      <td>{r.sizeDetail}</td>
                      <td>{r.quantity}</td>
                      <td>{typeof r.price === 'number' ? `฿${nf(r.price)}` : '—'}</td>
                      <td>
                        <button
                          className={pillClass(r.status)}
                          onClick={(e) => openPopover(r, e)}
                          title="เปลี่ยนสถานะ"
                        >
                          {r.status}
                        </button>
                      </td>
                      <td>{fmtTH(r.createdAt, r.createdAtThai)}</td>
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
          <div ref={overlayRef} className={styles.overlay} onClick={() => setOpenForId(null)} />
          <div
            className={styles.popover}
            style={{ left: popPos.x - 160, top: popPos.y + 10 }}
          >
            <div className={styles.popList}>
              {STATUS_LIST.map((s) => (
                <label key={s} className={styles.popOption}>
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={draftStatus === s}
                    onChange={() => setDraftStatus(s)}
                  />
                  <span className={pillClass(s)}>{s}</span>
                </label>
              ))}
            </div>
            <div className={styles.popActions}>
              <button className={styles.btnGhost} onClick={() => setOpenForId(null)}>
                ยกเลิก
              </button>
              <button className={styles.btnPrimary} onClick={saveStatus} disabled={saving}>
                {saving ? 'กำลังอัปเดต…' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
