// src/app/(website)/return-details/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './return-details.module.css';

type SizeKey = 'S' | 'M' | 'L' | 'XL';
type ReturnStatus = 'รอดำเนินการ' | 'อนุมัติ' | 'ปฏิเสธ';

type ReturnItem = {
  id: string;
  quantity: number;
  orderItem?: {
    id?: string;
    size?: SizeKey;
    product?: {
      id?: string;
      name?: string;
      imageUrls?: string[];
      code?: string | null;
    } | null;
  } | null;
};

type ReturnRequestRow = {
  id: string;
  status: ReturnStatus | string;
  reason?: string | null;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
  orderId: string;
  items: ReturnItem[];
  order?: {
    id: string;
    trackingId?: string | null;
    user?: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } | null;
  } | null;
};

/* ---------- Helpers ---------- */
const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');
const nf = (n: number) => { try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); } };
const fmtTH = (d?: string) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
  } catch {
    return d;
  }
};
const badgeClass = (s: string) => {
  switch (s) {
    case 'รอดำเนินการ': return `${styles.badge} ${styles.badgePending}`;
    case 'อนุมัติ':      return `${styles.badge} ${styles.badgeSuccess}`;
    case 'ปฏิเสธ':       return `${styles.badge} ${styles.badgeCancel}`;
    default:             return `${styles.badge} ${styles.badgePending}`;
  }
};
const toStr = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const toOptStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? (v.filter((x): x is string => typeof x === 'string')) : [];
const toSizeKey = (v: unknown): SizeKey | undefined => {
  const s = typeof v === 'string' ? v : '';
  return (['S','M','L','XL'] as SizeKey[]).includes(s as SizeKey) ? (s as SizeKey) : undefined;
};

/* ---------- Raw API types ---------- */
type ApiReturnItemRaw = {
  id?: unknown;
  quantity?: unknown;
  orderItem?: {
    id?: unknown;
    size?: unknown;
    product?: {
      id?: unknown;
      name?: unknown;
      imageUrls?: unknown;
      code?: unknown;
    } | null;
  } | null;
};

type ApiReturnRequestRaw = {
  id?: unknown;
  status?: unknown; // 'pending' | 'approved' | 'rejected' | หรือไทย
  reason?: unknown;
  images?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  orderId?: unknown;
  items?: unknown;
  order?: {
    id?: unknown;
    trackingId?: unknown;
    user?: {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      address?: unknown;
    } | null;
  } | null;
};

export default function ReturnProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reqData, setReqData] = useState<ReturnRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<'อนุมัติ' | 'ปฏิเสธ' | 'delete' | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/orders/return/${id}`, { cache: 'no-store' });
        const dataUnknown: unknown = await res.json();
        if (!res.ok) {
          const msg = (dataUnknown as { error?: string } | null)?.error ?? 'โหลดคำขอคืนสินค้าไม่สำเร็จ';
          throw new Error(msg);
        }
        const data = dataUnknown as ApiReturnRequestRaw;

        // map status → ไทย
        const statusTh: ReturnStatus = (() => {
          const s = String(data.status ?? '').toLowerCase();
          if (s === 'approved' || s === 'อนุมัติ') return 'อนุมัติ';
          if (s === 'rejected' || s === 'ปฏิเสธ') return 'ปฏิเสธ';
          return 'รอดำเนินการ';
        })();

        // map items
        const items: ReturnItem[] = Array.isArray(data.items)
          ? (data.items as ApiReturnItemRaw[]).map((it): ReturnItem => {
              const oi = it?.orderItem ?? null;
              const prod = oi?.product ?? null;
              return {
                id: toStr(it?.id),
                quantity: toNum(it?.quantity),
                orderItem: oi
                  ? {
                      id: toOptStr(oi.id) ?? undefined,
                      size: toSizeKey(oi.size),
                      product: prod
                        ? {
                            id: toOptStr(prod.id) ?? undefined,
                            name: toOptStr(prod.name) ?? undefined,
                            imageUrls: toStrArr(prod.imageUrls),
                            code: typeof prod.code === 'string' ? prod.code : null,
                          }
                        : null,
                    }
                  : null,
              };
            })
          : [];

        const mapped: ReturnRequestRow = {
          id: toStr(data.id),
          status: statusTh,
          reason: toOptStr(data.reason),
          images: toStrArr(data.images),
          createdAt: toOptStr(data.createdAt) ?? undefined,
          updatedAt: toOptStr(data.updatedAt) ?? undefined,
          orderId: toStr(data.orderId),
          items,
          order: data.order
            ? {
                id: toStr(data.order.id),
                trackingId: data.order.trackingId == null ? null : toStr(data.order.trackingId),
                user: data.order.user
                  ? {
                      name: toOptStr(data.order.user.name),
                      email: toOptStr(data.order.user.email),
                      phone: toOptStr(data.order.user.phone),
                      address: toOptStr(data.order.user.address),
                    }
                  : null,
              }
            : null,
        };

        if (!ignore) setReqData(mapped);
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    if (id) load();
    return () => { ignore = true; };
  }, [id]);

  const itemsTotal = useMemo(() => {
    if (!reqData) return 0;
    return reqData.items.reduce((s, it) => s + (it.quantity || 0), 0);
  }, [reqData]);

  async function doPatch(status: 'อนุมัติ' | 'ปฏิเสธ') {
    if (!reqData) return;
    try {
      setActing(status);
      const apiStatus = status === 'อนุมัติ' ? 'approved' : 'rejected';
      const res = await fetch(`/api/orders/return/${reqData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: apiStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'อัปเดตคำขอไม่สำเร็จ');
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'อัปเดตคำขอไม่สำเร็จ');
    } finally {
      setActing(null);
    }
  }

  async function doDelete() {
    if (!reqData) return;
    if (!confirm('ต้องการลบคำขอคืนสินค้านี้หรือไม่?')) return;
    try {
      setActing('delete');
      const res = await fetch(`/api/orders/return/${reqData.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error || 'ลบคำขอไม่สำเร็จ');
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ลบคำขอไม่สำเร็จ');
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>กำลังโหลด…</div>
      </div>
    );
  }

  if (err || !reqData) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.error}>❌ {err || 'ไม่พบคำขอคืนสินค้า'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>รายละเอียดคำขอคืนสินค้า</h1>

        <div className={styles.infoGrid}>
          <div className={styles.infoLabel}>เลขที่คำสั่งซื้อ:</div>
          <div className={styles.infoValue}>ORD-{reqData.order?.id ?? reqData.orderId}</div>

          <div className={styles.infoLabel}>สถานะคำขอ:</div>
          <div className={styles.infoValue}>
            <span className={badgeClass(String(reqData.status))}>{String(reqData.status)}</span>
          </div>

          <div className={styles.infoLabel}>วันที่ส่งคำขอ:</div>
          <div className={styles.infoValue}>{fmtTH(reqData.createdAt)}</div>
        </div>

        {/* ข้อมูลลูกค้า */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>ข้อมูลลูกค้า</h3>
          <div className={styles.recipientCard}>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ชื่อผู้รับ</div>
                <div className={styles.recValue}>{reqData.order?.user?.name ?? '-'}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                <div className={styles.recValue}>{reqData.order?.user?.phone ?? '-'}</div>
              </div>
            </div>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>อีเมล</div>
                <div className={styles.recValue}>{reqData.order?.user?.email ?? '-'}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                <div className={styles.recValue}>{reqData.order?.user?.address ?? '-'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* สินค้าที่ขอคืน */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>สินค้าในคำขอคืน</h3>
          {reqData.items.map((it) => (
            <div key={it.id} className={styles.itemRow}>
              <div className={styles.thumbBox}>
                <Image
                  src={firstImage(it.orderItem?.product?.imageUrls)}
                  alt={it.orderItem?.product?.name || 'product'}
                  width={120}
                  height={120}
                  className={styles.thumb}
                />
              </div>
              <div className={styles.itemMeta}>
                <div className={styles.itemName}>{it.orderItem?.product?.name ?? '-'}</div>
                <div className={styles.itemSub}>
                  Size: {it.orderItem?.size ?? '-'} • คืน {it.quantity} ชิ้น
                  {it.orderItem?.product?.code ? ` • SKU: ${it.orderItem.product.code}` : ''}
                </div>
              </div>
            </div>
          ))}

          <div className={styles.summaryRow}>
            รวมจำนวนที่ขอคืนทั้งหมด: <b>{nf(itemsTotal)}</b> ชิ้น
          </div>
        </section>

        {/* เหตุผล */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>เหตุผลการคืนสินค้า</h3>
          <div className={styles.reasonBox}>{reqData.reason || '-'}</div>
        </section>

        {/* รูปหลักฐาน */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>หลักฐานที่แนบมา</h3>
          {reqData.images && reqData.images.length > 0 ? (
            <div className={styles.proofGrid}>
              {reqData.images.map((src, idx) => (
                <div key={`${src}-${idx}`} className={styles.proofItem}>
                  <Image
                    src={src}
                    alt={`evidence-${idx + 1}`}
                    width={240}
                    height={160}
                    className={styles.proofImg}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>ไม่มีรูปประกอบ</div>
          )}
        </section>

        {/* ปุ่ม */}
        <div className={styles.actions}>
          {String(reqData.status) === 'รอดำเนินการ' && (
            <>
              <button
                className={styles.btnPrimary}
                disabled={acting === 'อนุมัติ'}
                onClick={() => doPatch('อนุมัติ')}
              >
                {acting === 'อนุมัติ' ? 'กำลังอนุมัติ…' : 'อนุมัติ'}
              </button>

              <button
                className={styles.btnDanger}
                disabled={acting === 'ปฏิเสธ'}
                onClick={() => doPatch('ปฏิเสธ')}
              >
                {acting === 'ปฏิเสธ' ? 'กำลังปฏิเสธ…' : 'ปฏิเสธ'}
              </button>
            </>
          )}

          <button className={styles.btnGhost} onClick={() => router.back()}>
            ย้อนกลับ
          </button>

          {String(reqData.status) !== 'อนุมัติ' && String(reqData.status) !== 'ปฏิเสธ' && (
            <button className={styles.btnGhostDanger} disabled={acting === 'delete'} onClick={doDelete}>
              {acting === 'delete' ? 'กำลังลบ…' : 'ลบคำขอ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
