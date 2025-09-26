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
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'กำลังจัดส่งคืนสินค้า'; // เผื่อสถานะจากฝั่งแอดมิน

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

/** ---------- API types (no any) ---------- */
type OrderItemApi = {
  id?: string | number;
  productId?: string | number;
  quantity?: number;
  size?: string;
  unitPrice?: number;
  totalPrice?: number;
  product?: {
    id?: string | number;
    name?: string;
    imageUrls?: string[];
  } | null;
};

type OrderApi = {
  id?: string | number;
  trackingId?: string | null;
  status?: string;
  createdAt?: string;
  createdAtThai?: string | null;
  orderItems?: OrderItemApi[];
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
  } | null;
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
    case 'กำลังจัดส่งคืนสินค้า':
      return `${styles.badge} ${styles.badgeShipping}`;
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

  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        // 🔎 ดึงออเดอร์เฉพาะรายการนี้
        const oRes = await fetch(`/api/orders?id=${id}`, { cache: 'no-store' });
        if (!oRes.ok) throw new Error(`โหลดคำสั่งซื้อผิดพลาด: ${oRes.status}`);
        const oData: OrderApi = await oRes.json();

        // ตรวจสิทธิ์เจ้าของ
        const ownerId = oData?.user?.id ?? null;
        if (!ownerId || ownerId !== userId) {
          throw new Error('ไม่พบคำสั่งซื้อของคุณหรือไม่มีสิทธิ์เข้าถึง');
        }

        // map → OrderRow (type-safe)
        const items: OrderItem[] = Array.isArray(oData.orderItems)
          ? oData.orderItems.map((it): OrderItem => ({
              id: String(it.id ?? ''),
              productId: String(it.productId ?? ''),
              quantity: Number(it.quantity ?? 0),
              size: (String(it.size ?? 'M') as SizeKey) ?? 'M',
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
          : [];

        const mapped: OrderRow = {
          id: String(oData.id ?? ''),
          trackingId: oData.trackingId ?? null,
          status: (oData.status as AllowedStatus) ?? 'รอดำเนินการ',
          createdAt: String(oData.createdAt ?? ''),
          createdAtThai: oData.createdAtThai ?? null,
          orderItems: items,
          user: oData.user ?? null,
        };

        if (!ignore) setOrder(mapped);

        // โปรไฟล์ผู้ใช้
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

  // ปุ่มเงื่อนไขตามสถานะปัจจุบัน (ตามพฤติกรรม API เดิมของคุณ)
  const canReturn = order.status === 'จัดส่งสินค้าสำเร็จเเล้ว';
  const canCancel = order.status === 'รอดำเนินการ';

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>รายละเอียดคำสั่งซื้อ</h1>
          <div className={styles.orderIdRow}>
            หมายเลขคำสั่งซื้อ: <span className={styles.orderId}>ORD-{order.id}</span>
          </div>

          {/* ข้อมูลคำสั่งซื้อ */}
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

          {/* สถานะ + สินค้าทั้งหมด */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>สถานะคำสั่งซื้อ/รายละเอียดสินค้า</h3>
              <span className={statusBadgeClass(order.status)}>{order.status}</span>
            </div>

            {order.orderItems.map((it) => (
              <div key={it.id} className={styles.itemRow}>
                <div className={styles.thumbBox}>
                  <Image
                    src={firstImage(it.product?.imageUrls)}
                    alt={it.product?.name || 'product'}
                    width={120}
                    height={120}
                    className={styles.thumb}
                  />
                </div>

                <div className={styles.itemMeta}>
                  <div className={styles.itemName}>{it.product?.name ?? '-'}</div>
                  <div className={styles.itemSub}>Size: {it.size} • x{it.quantity}</div>
                </div>

                <div className={styles.itemPrice}>
                  ฿
                  {formatNumber(
                    (it.totalPrice ??
                      (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0)) || 0
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* การจัดส่ง */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลการจัดส่ง</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>หมายเลขติดตามพัสดุ</div>
              <div className={styles.infoValue}>{order.trackingId ?? '-'}</div>
            </div>
          </section>

          {/* ผู้รับ */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลผู้รับ</h3>
            <div className={styles.recipientCard}>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ชื่อผู้รับ</div>
                  <div className={styles.recValue}>{profile?.name ?? order.user?.name ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                  <div className={styles.recValue}>{profile?.phone ?? '-'}</div>
                </div>
              </div>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>อีเมล</div>
                  <div className={styles.recValue}>{profile?.email ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                  <div className={styles.recValue}>{profile?.address ?? '-'}</div>
                </div>
              </div>
            </div>
          </section>

          {/* ปุ่ม */}
          <div className={styles.actions}>
            {order.status === 'จัดส่งสินค้าสำเร็จเเล้ว' && (
              <button
                className={styles.btnSecondary}
                onClick={() => router.push(`/return-the-product/${order.id}`)}
              >
                คืนสินค้า
              </button>
            )}
            {order.status === 'รอดำเนินการ' && (
              <button
                className={styles.btnDanger}
                onClick={() => router.push(`/Cancel-order/${order.id}`)}
              >
                ยกเลิกคำสั่งซื้อ
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
