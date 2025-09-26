'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import styles from './Cancel-order.module.css';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type SizeKey = 'S' | 'M' | 'L' | 'XL';
type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว';

type OrderItem = {
  id: string;
  productId: string;
  quantity: number;
  size: SizeKey;
  unitPrice: number | null;
  totalPrice: number | null;
  product?: { id: string; name: string; imageUrls: string[] } | null;
};

type OrderRow = {
  id: string;
  trackingId: string | null;
  status: AllowedStatus;
  createdAt: string;
  createdAtThai?: string | null;
  orderItems: OrderItem[];
  user?: { id?: string; email?: string | null; name?: string | null } | null;
};

const firstImage = (arr?: string[]) =>
  arr && arr.length > 0 ? arr[0] : '/placeholder.png';

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

export default function CancelOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // เหตุผลตัวอย่างตาม UI
  const reasons = [
    'สั่งซื้อผิดรุ่น/ผิดสี',
    'เปลี่ยนใจ',
    'ใส่ที่อยู่/เบอร์ผิด',
    'ต้องการแก้ไขคำสั่งซื้อ',
    'อื่น ๆ',
  ];

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`โหลดคำสั่งซื้อผิดพลาด: ${res.status}`);
        const raw: unknown = await res.json();
        if (!Array.isArray(raw)) throw new Error('ข้อมูลคำสั่งซื้อไม่ถูกต้อง');

        // map แบบ type-safe โดยไม่ใช้ any
        const mapped: OrderRow[] = raw.map((o): OrderRow => {
          const obj = o as Record<string, unknown>;
          const orderItemsRaw = Array.isArray(obj.orderItems) ? (obj.orderItems as unknown[]) : [];

          const orderItems: OrderItem[] = orderItemsRaw.map((itRaw): OrderItem => {
            const it = itRaw as Record<string, unknown>;
            const pRaw = (it.product as Record<string, unknown> | undefined) ?? undefined;

            const imageUrls =
              pRaw && Array.isArray(pRaw.imageUrls)
                ? (pRaw.imageUrls.filter((x) => typeof x === 'string') as string[])
                : [];

            return {
              id: String(it.id ?? ''),
              productId: String(it.productId ?? ''),
              quantity: Number(it.quantity ?? 0),
              size: String(it.size ?? 'M') as SizeKey,
              unitPrice: typeof it.unitPrice === 'number' ? it.unitPrice : null,
              totalPrice: typeof it.totalPrice === 'number' ? it.totalPrice : null,
              product: pRaw
                ? { id: String(pRaw.id ?? ''), name: String(pRaw.name ?? ''), imageUrls }
                : null,
            };
          });

          const uRaw = (obj.user as Record<string, unknown> | undefined) ?? undefined;

          const status = (() => {
            const s = String(obj.status ?? '');
            const allowed: AllowedStatus[] = [
              'ยกเลิก',
              'รอดำเนินการ',
              'กำลังดำเนินการจัดเตรียมสินค้า',
              'กำลังดำเนินการจัดส่งสินค้า',
              'จัดส่งสินค้าสำเร็จเเล้ว',
            ];
            return (allowed as string[]).includes(s) ? (s as AllowedStatus) : 'รอดำเนินการ';
          })();

          return {
            id: String(obj.id ?? ''),
            trackingId: obj.trackingId == null ? null : String(obj.trackingId),
            status,
            createdAt: String(obj.createdAt ?? ''),
            createdAtThai: obj.createdAtThai == null ? null : String(obj.createdAtThai),
            orderItems,
            user: uRaw
              ? {
                  id: typeof uRaw.id === 'string' ? uRaw.id : String(uRaw.id ?? ''),
                  email: uRaw.email == null ? null : String(uRaw.email),
                  name: uRaw.name == null ? null : String(uRaw.name),
                }
              : null,
          };
        });

        const mine = mapped.filter((r) => r.user?.id === userId);
        const found = mine.find((r) => r.id === id);
        if (!found) throw new Error('ไม่พบคำสั่งซื้อของคุณหรือไม่มีสิทธิ์เข้าถึง');

        if (!ignore) setOrder(found);
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id, userId]);

  // ✅ Hooks ทั้งหมดต้องอยู่ก่อน early return เสมอ
  const orderTotal = useMemo(() => {
    if (!order) return 0;
    return order.orderItems.reduce((sum, it) => {
      const line = it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0);
      return sum + (line || 0);
    }, 0);
  }, [order]);

  // ✅ คำนวณคลาส badge ที่นี่ (ก่อน early return) และเผื่อกรณียังไม่มี order
  const badgeClass = useMemo(() => {
    const status: AllowedStatus = order?.status ?? 'รอดำเนินการ';
    const map: Record<AllowedStatus, string> = {
      'รอดำเนินการ': `${styles.badge} ${styles.badgePending}`,
      'กำลังดำเนินการจัดเตรียมสินค้า': `${styles.badge} ${styles.badgePreparing}`,
      'กำลังดำเนินการจัดส่งสินค้า': `${styles.badge} ${styles.badgeShipping}`,
      'จัดส่งสินค้าสำเร็จเเล้ว': `${styles.badge} ${styles.badgeSuccess}`,
      'ยกเลิก': `${styles.badge} ${styles.badgeCancel}`,
    };
    return map[status];
  }, [order?.status]);

  const submitCancel = async () => {
    if (!order) return;
    if (!reason) return alert('กรุณาเลือกเหตุผลในการยกเลิก');
    if (!confirm('ยืนยันการยกเลิกคำสั่งซื้อนี้หรือไม่?')) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/cancel-orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, cancelReason: reason }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ยกเลิกไม่สำเร็จ: ${res.status} ${t}`);
      }
      alert('ยกเลิกคำสั่งซื้อสำเร็จ');
      router.replace(`/Order-details-id/${order.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // ====== Early returns ด้านล่างนี้ ปลอดภัยแล้ว เพราะ hooks อยู่ข้างบนครบ ======

  if (loading) {
    return (
      <>
        <Navbar />
        <div className={styles.page}>
          <div className={styles.container}>กำลังโหลด…</div>
        </div>
      </>
    );
  }

  if (err || !order) {
    return (
      <>
        <Navbar />
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.error}>❌ {err || 'ไม่พบคำสั่งซื้อ'}</div>
          </div>
        </div>
      </>
    );
  }

  const createdAtDisplay = order.createdAtThai ?? order.createdAt;
  const firstItem = order.orderItems[0];

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>ยกเลิกคำสั่งซื้อ</h1>

          <div className={styles.hr} />

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลคำสั่งซื้อ</h3>

            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>หมายเลขคำสั่งซื้อ</div>
              <div className={styles.infoValue}>#ORD-{order.id}</div>

              <div className={styles.infoLabel}>วันที่สั่งซื้อ</div>
              <div className={styles.infoValue}>{createdAtDisplay}</div>

              <div className={styles.infoLabel}>ยอดรวม</div>
              <div className={styles.infoValue}>฿{formatNumber(orderTotal)}</div>
            </div>

            <div className={styles.itemRow}>
              <div className={styles.thumbBox}>
                <Image
                  src={firstImage(firstItem?.product?.imageUrls)}
                  alt={firstItem?.product?.name || 'product'}
                  width={120}
                  height={120}
                  className={styles.thumb}
                />
              </div>
              <div className={styles.itemMeta}>
                <div className={styles.itemName}>{firstItem?.product?.name ?? '-'}</div>
                <div className={styles.itemSub}>Size: {firstItem?.size} • x{firstItem?.quantity}</div>
              </div>
              <div className={styles.itemPrice}>
                ฿{formatNumber(
                  (firstItem?.totalPrice ??
                    (typeof firstItem?.unitPrice === 'number'
                      ? (firstItem?.unitPrice || 0) * (firstItem?.quantity || 0)
                      : 0)) || 0
                )}
              </div>
            </div>

            <div className={styles.stateRow}>
              <div className={styles.stateLabel}>สถานะคำสั่งซื้อปัจจุบัน</div>
              <div className={badgeClass}>{order.status}</div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>เหตุผลในการยกเลิก</label>
              <div className={styles.selectWrap}>
                <select
                  className={styles.select}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="" disabled>โปรดเลือกเหตุผล</option>
                  {['สั่งซื้อผิดรุ่น/ผิดสี','เปลี่ยนใจ','ใส่ที่อยู่/เบอร์ผิด','ต้องการแก้ไขคำสั่งซื้อ','อื่น ๆ']
                    .map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className={styles.caret}>▾</span>
              </div>
            </div>
          </section>

          <button className={styles.submitBtn} onClick={submitCancel} disabled={submitting || !reason}>
            {submitting ? 'กำลังดำเนินการ…' : 'ยืนยันการยกเลิกคำสั่งซื้อ'}
          </button>

          <p className={styles.note}>
            การยกเลิกคำสั่งซื้อเป็นไปตามเงื่อนไข หากอนุมัติการยกเลิก ระบบจะดำเนินการคืนเงินภายใน 3–7 วันทำการ (ตามเงื่อนไขการชำระ)
          </p>
        </div>
      </div>
    </>
  );
}
