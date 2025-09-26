// src/app/(website)/components/Track-orders.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Track-orders.module.css';
import Image from 'next/image';
import { getUserIdForFrontend } from '@/lib/get-user-id';
import Link from 'next/link';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

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

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'กำลังจัดส่งคืนสินค้า';

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

/** ✅ API types (ไม่ใช้ any) */
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
  };
};

type OrderApi = {
  id?: string | number;
  trackingId?: string;
  status?: string;
  createdAt?: string;
  createdAtThai?: string;
  orderItems?: OrderItemApi[];
  user?: { id?: string; email?: string | null; name?: string | null };
};

type Props = {
  orderId?: string;
};

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

const firstImage = (arr?: string[]) =>
  arr && arr.length > 0 ? arr[0] : '/placeholder.png';

const statusClass = (status: AllowedStatus): string => {
  switch (status) {
    case 'รอดำเนินการ':
      return `${styles.status} ${styles.statusPending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า':
      return `${styles.status} ${styles.statusPreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า':
      return `${styles.status} ${styles.statusShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว':
      return `${styles.status} ${styles.statusSuccess}`;
    case 'กำลังจัดส่งคืนสินค้า':
      return `${styles.status} ${styles.statusReturn}`;
    case 'ยกเลิก':
    default:
      return `${styles.status} ${styles.statusCancel}`;
  }
};

export default function TrackOrders({ orderId }: Props) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserIdForFrontend();
    if (!userId) {
      setErr('ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบ');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/orders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: OrderApi[] = await res.json();

        const mapped: OrderRow[] = data.map((o) => {
          const orderItems: OrderItem[] = Array.isArray(o.orderItems)
            ? o.orderItems.map((it): OrderItem => ({
                id: String(it.id ?? ''),
                productId: String(it.productId ?? ''),
                quantity: Number(it.quantity ?? 0),
                size: (it.size as SizeKey) ?? 'M',
                unitPrice: typeof it.unitPrice === 'number' ? it.unitPrice : null,
                totalPrice: typeof it.totalPrice === 'number' ? it.totalPrice : null,
                product: it.product
                  ? {
                      id: String(it.product.id ?? ''),
                      name: String(it.product.name ?? ''),
                      imageUrls: Array.isArray(it.product.imageUrls)
                        ? it.product.imageUrls
                        : [],
                    }
                  : null,
              }))
            : [];

          return {
            id: String(o.id ?? ''),
            trackingId: o.trackingId ?? null,
            status: (o.status as AllowedStatus) ?? 'รอดำเนินการ',
            createdAt: String(o.createdAt ?? ''),
            createdAtThai: o.createdAtThai ?? null,
            orderItems,
            user: o.user
              ? {
                  id: o.user.id,
                  email: o.user.email ?? undefined,
                  name: o.user.name ?? undefined,
                }
              : undefined,
          };
        });

        const mine = mapped.filter((r) => r.user?.id === userId);
        const filtered = orderId ? mine.filter((r) => r.id === orderId) : mine;
        setRows(filtered);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดคำสั่งซื้อไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orderId]);

  const flatItems = useMemo(
    () =>
      rows.flatMap((order) =>
        order.orderItems.map((it) => ({
          orderId: order.id,
          trackingId: order.trackingId,
          status: order.status,
          createdAt: order.createdAtThai ?? order.createdAt,
          item: it,
        }))
      ),
    [rows]
  );

  if (loading) {
    return (
      <div>
        <h4 className={styles.title}>ติดตามการสั่งซื้อ</h4>
        <div>กำลังโหลด…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div>
        <h4 className={styles.title}>ติดตามการสั่งซื้อ</h4>
        <div style={{ color: '#c00' }}>❌ {err}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <h4 className={styles.title}>ติดตามการสั่งซื้อ</h4>
        <div>ยังไม่มีคำสั่งซื้อ</div>
      </div>
    );
  }

  return (
    <div className={styles.orderList}>
      {rows.map((order) => (
        <div key={order.id} className={styles.orderCard}>
          {/* Header */}
          <div className={styles.orderHeader}>
            <div className={styles.headerRow}>
              <div>
                <span className={styles.headerLabel}>รหัสคำสั่งซื้อ:</span>{' '}
                <span className={styles.headerValue}>{order.id}</span>
              </div>
              <div className={styles.headerRight}>
                <span className={styles.headerDate}>
                  {order.createdAtThai ?? order.createdAt}
                </span>
                <span className={statusClass(order.status)}>{order.status}</span>
              </div>
            </div>

            <div className={styles.headerRow}>
              <div>
                <span className={styles.headerLabel}>Tracking:</span>{' '}
                <span className={styles.headerValue}>
                  {order.trackingId ?? 'ยังไม่มี'}
                </span>
              </div>
            </div>
            {/* ลิงก์รายละเอียดเพิ่มเติม */}
            <div className={styles.headerRow}>
              <div></div>
              <Link
                href={`/Order-details-id/${order.id}`}
                className={styles.productExtraLink}
              >
                รายละเอียดเพิ่มเติม →
              </Link>
            </div>
          </div>

          {/* Items */}
          <div className={styles.items}>
            {order.orderItems.map((it) => (
              <div key={it.id} className={styles.orderItem}>
                <Image
                  className={styles.thumb}
                  src={firstImage(it.product?.imageUrls)}
                  alt={it.product?.name || 'product'}
                  width={60}
                  height={60}
                />

                <div className={styles.meta}>
                  <p className={styles.productName}>{it.product?.name ?? '-'}</p>
                  <span className={styles.productDetail}>
                    Size: {it.size} &nbsp; x{it.quantity}
                  </span>
                </div>

                <div className={styles.price}>
                  ฿
                  {formatNumber(
                    (it.totalPrice ??
                      (typeof it.unitPrice === 'number'
                        ? it.unitPrice * it.quantity
                        : 0)) || 0
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
