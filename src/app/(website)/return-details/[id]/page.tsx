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
  status: ReturnStatus | string; // api อาจส่งเป็น string
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
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'โหลดคำขอคืนสินค้าไม่สำเร็จ');

        const mapped: ReturnRequestRow = {
          id: String(data.id),
          status: (data.status as ReturnStatus) ?? 'รอดำเนินการ',
          reason: data.reason ?? '',
          images: Array.isArray(data.images) ? data.images : [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          orderId: String(data.orderId),
          items: Array.isArray(data.items)
            ? data.items.map((it: any): ReturnItem => ({
                id: String(it.id),
                quantity: Number(it.quantity ?? 0),
                orderItem: it.orderItem
                  ? {
                      id: String(it.orderItem.id ?? ''),
                      size: String(it.orderItem.size ?? 'M') as SizeKey,
                      product: it.orderItem.product
                        ? {
                            id: String(it.orderItem.product.id ?? ''),
                            name: String(it.orderItem.product.name ?? ''),
                            imageUrls: Array.isArray(it.orderItem.product.imageUrls)
                              ? it.orderItem.product.imageUrls
                              : [],
                            code: it.orderItem.product.code ?? null,
                          }
                        : null,
                    }
                  : null,
              }))
            : [],
          order: data.order
            ? {
                id: String(data.order.id),
                trackingId: data.order.trackingId ?? null,
                user: data.order.user ?? null,
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
    // หน้านี้ไม่มีราคาคืนใน schema → แสดงจำนวนรวม
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
      if (!res.ok) throw new Error(data?.error || 'อัปเดตคำขอไม่สำเร็จ');

      // API จะลบคำขอคืนสินค้าทิ้งหลังอนุมัติ/ปฏิเสธ → ย้อนกลับ
      router.back();
    } catch (e: any) {
      setErr(e.message || 'อัปเดตคำขอไม่สำเร็จ');
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
      if (!res.ok) throw new Error(data?.error || 'ลบคำขอไม่สำเร็จ');
      router.back();
    } catch (e: any) {
      setErr(e.message || 'ลบคำขอไม่สำเร็จ');
    } finally {
      setActing(null);
    }
  }

  if (loading) return <div className={styles.page}><div className={styles.container}>กำลังโหลด…</div></div>;
  if (err || !reqData) return <div className={styles.page}><div className={styles.container}><div className={styles.error}>❌ {err || 'ไม่พบคำขอคืนสินค้า'}</div></div></div>;

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

          {/* ตัวเลือกเสริม: ลบคำขอ */}
          {String(reqData.status) !== 'approved' && String(reqData.status) !== 'rejected' && (
            <button className={styles.btnGhostDanger} disabled={acting === 'delete'} onClick={doDelete}>
              {acting === 'delete' ? 'กำลังลบ…' : 'ลบคำขอ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
