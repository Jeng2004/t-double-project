// src/app/(website)/Order-details-id/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import styles from './Order-details-id.module.css';
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
  product?: {
    id: string;
    name: string;
    imageUrls: string[];
  } | null;
};

type OrderRow = {
  id: string;
  trackingId: string | null;
  status: AllowedStatus;
  createdAt: string;
  createdAtThai?: string | null;
  orderItems: OrderItem[];
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
  } | null;
};

type Profile = {
  name: string | null;
  email: string | null;
  phone?: string | null;
  address?: string | null;
};

const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

const statusBadgeClass = (status: AllowedStatus) => {
  switch (status) {
    case 'รอดำเนินการ':
      return `${styles.badge} ${styles.badgePending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า':
      return `${styles.badge} ${styles.badgePreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า':
      return `${styles.badge} ${styles.badgeShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว':
      return `${styles.badge} ${styles.badgeSuccess}`;
    case 'ยกเลิก':
    default:
      return `${styles.badge} ${styles.badgeCancel}`;
  }
};

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

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
          user: o.user
            ? {
                id: o.user.id,
                email: o.user.email ?? null,
                name: o.user.name ?? null,
              }
            : null,
        }));

        const mine = mapped.filter((r) => r.user?.id === userId);
        const found = mine.find((r) => r.id === id);
        if (!found) throw new Error('ไม่พบคำสั่งซื้อของคุณหรือไม่มีสิทธิ์เข้าถึง');
        if (!ignore) setOrder(found);

        const pres = await fetch(`/api/profile?userId=${userId}`, { cache: 'no-store' });
        if (pres.ok) {
          const pdata = await pres.json();
          if (!ignore)
            setProfile({
              name: pdata?.user?.name ?? null,
              email: pdata?.user?.email ?? null,
              phone: pdata?.user?.phone ?? null,
              address: pdata?.user?.address ?? null,
            });
        }
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

  const orderTotal = useMemo(() => {
    if (!order) return 0;
    return order.orderItems.reduce((sum, it) => {
      const line = it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0);
      return sum + (line || 0);
    }, 0);
  }, [order]);

  const onCancelOrder = async () => {
    if (!order) return;
    if (!confirm('ยืนยันยกเลิกคำสั่งซื้อนี้หรือไม่?')) return;
    try {
      setCanceling(true);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ยกเลิก' }),
      });
      if (!res.ok) throw new Error(`ยกเลิกไม่สำเร็จ: ${res.status}`);
      setOrder({ ...order, status: 'ยกเลิก' });
      alert('ยกเลิกคำสั่งซื้อสำเร็จ');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCanceling(false);
    }
  };

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
          <h1 className={styles.title}>รายละเอียดคำสั่งซื้อ</h1>
          <div className={styles.orderIdRow}>
            หมายเลขคำสั่งซื้อ: <span className={styles.orderId}>ORD-{order.id}</span>
          </div>

          {/* ข้อมูลคำสั่งซื้อ: Label ซ้าย / Value ขวา */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลคำสั่งซื้อ</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>วันที่สั่งซื้อ</div>
              <div className={styles.infoValue}>{createdAtDisplay}</div>

              <div className={styles.infoLabel}>วิธีการชำระเงิน</div>
              <div className={styles.infoValue}>-</div>

              <div className={styles.infoLabel}>ยอดรวมทั้งหมด</div>
              <div className={styles.infoValue}>฿{formatNumber(orderTotal)}</div>
            </div>
          </section>

          {/* หัวข้อ + Badge บรรทัดเดียว */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>สถานะคำสั่งซื้อ/รายละเอียดสินค้า</h3>
              <span className={statusBadgeClass(order.status)}>{order.status}</span>
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
                <div className={styles.itemSub}>
                  Size: {firstItem?.size} • x{firstItem?.quantity}
                </div>
              </div>

              {/* ✅ ย้ายราคาออกมาเป็นคอลัมน์ขวาสุด */}
              <div className={styles.itemPrice}>
                ฿
                {formatNumber(
                  (firstItem?.totalPrice ??
                    (typeof firstItem?.unitPrice === 'number'
                      ? (firstItem?.unitPrice || 0) * (firstItem?.quantity || 0)
                      : 0)) || 0
                )}
              </div>
            </div>
          </section>

          {/* ข้อมูลการจัดส่ง: Label ซ้าย / Value ขวา */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลการจัดส่ง</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>หมายเลขติดตามพัสดุ</div>
              <div className={styles.infoValue}>{order.trackingId ?? '-'}</div>
            </div>
          </section>

          {/* ข้อมูลผู้รับ */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลผู้รับ</h3>
            <div className={styles.recipientCard}>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ชื่อผู้รับ</div>
                  <div className={styles.recValue}>{profile?.name ?? order.user?.name ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                  <div className={styles.recValue}>{profile?.address ?? '-'}</div>
                </div>
              </div>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                  <div className={styles.recValue}>{profile?.phone ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>อีเมล</div>
                  <div className={styles.recValue}>{profile?.email ?? '-'}</div>
                </div>
              </div>
            </div>
          </section>

          {/* ปุ่ม */}
          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => setShowReturn(true)}>
              คืนสินค้า
            </button>
            <button
              className={styles.btnDanger}
              onClick={() => router.push(`/Cancel-order/${order.id}`)}
            >
              ยกเลิกคำสั่งซื้อ
            </button>
          </div>
        </div>
      </div>

      {showReturn && order && (
        <ReturnRequestModal order={order} onClose={() => setShowReturn(false)} />
      )}
    </>
  );
}

/** ---------- Modal: ส่งคำขอคืนสินค้า ---------- */
function ReturnRequestModal({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(order.orderItems.map((it) => [it.id, 0]))
  );
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleQty = (id: string, max: number, v: number) => {
    const n = Math.max(0, Math.min(max, Math.floor(v || 0)));
    setQuantities((q) => ({ ...q, [id]: n }));
  };

  const onSubmit = async () => {
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

    if (items.length === 0) return alert('กรุณาเลือกจำนวนสินค้าที่ต้องการคืน');
    if (!files || files.length < 1) return alert('กรุณาแนบรูปอย่างน้อย 1 รูป (สูงสุด 5 รูป)');

    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('orderId', order.id);
      fd.append('reason', reason);
      fd.append('items', JSON.stringify(items));
      Array.from(files)
        .slice(0, 5)
        .forEach((f) => fd.append('images', f));

      const res = await fetch('/api/orders/return', { method: 'POST', body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ส่งคำขอไม่สำเร็จ: ${res.status} ${t}`);
      }
      alert('ส่งคำขอคืนสินค้าเรียบร้อย');
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>คำขอคืนสินค้า</h3>

        <div className={styles.modalSection}>
          {order.orderItems.map((it) => (
            <div key={it.id} className={styles.modalItemRow}>
              <div className={styles.modalItemMeta}>
                <span className={styles.modalItemName}>{it.product?.name ?? '-'}</span>
                <span className={styles.modalItemSub}>
                  Size: {it.size} • ซื้อ {it.quantity} ชิ้น
                </span>
              </div>
              <input
                type="number"
                min={0}
                max={it.quantity}
                value={quantities[it.id] ?? 0}
                onChange={(e) => handleQty(it.id, it.quantity, Number(e.target.value))}
                className={styles.qtyInput}
              />
            </div>
          ))}
        </div>

        <div className={styles.modalSection}>
          <label className={styles.modalLabel}>เหตุผลในการคืน</label>
          <textarea
            className={styles.textarea}
            placeholder="ระบุเหตุผล เช่น สินค้ามีตำหนิ/ไซซ์ไม่พอดี"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className={styles.modalSection}>
          <label className={styles.modalLabel}>อัปโหลดรูป (1–5 รูป)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(e.target.files)}
          />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onSubmit} disabled={submitting}>
            {submitting ? 'กำลังส่ง…' : 'ส่งคำขอคืนสินค้า'}
          </button>
          <button className={styles.btnGhost} onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
