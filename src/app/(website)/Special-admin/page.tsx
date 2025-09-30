'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Specail-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอชำระเงิน'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว';

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

const STATUS_LIST: AllowedStatus[] = [
  'ยกเลิก',
  'รอชำระเงิน',
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
];

const nf = (n: number) => new Intl.NumberFormat('th-TH').format(n);
const fmtTH = (iso: string, thai?: string | null) =>
  thai && thai.trim()
    ? thai
    : new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });

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

        let json: any = {};
        try { json = JSON.parse(text); } catch { json = text; }

        // รองรับหลายรูปแบบผลลัพธ์: [ ... ] | { orders:[...] } | { order:{...} }
        let list: any[] = [];
        if (Array.isArray(json)) list = json;
        else if (Array.isArray(json?.orders)) list = json.orders;
        else if (json?.order) list = [json.order];
        else list = [];

        const STATUS_LIST: AllowedStatus[] = [
          'ยกเลิก',
          'รอชำระเงิน',
          'รอดำเนินการ',
          'กำลังดำเนินการจัดเตรียมสินค้า',
          'กำลังดำเนินการจัดส่งสินค้า',
          'จัดส่งสินค้าสำเร็จเเล้ว',
        ];
        const toStatus = (s: any): AllowedStatus =>
          STATUS_LIST.includes(s as AllowedStatus) ? (s as AllowedStatus) : 'รอดำเนินการ';
        const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
        const toStr = (v: any) => (v == null ? '' : String(v));

        const mapped: SpecialOrder[] = list.map((o: any) => ({
          id: toStr(o.id),
          productName: toStr(o.productName || 'Special Order'),
          sizeDetail: toStr(o.sizeDetail || ''),
          quantity: toNum(o.quantity || 0),
          price: typeof o.price === 'number' ? o.price : null,
          totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : null,
          status: toStatus(o.status),
          createdAt: toStr(o.createdAt || new Date().toISOString()),
          createdAtThai: o.createdAtThai ?? null,
          trackingId: o.trackingId ?? null,
          user: o.user
            ? { name: o.user.name ?? null, email: o.user.email ?? null }
            : null,
        }));

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

  const pillClass = (s: AllowedStatus) => {
    switch (s) {
      case 'ยกเลิก':
        return `${styles.pill} ${styles.pillCancelled}`;
      case 'รอชำระเงิน':
        return `${styles.pill} ${styles.pillUnpaid}`;
      case 'รอดำเนินการ':
        return `${styles.pill} ${styles.pillPending}`;
      case 'กำลังดำเนินการจัดเตรียมสินค้า':
        return `${styles.pill} ${styles.pillPreparing}`;
      case 'กำลังดำเนินการจัดส่งสินค้า':
        return `${styles.pill} ${styles.pillShipping}`;
      case 'จัดส่งสินค้าสำเร็จเเล้ว':
      default:
        return `${styles.pill} ${styles.pillCompleted}`;
    }
  };

  const openPopover = (order: SpecialOrder, e: React.MouseEvent) => {
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

      setRows((prev) =>
        prev.map((r) => (r.id === openForId ? { ...r, status: draftStatus } : r))
      );
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
                      <td>{r.price ? `฿${nf(r.price)}` : '—'}</td>
                      <td>
                        <button
                          className={pillClass(r.status)}
                          onClick={(e) => openPopover(r, e)}
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
