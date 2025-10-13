'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import NavbarAdmin from '../components/NavbarAdmin';
import styles from './Special-return-admin.module.css';

type ReturnRequest = {
  id: string;
  specialOrderId: string;
  reason: string | null;
  images: string[];             // public path เช่น /uploads/xxx.jpg
  status: 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ';
  adminNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type RequestWithOrder = ReturnRequest & {
  specialOrder?: {
    id: string;
    trackingId: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    status?: string | null;
  } | null;
};

const fmt = (iso?: string) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  } catch {
    return iso;
  }
};

export default function SpecialReturnAdminPage() {
  const [rows, setRows] = useState<RequestWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // โหลดรายการคำขอคืนสินค้า
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // ดึงรายการคำขอทั้งหมด
        const res = await fetch('/api/returnspecialrequest', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const list = (await res.json()) as ReturnRequest[];

        // enrich: ลองดึงข้อมูล special order บางส่วน (trackingId/ชื่อ) แบบขี้เกียจทีละรายการ
        const enriched: RequestWithOrder[] = [];
        for (const r of list) {
          try {
            const oRes = await fetch(`/api/special-orders/${encodeURIComponent(r.specialOrderId)}`, { cache: 'no-store' });
            let specialOrder: RequestWithOrder['specialOrder'] = null;
            if (oRes.ok) {
              const data = await oRes.json();
              specialOrder = {
                id: data?.id,
                trackingId: data?.trackingId ?? null,
                firstName: data?.firstName ?? null,
                lastName: data?.lastName ?? null,
                email: data?.email ?? null,
                status: data?.status ?? null,
              };
            }
            enriched.push({ ...r, specialOrder });
          } catch {
            enriched.push({ ...r, specialOrder: null });
          }
        }

        setRows(enriched);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setRows([]);
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
      const so = r.specialOrder;
      const orderId = r.specialOrderId.toLowerCase();
      const tracking = (so?.trackingId ?? '').toLowerCase();
      const name = [so?.firstName ?? '', so?.lastName ?? ''].join(' ').trim().toLowerCase();
      return id.includes(term) || orderId.includes(term) || tracking.includes(term) || name.includes(term);
    });
  }, [rows, q]);

  const openPanel = (r: RequestWithOrder) => {
    setActiveId(r.id);
    setNote(r.adminNote ?? '');
  };

  const closePanel = () => {
    setActiveId(null);
    setNote('');
  };

  const doUpdate = async (status: 'อนุมัติ' | 'ปฏิเสธ') => {
    if (!activeId) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/return-special-orders/${encodeURIComponent(activeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'อัปเดตสถานะไม่สำเร็จ');

      // อัปเดตในตาราง
      setRows((prev) =>
        prev.map((r) =>
          r.id === activeId ? { ...r, status, adminNote: note, updatedAt: new Date().toISOString() } : r
        )
      );
      closePanel();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const pillCls = (s: RequestWithOrder['status']) => {
    switch (s) {
      case 'รอดำเนินการ':
        return `${styles.pill} ${styles.pillPending}`;
      case 'อนุมัติ':
        return `${styles.pill} ${styles.pillApproved}`;
      case 'ปฏิเสธ':
        return `${styles.pill} ${styles.pillRejected}`;
      default:
        return styles.pill;
    }
  };

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>คำขอคืนสินค้า (Special)</h1>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.search}
              placeholder="ค้นหา: Request ID, Order ID, Tracking, ชื่อ"
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
                  <th>Request ID</th>
                  <th>Order ID</th>
                  <th>Tracking</th>
                  <th>ผู้สั่ง</th>
                  <th>สถานะคำสั่งซื้อ</th>
                  <th>วันที่ขอคืน</th>
                  <th>สถานะคำขอ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.empty}>ไม่พบคำขอคืนสินค้า</td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.mono}>{r.id}</td>
                      <td className={styles.mono}>{r.specialOrderId}</td>
                      <td className={styles.mono}>{r.specialOrder?.trackingId ?? '-'}</td>
                      <td>{[r.specialOrder?.firstName, r.specialOrder?.lastName].filter(Boolean).join(' ') || '-'}</td>
                      <td>{r.specialOrder?.status ?? '-'}</td>
                      <td>{fmt(r.createdAt)}</td>
                      <td><span className={pillCls(r.status)}>{r.status}</span></td>
                      <td>
                        <button
                          className={styles.btnSmall}
                          onClick={() => openPanel(r)}
                          title="ตรวจสอบ / อนุมัติ / ปฏิเสธ"
                        >
                          จัดการ
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

      {/* Drawer / Panel */}
      {activeId && (
        <>
          <div className={styles.overlay} onClick={closePanel} />
          <div className={styles.drawer} role="dialog" aria-modal="true">
            {(() => {
              const r = rows.find((x) => x.id === activeId)!;
              return (
                <>
                  <div className={styles.drawerHeader}>
                    <div className={styles.drawerTitle}>คำขอคืนสินค้า</div>
                    <button className={styles.close} onClick={closePanel} aria-label="ปิด">✕</button>
                  </div>

                  <div className={styles.drawerBody}>
                    <div className={styles.kv}>
                      <div className={styles.k}>Request ID</div>
                      <div className={`${styles.v} ${styles.mono}`}>{r.id}</div>

                      <div className={styles.k}>Order ID</div>
                      <div className={`${styles.v} ${styles.mono}`}>{r.specialOrderId}</div>

                      <div className={styles.k}>Tracking</div>
                      <div className={`${styles.v} ${styles.mono}`}>{r.specialOrder?.trackingId ?? '-'}</div>

                      <div className={styles.k}>ผู้สั่ง</div>
                      <div className={styles.v}>
                        {[r.specialOrder?.firstName, r.specialOrder?.lastName].filter(Boolean).join(' ') || '-'}
                        {r.specialOrder?.email ? <div className={styles.dim}>{r.specialOrder.email}</div> : null}
                      </div>

                      <div className={styles.k}>วันที่ส่งคำขอ</div>
                      <div className={styles.v}>{fmt(r.createdAt)}</div>

                      <div className={styles.k}>เหตุผล (ลูกค้า)</div>
                      <div className={styles.v}>{r.reason || '-'}</div>

                      <div className={styles.k}>รูปที่แนบ</div>
                      <div className={styles.v}>
                        {r.images?.length ? (
                          <div className={styles.thumbGrid}>
                            {r.images.map((src, i) => (
                              <a key={i} href={src} target="_blank" rel="noreferrer">
                                <Image
                                  src={src}
                                  alt={`evidence-${i + 1}`}
                                  width={92}
                                  height={92}
                                  className={styles.thumb}
                                />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.dim}>-</span>
                        )}
                      </div>

                      <div className={styles.k}>สถานะคำขอ</div>
                      <div className={styles.v}>
                        <span className={pillCls(r.status)}>{r.status}</span>
                      </div>
                    </div>

                    <div className={styles.divider} />

                    <div className={styles.noteBlock}>
                      <div className={styles.noteLabel}>หมายเหตุจากผู้ดูแล (ถ้ามี)</div>
                      <textarea
                        className={styles.textarea}
                        placeholder="อธิบายผลการตรวจสอบ/ขั้นตอนต่อไป เพื่อแนบในอีเมลถึงลูกค้า"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.drawerActions}>
                    <button
                      className={`${styles.btn} ${styles.btnReject}`}
                      onClick={() => doUpdate('ปฏิเสธ')}
                      disabled={saving || r.status === 'ปฏิเสธ'}
                    >
                      {saving ? 'กำลังบันทึก…' : 'ปฏิเสธ'}
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnApprove}`}
                      onClick={() => doUpdate('อนุมัติ')}
                      disabled={saving || r.status === 'อนุมัติ'}
                    >
                      {saving ? 'กำลังบันทึก…' : 'อนุมัติ'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </>
  );
}
