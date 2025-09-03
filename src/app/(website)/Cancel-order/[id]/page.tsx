// src/app/(website)/Cancel-order/[id]/page.tsx
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
  try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); }
};

const statusBadgeClass = (styles: any, status: AllowedStatus) => {
  switch (status) {
    case 'รอดำเนินการ': return `${styles.badge} ${styles.badgePending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า': return `${styles.badge} ${styles.badgePreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า': return `${styles.badge} ${styles.badgeShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว': return `${styles.badge} ${styles.badgeSuccess}`;
    case 'ยกเลิก':
    default: return `${styles.badge} ${styles.badgeCancel}`;
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

        // ดึงออเดอร์ทั้งหมด (เหมือน Track-orders) แล้วกรองของ user ปัจจุบัน
        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`โหลดคำสั่งซื้อผิดพลาด: ${res.status}`);
        const data = (await res.json()) as any[];

        const mapped: OrderRow[] = data.map((o) => ({
          id: String(o.id ?? ''),
          trackingId: o.trackingId ?? null,
          status: (o.status as AllowedStatus) ?? 'รอดำเนินการ',
          createdAt: String(o.createdAt ?? ''),
          createdAtThai: o.createdAtThai ?? null,
          orderItems: Array.isArray(o.orderItems)
            ? o.orderItems.map((it: any) => ({
                id: String(it.id ?? ''),
                productId: String(it.productId ?? ''),
                quantity: Number(it.quantity ?? 0),
                size: String(it.size ?? 'M') as SizeKey,
                unitPrice: typeof it.unitPrice === 'number' ? it.unitPrice : null,
                totalPrice: typeof it.totalPrice === 'number' ? it.totalPrice : null,
                product: it.product
                  ? {
                      id: String(it.product.id ?? ''),
                      name: String(it.product.name ?? ''),
                      imageUrls: Array.isArray(it.product.imageUrls) ? it.product.imageUrls : [],
                    }
                  : null,
              }))
            : [],
          user: o.user ? { id: o.user.id, email: o.user.email ?? null, name: o.user.name ?? null } : null,
        }));

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
    return () => { ignore = true; };
  }, [id, userId]);

  const orderTotal = useMemo(() => {
    if (!order) return 0;
    return order.orderItems.reduce((sum, it) => {
      const line = it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0);
      return sum + (line || 0);
    }, 0);
  }, [order]);

  const submitCancel = async () => {
    if (!order) return;
    if (!confirm('ยืนยันการยกเลิกคำสั่งซื้อนี้หรือไม่?')) return;

    try {
      setSubmitting(true);
      // API ที่มีอยู่รองรับแก้ "status" เท่านั้น
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ยกเลิก' }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ยกเลิกไม่สำเร็จ: ${res.status} ${t}`);
      }
      alert('ยกเลิกคำสั่งซื้อสำเร็จ');
      // กลับไปดูรายละเอียดออเดอร์
      router.replace(`/Order-details-id/${order.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className={styles.page}><div className={styles.container}>กำลังโหลด…</div></div>
      </>
    );
  }

  if (err || !order) {
    return (
      <>
        <Navbar />
        <div className={styles.page}>
          <div className={styles.container}><div className={styles.error}>❌ {err || 'ไม่พบคำสั่งซื้อ'}</div></div>
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

          {/* เส้นแบ่งหัวข้อ */}
          <div className={styles.hr} />

          {/* ข้อมูลคำสั่งซื้อ: label ซ้าย / value ขวา */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลคำสั่งซื้อ</h3>

            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>หมายเลขคำสั่งซื้อ</div>
              <div className={styles.infoValue}>#ORD-{order.id}</div>

              <div className={styles.infoLabel}>วันที่สั่งซื้อ</div>
              <div className={styles.infoValue}>{createdAtDisplay}</div>
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
              <div className={styles.itemPrice}>฿{formatNumber(
                (firstItem?.totalPrice ??
                  (typeof firstItem?.unitPrice === 'number'
                    ? (firstItem?.unitPrice || 0) * (firstItem?.quantity || 0)
                    : 0)) || 0
              )}</div>
            </div>

            {/* สถานะปัจจุบัน */}
            <div className={styles.stateRow}>
              <div className={styles.stateLabel}>สถานะคำสั่งซื้อปัจจุบัน</div>
              <div className={statusBadgeClass(styles, order.status)}>{order.status}</div>
            </div>
          </section>

          {/* ฟอร์มเหตุผลยกเลิก */}
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
                  {reasons.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
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
