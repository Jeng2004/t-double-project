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
  displaySize?: string;
  notes?: string;
  product?: {
    id: string;
    name: string;
    imageUrls: string[];
  } | null;
};

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอชำระเงิน'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'ลูกค้าคืนสินค้า'
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
  source?: 'normal' | 'special';
  paymentUrl?: string | null;
};

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
  trackingId?: string | null;
  status?: string | null;
  createdAt?: string;
  createdAtThai?: string | null;
  orderItems?: OrderItemApi[];
  user?: { id?: string; email?: string | null; name?: string | null } | null;
  /** ✅ ใช้ตัดสินว่าไม่ควรแสดง “รอชำระเงิน” */
  isPaid?: boolean | null;
  /** เผื่อมีระบบส่ง paymentStatus มา เช่น 'succeeded' */
  paymentStatus?: string | null;
};

type SpecialOrderApi = {
  id?: string | number;
  trackingId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  createdAtThai?: string | null;
  quantity?: number | string | null;
  price?: number | null;
  productName?: string | null;
  color?: string | null;
  sizeDetail?: string | null;
  sizeLabel?: string | null;
  user?: { id?: string; email?: string | null; name?: string | null } | null;
  paymentUrl?: string | null;
  // เผื่ออนาคตมีบอกสถานะเงิน
  paymentStatus?: string | null;
};

type Props = {
  orderId?: string;
};

const ALLOWED: AllowedStatus[] = [
  'ยกเลิก',
  'รอชำระเงิน',
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
  'ลูกค้าคืนสินค้า',
  'กำลังจัดส่งคืนสินค้า',
];

const toStatus = (s?: string | null): AllowedStatus => {
  const v = String(s ?? '').trim();
  if ((ALLOWED as string[]).includes(v)) return v as AllowedStatus;

  switch (v.toLowerCase()) {
    case 'pending payment':
    case 'waiting for payment':
    case 'unpaid':
      return 'รอชำระเงิน';
    case 'pending':
      return 'รอดำเนินการ';
    case 'preparing':
      return 'กำลังดำเนินการจัดเตรียมสินค้า';
    case 'shipping':
    case 'in transit':
      return 'กำลังดำเนินการจัดส่งสินค้า';
    case 'delivered':
    case 'completed':
      return 'จัดส่งสินค้าสำเร็จเเล้ว';
    case 'returning':
    case 'return shipping':
      return 'กำลังจัดส่งคืนสินค้า';
    case 'customer returned':
      return 'ลูกค้าคืนสินค้า';
    case 'cancelled':
    case 'canceled':
      return 'ยกเลิก';
    default:
      return 'รอดำเนินการ';
  }
};

/** ✅ แปลงสถานะโดยพิจารณา isPaid/paymentStatus */
const deriveStatus = (
  raw?: string | null,
  opts?: { isPaid?: boolean | null; paymentStatus?: string | null }
): AllowedStatus => {
  let base = toStatus(raw);

  const paid =
    opts?.isPaid === true
      ? true
      : typeof opts?.paymentStatus === 'string'
        ? /paid|success|succeed|succeeded/gi.test(opts!.paymentStatus!)
        : false;

  // ถ้าจ่ายแล้ว ไม่ควรอยู่ “รอชำระเงิน” → ดันขึ้นเป็น “รอดำเนินการ”
  if (paid && base === 'รอชำระเงิน') {
    base = 'รอดำเนินการ';
  }
  return base;
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
    case 'รอชำระเงิน':
      return `${styles.status} ${styles.statusPayWait}`;
    case 'รอดำเนินการ':
      return `${styles.status} ${styles.statusPending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า':
      return `${styles.status} ${styles.statusPreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า':
      return `${styles.status} ${styles.statusShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว':
      return `${styles.status} ${styles.statusSuccess}`;
    case 'ลูกค้าคืนสินค้า':
    case 'กำลังจัดส่งคืนสินค้า':
      return `${styles.status} ${styles.statusReturn}`;
    case 'ยกเลิก':
    default:
      return `${styles.status} ${styles.statusCancel}`;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function parseSizeDetail(input?: string | null): { displaySize?: string; notes?: string } {
  const raw = String(input ?? '').trim();
  if (!raw) return {};
  const parts = raw.split('|').map((s) => s.trim());
  const sizePart = parts.find((p) => /^preset:/i.test(p) || /^custom:/i.test(p));
  const notesPart = parts.find((p) => /^notes:/i.test(p));

  let displaySize: string | undefined;
  if (sizePart) {
    const [, val] = sizePart.split(':');
    displaySize = (val ?? '').trim() || undefined;
  }

  let notes: string | undefined;
  if (notesPart) {
    notes = notesPart.replace(/^notes:\s*/i, '').trim() || undefined;
  }

  return { displaySize, notes };
}

export default function TrackOrders({ orderId }: Props) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const uid = getUserIdForFrontend();
    if (!uid) {
      setErr('ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบ');
      setLoading(false);
      return;
    }

    let currentEmail = '';

    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const rp = await fetch(`/api/profile?userId=${uid}`, { cache: 'no-store' });
        if (rp.ok) {
          const pj = await rp.json();
          currentEmail = pj?.user?.email || '';
        }

        const [resNormal, resSpecial] = await Promise.all([
          fetch('/api/orders', { cache: 'no-store' }),
          fetch('/api/special-orders', { cache: 'no-store' }),
        ]);

        // ---------- ปกติ ----------
        const dataNormal: unknown = await resNormal.json();
        const normalArr: OrderApi[] = Array.isArray(dataNormal)
          ? (dataNormal as OrderApi[])
          : [dataNormal as OrderApi];

        const normalMapped: OrderRow[] = normalArr.map((o) => {
          const paid = o.isPaid === true;
          const status = deriveStatus(o.status, { isPaid: paid, paymentStatus: o.paymentStatus });

          return {
            id: String(o.id ?? ''),
            trackingId: o.trackingId ?? null,
            status,
            createdAt: String(o.createdAt ?? ''),
            createdAtThai: o.createdAtThai ?? null,
            orderItems: Array.isArray(o.orderItems)
              ? o.orderItems.map((it): OrderItem => ({
                  id: String(it?.id ?? ''),
                  productId: String(it?.productId ?? ''),
                  quantity: Number(it?.quantity ?? 0),
                  size: (it?.size as SizeKey) ?? 'M',
                  unitPrice: typeof it?.unitPrice === 'number' ? it.unitPrice : null,
                  totalPrice: typeof it?.totalPrice === 'number' ? it.totalPrice : null,
                  product: it?.product
                    ? {
                        id: String(it.product.id ?? ''),
                        name: String(it.product.name ?? ''),
                        imageUrls: Array.isArray(it.product.imageUrls) ? it.product.imageUrls! : [],
                      }
                    : null,
                }))
              : [],
            user: o.user
              ? {
                  id: o.user.id,
                  email: o.user.email ?? undefined,
                  name: o.user.name ?? undefined,
                }
              : undefined,
            source: 'normal',
          };
        });

        // ---------- พิเศษ ----------
        const dataSpecialUnknown: unknown = await resSpecial.json();

        let specialArr: SpecialOrderApi[] = [];
        if (Array.isArray(dataSpecialUnknown)) {
          specialArr = dataSpecialUnknown as SpecialOrderApi[];
        } else if (isRecord(dataSpecialUnknown) && Array.isArray(dataSpecialUnknown.orders)) {
          specialArr = dataSpecialUnknown.orders as SpecialOrderApi[];
        } else if (isRecord(dataSpecialUnknown) && dataSpecialUnknown.order) {
          specialArr = [dataSpecialUnknown.order as SpecialOrderApi];
        }

        const specialMapped: OrderRow[] = specialArr.map((s: SpecialOrderApi) => {
          const qty = Number(s.quantity ?? 0);
          const { displaySize, notes } = parseSizeDetail(s.sizeDetail ?? s.sizeLabel ?? '');
          const status = deriveStatus(s.status, { paymentStatus: s.paymentStatus });

          return {
            id: String(s.id ?? ''),
            trackingId: s.trackingId ?? null,
            status,
            createdAt: String(s.createdAt ?? ''),
            createdAtThai: s.createdAtThai ?? null,
            orderItems: [
              {
                id: `${s.id ?? ''}-sp-1`,
                productId: 'special',
                quantity: qty || 1,
                size: 'M',
                displaySize,
                notes,
                unitPrice: typeof s.price === 'number' ? s.price : null,
                totalPrice: typeof s.price === 'number' ? s.price * (qty || 1) : null,
                product: {
                  id: 'special',
                  name: [s.productName || 'Special Order', s.color ? `(${s.color})` : null]
                    .filter(Boolean)
                    .join(' '),
                  imageUrls: [],
                },
              },
            ],
            user: s.user
              ? { id: s.user.id, email: s.user.email ?? undefined, name: s.user.name ?? undefined }
              : undefined,
            source: 'special',
            paymentUrl: s.paymentUrl ?? null,
          };
        });

        // ---------- รวม + กรองเฉพาะของฉัน ----------
        const mineNormal = normalMapped.filter((r) => r.user?.id === uid || r.user?.email === currentEmail);
        const mineSpecial = specialMapped.filter(
          (r) => r.user?.id === uid || (!!currentEmail && r.user?.email === currentEmail)
        );

        const combined = [...mineNormal, ...mineSpecial].sort((a, b) => {
          const ax = a.createdAtThai ?? a.createdAt;
          const bx = b.createdAtThai ?? b.createdAt;
          return (new Date(bx).getTime() || 0) - (new Date(ax).getTime() || 0);
        });

        setRows(orderId ? combined.filter((r) => r.id === orderId) : combined);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดคำสั่งซื้อไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orderId]);

  if (loading) return <div>กำลังโหลด…</div>;
  if (err) return <div style={{ color: '#c00' }}>❌ {err}</div>;
  if (rows.length === 0) return <div>ยังไม่มีคำสั่งซื้อ</div>;

  return (
    <div className={styles.orderList}>
      {rows.map((order) => (
        <div key={order.id} className={styles.orderCard}>
          <div className={styles.orderHeader}>
            <div className={styles.headerRow}>
              <div>
                <span className={styles.headerLabel}>รหัสคำสั่งซื้อ:</span>{' '}
                <span className={styles.headerValue}>{order.id}</span>
                {order.source === 'special' && <span className={styles.specialBadge}>SPECIAL</span>}
              </div>
              <div className={styles.headerRight}>
                <span className={styles.headerDate}>{order.createdAtThai ?? order.createdAt}</span>
                <span className={statusClass(order.status)}>{order.status}</span>
              </div>
            </div>
            <div className={styles.headerRow}>
              <div>
                <span className={styles.headerLabel}>Tracking:</span>{' '}
                <span className={styles.headerValue}>{order.trackingId ?? 'ยังไม่มี'}</span>
              </div>
            </div>
            <div className={styles.headerRow}>
              <div></div>
              <Link
                href={
                  order.source === 'special'
                    ? `/Special-details-id/${order.id}`
                    : `/Order-details-id/${order.id}`
                }
                className={styles.productExtraLink}
              >
                รายละเอียดเพิ่มเติม →
              </Link>
            </div>
          </div>

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
                    Size: {it.displaySize ?? it.size} &nbsp; x{it.quantity}
                  </span>
                </div>
                <div className={styles.price}>
                  ฿
                  {formatNumber(
                    (it.totalPrice ??
                      (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0)) || 0
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
