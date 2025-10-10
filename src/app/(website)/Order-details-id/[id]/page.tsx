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
  | 'ลูกค้าคืนสินค้า';

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

type OrderItemApi = {
  id?: string | number;
  productId?: string | number;
  quantity?: number;
  size?: string;
  unitPrice?: number;
  totalPrice?: number;
  product?: { id?: string | number; name?: string; imageUrls?: string[] } | null;
};

type OrderApi = {
  id?: string | number;
  trackingId?: string | null;
  status?: string;
  createdAt?: string;
  createdAtThai?: string | null;
  orderItems?: OrderItemApi[];
  user?: { id?: string; email?: string | null; name?: string | null } | null;
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
    case 'ลูกค้าคืนสินค้า':
      return `${styles.badge} ${styles.badgeReturn}`;
    case 'ยกเลิก':
    default:
      return `${styles.badge} ${styles.badgeCancel}`;
  }
};

/** สถานะที่ถือว่า "จ่ายแล้ว" และควรแสดง/สร้างสลิปจริง */
const PAID_STATUSES: AllowedStatus[] = [
  'รอดำเนินการ',
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
  'ลูกค้าคืนสินค้า',
];

export default function OrderDetailsPage() {
  // ✅ เลิก destructure เพื่อตัด union | null
  const params = useParams() as { id?: string } | null;
  const id = params?.id ?? '';

  const router = useRouter();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // สลิป (ใช้ blob URL เพื่อเปิดแท็บใหม่ได้)
  const [slipBlobUrl, setSlipBlobUrl] = useState<string | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipErr, setSlipErr] = useState<string | null>(null);

  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        if (!id) return;
        setLoading(true);
        setErr(null);

        // โหลดคำสั่งซื้อ
        const oRes = await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        const oDataUnknown: unknown = await oRes.json();
        if (!oRes.ok) {
          const msg =
            (oDataUnknown as { error?: string } | null)?.error ||
            `โหลดคำสั่งซื้อผิดพลาด: ${oRes.status}`;
          throw new Error(msg);
        }
        const oData = oDataUnknown as OrderApi;

        const ownerId = oData?.user?.id ?? null;
        if (!ownerId || ownerId !== userId) {
          throw new Error('ไม่พบคำสั่งซื้อของคุณหรือไม่มีสิทธิ์เข้าถึง');
        }

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

        const pres = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`, {
          cache: 'no-store',
        });
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

  // โหลด/สร้างสลิปเมื่อตรงสถานะ "จ่ายแล้ว" → เก็บเป็น blob URL เพื่อเปิดแท็บใหม่ได้
  useEffect(() => {
    if (!order) return;

    // เคลียร์ของเดิม
    setSlipErr(null);
    setSlipLoading(false);

    if (!PAID_STATUSES.includes(order.status)) {
      if (slipBlobUrl) URL.revokeObjectURL(slipBlobUrl);
      setSlipBlobUrl(null);
      return;
    }

    let canceled = false;
    let currentBlob: string | null = null;

    const loadSlip = async () => {
      try {
        setSlipLoading(true);
        setSlipErr(null);

        // ลอง GET
        let r = await fetch(`/api/slip?orderId=${encodeURIComponent(order.id)}`, { cache: 'no-store' });
        if (r.status === 404) {
          // ยังไม่มี → POST เพื่อสร้าง แล้วค่อย GET ใหม่
          const p = await fetch('/api/slip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id }),
          });
          if (!p.ok) throw new Error(await p.text());
          r = await fetch(`/api/slip?orderId=${encodeURIComponent(order.id)}`, { cache: 'no-store' });
        }
        if (!r.ok) throw new Error(await r.text());

        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        currentBlob = url;

        if (!canceled) setSlipBlobUrl(url);
      } catch (e) {
        if (!canceled) setSlipErr('ไม่สามารถโหลดสลิปได้');
      } finally {
        if (!canceled) setSlipLoading(false);
      }
    };

    loadSlip();

    return () => {
      canceled = true;
      if (currentBlob) URL.revokeObjectURL(currentBlob);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status]);

  const orderTotal = useMemo(() => {
    if (!order) return 0;
    return order.orderItems.reduce((sum, it) => {
      const line =
        it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0);
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
  const canReturn = order.status === 'จัดส่งสินค้าสำเร็จเเล้ว';
  const canCancel = order.status === 'รอดำเนินการ';

  // ฝัง blob URL แบบซ่อน UI + fit width
  const slipEmbedSrc =
    slipBlobUrl &&
    `${slipBlobUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH&zoom=page-width`;

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
              <div className={styles.infoValue}>บัตร/QR</div>

              <div className={styles.infoLabel}>ยอดรวมทั้งหมด</div>
              <div className={styles.infoValue}>฿{formatNumber(orderTotal)}</div>
            </div>
          </section>

          {/* รายการสินค้า + แสดงสถานะ */}
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

          {/* ข้อมูลการจัดส่ง */}
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

          {/* Payment Verification */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Payment Verification</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>สถานะการชำระเงิน</div>
              <div className={styles.infoValue}>
                {PAID_STATUSES.includes(order.status) ? 'ชำระแล้ว (รอตรวจสอบ)' : 'ยังไม่ชำระ / ยกเลิก'}
              </div>

              <div className={styles.infoLabel}>ยอดชำระ</div>
              <div className={styles.infoValue}>฿{formatNumber(orderTotal)}</div>
            </div>
          </section>

          {/* สลิปการชำระเงิน (ย่อเหลือครึ่งหนึ่ง) */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>สลิปการชำระเงิน</h3>

            {PAID_STATUSES.includes(order.status) ? (
              slipEmbedSrc ? (
                <div
                  className={styles.slipWrap}
                  role="button"
                  title="คลิกเพื่อเปิดสลิปในแท็บใหม่ (PDF)"
                  tabIndex={0}
                  onClick={() => {
                    if (slipBlobUrl) {
                      window.open(slipBlobUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && slipBlobUrl) {
                      window.open(slipBlobUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  <iframe
                    className={styles.slipFrame}
                    src={slipEmbedSrc}
                    title="payment-slip"
                    scrolling="no"
                  />
                  <div className={styles.slipOverlay} aria-hidden />
                </div>
              ) : slipLoading ? (
                <div>กำลังโหลดสลิป…</div>
              ) : (
                <div className={styles.error}>{slipErr ?? 'ไม่พบสลิป'}</div>
              )
            ) : (
              <div className={styles.fakeSlip}>
                <div className={styles.fakeSlipHeader}>PAYMENT SLIP </div>
                <div className={styles.fakeSlipBody}>
                  <div>Amount: ฿{formatNumber(orderTotal)}</div>
                </div>
              </div>
            )}
          </section>

          {/* ปุ่มการทำรายการ */}
          <div className={styles.actions}>
            {canReturn && (
              <button
                className={styles.btnSecondary}
                onClick={() => router.push(`/return-the-product/${encodeURIComponent(order.id)}`)}
              >
                คืนสินค้า
              </button>
            )}
            {canCancel && (
              <button
                className={styles.btnDanger}
                onClick={() => router.push(`/Cancel-order/${encodeURIComponent(order.id)}`)}
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
