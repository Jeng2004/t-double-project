'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './return-details.module.css';

type SizeKey = 'S' | 'M' | 'L' | 'XL';
type ReturnStatus = 'รอดำเนินการ' | 'approved' | 'rejected';

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

/* ---------- Helpers for formatting ---------- */
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
    case 'approved':     return `${styles.badge} ${styles.badgeSuccess}`;
    case 'rejected':     return `${styles.badge} ${styles.badgeCancel}`;
    default:             return `${styles.badge} ${styles.badgePending}`;
  }
};

/* ---------- Raw API types + safe casters ---------- */
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
  status?: unknown;
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

const toStr = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? (v.filter((x): x is string => typeof x === 'string')) : [];

export default function ReturnProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reqData, setReqData] = useState<ReturnRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<'approve' | 'reject' | 'delete' | null>(null);

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

        const itemsRaw: ApiReturnItemRaw[] = Array.isArray(data.items) ? (data.items as ApiReturnItemRaw[]) : [];

        const mapped: ReturnRequestRow = {
          id: toStr(data.id),
          status: (toStr(data.status) as ReturnStatus) || 'รอดำเนินการ',
          reason: typeof data.reason === 'string' ? data.reason : '',
          images: toStrArr(data.images),
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
          orderId: toStr(data.orderId),
          items: itemsRaw.map((it): ReturnItem => ({
            id: toStr(it.id),
            quantity: toNum(it.quantity),
            orderItem: it.orderItem
              ? {
                  id: toStr(it.orderItem.id ?? ''),
                  size: toStr(it.orderItem.size ?? 'M') as SizeKey,
                  product: it.orderItem.product
                    ? {
                        id: toStr(it.orderItem.product.id ?? ''),
                        name: toStr(it.orderItem.product.name ?? ''),
                        imageUrls: toStrArr(it.orderItem.product.imageUrls),
                        code: typeof it.orderItem.product.code === 'string' ? it.orderItem.product.code : null,
                      }
                    : null,
                }
              : null,
          })),
          order: data.order
            ? {
                id: toStr(data.order.id),
                trackingId: typeof data.order.trackingId === 'string' ? data.order.trackingId : null,
                user: data.order.user
                  ? {
                      name: typeof data.order.user.name === 'string' ? data.order.user.name : null,
                      email: typeof data.order.user.email === 'string' ? data.order.user.email : null,
                      phone: typeof data.order.user.phone === 'string' ? data.order.user.phone : null,
                      address: typeof data.order.user.address === 'string' ? data.order.user.address : null,
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

  async function doPatch(status: 'approved' | 'rejected') {
    if (!reqData) return;
    try {
      setActing(status === 'approved' ? 'approve' : 'reject');
      const res = await fetch(`/api/orders/return/${reqData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error || 'อัปเดตคำขอไม่สำเร็จ');

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
        {/* หัวเรื่อง */}
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

        {/* เหตุผลการคืนสินค้า */}
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

        {/* ปุ่มสำหรับแอดมิน */}
        <div className={styles.actions}>
          {String(reqData.status) === 'รอดำเนินการ' && (
            <>
              <button
                className={styles.btnPrimary}
                disabled={acting === 'approve'}
                onClick={() => doPatch('approved')}
              >
                {acting === 'approve' ? 'กำลังอนุมัติ…' : 'Approve Return'}
              </button>

              <button
                className={styles.btnDanger}
                disabled={acting === 'reject'}
                onClick={() => doPatch('rejected')}
              >
                {acting === 'reject' ? 'กำลังปฏิเสธ…' : 'Reject'}
              </button>
            </>
          )}

          <button className={styles.btnGhost} onClick={() => router.back()}>
            ย้อนกลับ
          </button>

          {String(reqData.status) !== 'approved' && String(reqData.status) !== 'rejected' && (
            <button
              className={styles.btnGhostDanger}
              disabled={acting === 'delete'}
              onClick={doDelete}
            >
              {acting === 'delete' ? 'กำลังลบ…' : 'ลบคำขอ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
