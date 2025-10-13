'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import NavbarAdmin from '../components/NavbarAdmin';
import styles from './Special-return-admin.module.css';

type ReturnRequestRaw = {
  id: string;
  specialOrderId: string;
  reason: string | null;
  images: string[];
  status: string;                // อาจเป็น 'pending' หรือ ไทย
  adminNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ReturnRequest = {
  id: string;
  specialOrderId: string;
  reason: string | null;
  images: string[];
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
    status?: string | null; // raw -> จะแปลงตอนแสดงผล
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

/** แปลงสถานะคำขอคืนสินค้า (request) ให้เป็นไทย */
function toThaiReturnStatus(s?: string | null): 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ' {
  const raw = String(s ?? '').trim();
  if (!raw || /^(null|undefined|empty)$/i.test(raw)) return 'รอดำเนินการ';

  // ถ้าเป็นไทยอยู่แล้ว
  if (raw === 'รอดำเนินการ' || raw === 'อนุมัติ' || raw === 'ปฏิเสธ') {
    return raw as 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ';
  }


  const v = raw.replace(/[_-]+/g, ' ').toLowerCase().trim();
  if (/^(pending|in review|in\s*review|await|awaiting|waiting)/.test(v)) return 'รอดำเนินการ';
  if (/^(approve|approved|accept|accepted)/.test(v)) return 'อนุมัติ';
  if (/^(reject|rejected|deny|denied|decline|declined)/.test(v)) return 'ปฏิเสธ';

  // ดีฟอลต์ให้เป็นรอดำเนินการ
  return 'รอดำเนินการ';
}

/** แปลงสถานะออเดอร์ (special order) ให้เป็นไทย */
function toThaiOrderStatus(s?: string | null): string {
  const raw = String(s ?? '').trim();
  if (!raw) return '-';

  if (
    /ยกเลิก\s*-?\s*คืนเงินเรียบร้อย|ยกเลิก|รอชำระเงิน|รอดำเนินการ|กำลังดำเนินการจัดเตรียมสินค้า|กำลังดำเนินการจัดส่งสินค้า|จัดส่งสินค้าสำเร็จเเล้ว|ลูกค้าคืนสินค้า|กำลังจัดส่งคืนสินค้า/
      .test(raw)
  ) {
    return raw;
  }

  const v = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();

  // ระวังคิวเรียงลำดับ: จับ "pending payment" ก่อน "pending" ทั่วไป
  if (/(pending\s*payment|waiting\s*for\s*payment|unpaid|pay\s*pending)/.test(v)) return 'รอชำระเงิน';
  if (/(pending|await|wait)/.test(v)) return 'รอดำเนินการ';
  if (/(prepar|pack|ready|process(ing)?)/.test(v)) return 'กำลังดำเนินการจัดเตรียมสินค้า';
  if (/(ship|in\s*transit|courier|delivery\s*in\s*progress)/.test(v)) return 'กำลังดำเนินการจัดส่งสินค้า';
  if (/(deliver(ed)?|complete(d)?|success(ed)?)/.test(v)) return 'จัดส่งสินค้าสำเร็จเเล้ว';
  if (/(customer).*(return|refund)|returned\s*by\s*customer/.test(v)) return 'ลูกค้าคืนสินค้า';
  if (/(return).*(ship|ing|in\s*transit)/.test(v)) return 'กำลังจัดส่งคืนสินค้า';
  if (/(cancel(l)?(ed)?|void|abort)/.test(v)) return 'ยกเลิก';

  return raw;
}

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
        // ดึงรายการคำขอทั้งหมด (อาจ status= pending/approved/rejected)
        const res = await fetch('/api/returnspecialrequest', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const listRaw = (await res.json()) as ReturnRequestRaw[];

        // แปลงสถานะ request เป็นไทยทันที
        const list: ReturnRequest[] = listRaw.map((r) => ({
          ...r,
          status: toThaiReturnStatus(r.status),
        }));

        // enrich: ดึงข้อมูล special order เพิ่ม (tracking/ชื่อ/สถานะ)
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
                status: data?.status ?? null, // จะแปลงตอนแสดงผล
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
      const orderId = r.specialOrderId.toLowerCase();
      const so = r.specialOrder;
      const tracking = (so?.trackingId ?? '').toLowerCase();
      const name = [so?.firstName ?? '', so?.lastName ?? ''].join(' ').trim().toLowerCase();
      const orderStatusTH = toThaiOrderStatus(so?.status).toLowerCase();
      const requestStatusTH = toThaiReturnStatus(r.status).toLowerCase(); // ✅ ใช้สถานะไทยเสมอ

      return (
        id.includes(term) ||
        orderId.includes(term) ||
        tracking.includes(term) ||
        name.includes(term) ||
        orderStatusTH.includes(term) ||
        requestStatusTH.includes(term)
      );
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

      setRows((prev) =>
        prev.map((r) =>
          r.id === activeId
            ? {
                ...r,
                status: toThaiReturnStatus(status), // ✅ ให้แน่ใจว่าเป็นไทย
                adminNote: note,
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );
      closePanel();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const pillCls = (s: ReturnRequest['status']) => {
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
              placeholder="ค้นหา: Request ID, Order ID, Tracking, ชื่อ, สถานะ"
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
                  filtered.map((r) => {
                    const statusTH = toThaiReturnStatus(r.status); // ✅ ใช้ไทยแน่นอน
                    return (
                      <tr key={r.id}>
                        <td className={styles.mono}>{r.id}</td>
                        <td className={styles.mono}>{r.specialOrderId}</td>
                        <td className={styles.mono}>{r.specialOrder?.trackingId ?? '-'}</td>
                        <td>{[r.specialOrder?.firstName, r.specialOrder?.lastName].filter(Boolean).join(' ') || '-'}</td>
                        {/* ✅ ใช้สถานะไทยที่แม็พแล้ว */}
                        <td>{toThaiOrderStatus(r.specialOrder?.status)}</td>
                        <td>{fmt(r.createdAt)}</td>
                        {/* ✅ แสดงสถานะคำขอเป็นไทยเสมอ */}
                        <td>
                          <span className={pillCls(statusTH as ReturnRequest['status'])}>{statusTH}</span>
                        </td>
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
                    );
                  })
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
              const statusTH = toThaiReturnStatus(r.status); // ✅ ไทยใน drawer
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

                      <div className={styles.k}>สถานะคำสั่งซื้อ (ล่าสุด)</div>
                      <div className={styles.v}>{toThaiOrderStatus(r.specialOrder?.status)}</div>

                      <div className={styles.k}>สถานะคำขอ</div>
                      <div className={styles.v}>
                        <span className={pillCls(statusTH as ReturnRequest['status'])}>{statusTH}</span>
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
                      disabled={saving || statusTH === 'ปฏิเสธ'}
                    >
                      {saving ? 'กำลังบันทึก…' : 'ปฏิเสธ'}
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnApprove}`}
                      onClick={() => doUpdate('อนุมัติ')}
                      disabled={saving || statusTH === 'อนุมัติ'}
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
