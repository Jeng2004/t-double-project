'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import NavbarAdmin from '../../components/NavbarAdmin';
import styles from './Order-details-admin.module.css';

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
    code?: string | null;
  } | null;
};

type OrderRow = {
  id: string;
  trackingId: string | null;
  status: AllowedStatus;
  createdAt: string;
  createdAtThai?: string | null;
  totalAmount?: number | null;
  orderItems: OrderItem[];
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
};

const firstImage = (arr?: string[]) =>
  (arr && arr.length > 0 ? arr[0] : '/placeholder.png');

const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n); }
  catch { return String(n); }
};

const normalizeStatus = (s: unknown): AllowedStatus => {
  const allowed: AllowedStatus[] = [
    'ยกเลิก',
    'รอดำเนินการ',
    'กำลังดำเนินการจัดเตรียมสินค้า',
    'กำลังดำเนินการจัดส่งสินค้า',
    'จัดส่งสินค้าสำเร็จเเล้ว',
    'ลูกค้าคืนสินค้า',
  ];
  const str = String(s ?? '');
  return (allowed as string[]).includes(str) ? (str as AllowedStatus) : 'รอดำเนินการ';
};

const statusBadgeClass = (status: AllowedStatus) => {
  switch (status) {
    case 'รอดำเนินการ': return `${styles.badge} ${styles.badgePending}`;
    case 'กำลังดำเนินการจัดเตรียมสินค้า': return `${styles.badge} ${styles.badgePreparing}`;
    case 'กำลังดำเนินการจัดส่งสินค้า': return `${styles.badge} ${styles.badgeShipping}`;
    case 'จัดส่งสินค้าสำเร็จเเล้ว': return `${styles.badge} ${styles.badgeSuccess}`;
    case 'ลูกค้าคืนสินค้า': return `${styles.badge} ${styles.badgeReturn}`;
    case 'ยกเลิก':
    default: return `${styles.badge} ${styles.badgeCancel}`;
  }
};

/** สถานะที่ถือว่า "จ่ายแล้ว" และควรแสดง/สร้างสลิปจริง */
const PAID_STATUSES: AllowedStatus[] = [
  'รอดำเนินการ', // จ่ายแล้ว รอแอดมินตรวจ
  'กำลังดำเนินการจัดเตรียมสินค้า',
  'กำลังดำเนินการจัดส่งสินค้า',
  'จัดส่งสินค้าสำเร็จเเล้ว',
  'ลูกค้าคืนสินค้า',
];

export default function OrderDetailsAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [act, setAct] = useState<'confirm' | 'cancel' | null>(null);

  // === สลิป (blob URL เพื่อเปิดแท็บใหม่ได้) ===
  const [slipBlobUrl, setSlipBlobUrl] = useState<string | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipErr, setSlipErr] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/orders?id=${id}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'โหลดคำสั่งซื้อไม่สำเร็จ');

        const items: OrderItem[] = Array.isArray(data?.orderItems)
          ? data.orderItems.map((it: unknown): OrderItem => {
              const r = (it ?? {}) as Record<string, unknown>;
              const p = (r.product as Record<string, unknown> | null | undefined) ?? null;
              return {
                id: String(r.id ?? ''),
                productId: String(r.productId ?? ''),
                quantity: Number(r.quantity ?? 0),
                size: String(r.size ?? 'M') as SizeKey,
                unitPrice: typeof r.unitPrice === 'number' ? r.unitPrice : null,
                totalPrice: typeof r.totalPrice === 'number' ? r.totalPrice : null,
                product: p ? {
                  id: String(p.id ?? ''),
                  name: String(p.name ?? ''),
                  imageUrls: Array.isArray(p.imageUrls) ? (p.imageUrls as string[]) : [],
                  code: (p.code as string | null | undefined) ?? null,
                } : null,
              };
            })
          : [];

        const mapped: OrderRow = {
          id: String(data.id ?? ''),
          trackingId: data.trackingId ?? null,
          status: normalizeStatus(data.status),
          createdAt: String(data.createdAt ?? ''),
          createdAtThai: data.createdAtThai ?? null,
          totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : null,
          orderItems: items,
          user: data.user ? {
            id: data.user.id,
            email: data.user.email ?? null,
            name: data.user.name ?? null,
            phone: data.user.phone ?? null,
            address: data.user.address ?? null,
          } : null,
        };

        if (!ignore) setOrder(mapped);
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    if (id) load();
    return () => { ignore = true; };
  }, [id]);

  // โหลด/สร้างสลิปถ้าสถานะเป็น “จ่ายแล้ว”
  useEffect(() => {
    if (!order) return;

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

        // GET ก่อน
        let r = await fetch(`/api/slip?orderId=${order.id}`, { cache: 'no-store' });
        if (r.status === 404) {
          // ไม่มี → POST สร้าง แล้ว GET ใหม่
          const p = await fetch('/api/slip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id }),
          });
          if (!p.ok) throw new Error(await p.text());
          r = await fetch(`/api/slip?orderId=${order.id}`, { cache: 'no-store' });
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
    if (typeof order.totalAmount === 'number') return order.totalAmount;
    return order.orderItems.reduce((s, it) => {
      const line = it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0);
      return s + (line || 0);
    }, 0);
  }, [order]);

  async function changeStatus(status: AllowedStatus, mode: 'confirm' | 'cancel') {
    if (!order) return;
    try {
      setAct(mode);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'อัปเดตสถานะไม่สำเร็จ');
      setOrder(prev => prev ? { ...prev, status: normalizeStatus(data.order?.status ?? status) } : prev);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setAct(null);
    }
  }

  if (loading) {
    return (
      <>
        <NavbarAdmin />
        <div className={styles.page}><div className={styles.container}>กำลังโหลด…</div></div>
      </>
    );
  }
  if (err || !order) {
    return (
      <>
        <NavbarAdmin />
        <div className={styles.page}><div className={styles.container}><div className={styles.error}>❌ {err || 'ไม่พบคำสั่งซื้อ'}</div></div></div>
      </>
    );
  }

  const paymentMethod = 'บัตร / QR (จำลอง)';
  const paymentStatus = PAID_STATUSES.includes(order.status) ? 'ชำระแล้ว (รอตรวจสอบ)' : 'ยังไม่ชำระ / ยกเลิก';

  // สร้าง src สำหรับฝัง PDF (ซ่อน UI + fit width)
  const slipEmbedSrc =
    slipBlobUrl &&
    `${slipBlobUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH&zoom=page-width`;

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>รายละเอียดคำสั่งซื้อ</h1>

          <div className={styles.infoGrid}>
            <div className={styles.infoLabel}>เลขที่คำสั่งซื้อ:</div>
            <div className={styles.infoValue}>ORD-{order.id}</div>

            <div className={styles.infoLabel}>สถานะ:</div>
            <div className={styles.infoValue}>
              <span className={statusBadgeClass(order.status)}>{order.status}</span>
            </div>
          </div>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลลูกค้า</h3>
            <div className={styles.recipientCard}>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ชื่อผู้รับ</div>
                  <div className={styles.recValue}>{order.user?.name ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                  <div className={styles.recValue}>{order.user?.phone ?? '-'}</div>
                </div>
              </div>
              <div className={styles.recRow}>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>อีเมล</div>
                  <div className={styles.recValue}>{order.user?.email ?? '-'}</div>
                </div>
                <div className={styles.recCol}>
                  <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                  <div className={styles.recValue}>{order.user?.address ?? '-'}</div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>สินค้าในคำสั่งซื้อ</h3>
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
                  <div className={styles.itemSub}>
                    Size: {it.size} • x{it.quantity} {it.product?.code ? `• SKU: ${it.product.code}` : ''}
                  </div>
                </div>

                <div className={styles.itemPrice}>
                  ฿{nf((it.totalPrice ?? (typeof it.unitPrice === 'number' ? it.unitPrice * it.quantity : 0)) || 0)}
                </div>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลการชำระเงิน</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>วิธีการชำระเงิน:</div>
              <div className={styles.infoValue}>{paymentMethod}</div>

              <div className={styles.infoLabel}>สถานะการชำระเงิน:</div>
              <div className={styles.infoValue}>{paymentStatus}</div>
            </div>

            <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Payment Verification</div>

            {/* สลิปจริง (ถ้าชำระแล้ว) หรือ DEMO (ถ้ายัง) */}
            {PAID_STATUSES.includes(order.status) ? (
              slipEmbedSrc ? (
                <div
                  className={styles.slipWrap}
                  role="button"
                  title="คลิกเพื่อเปิดสลิปในแท็บใหม่ (PDF)"
                  tabIndex={0}
                  onClick={() => { if (slipBlobUrl) window.open(slipBlobUrl, '_blank', 'noopener,noreferrer'); }}
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
                <div className={styles.fakeSlipHeader}>PAYMENT SLIP (DEMO)</div>
                <div className={styles.fakeSlipBody}>
                  <div>Amount: ฿{nf(orderTotal)}</div>
                </div>
              </div>
            )}
          </section>

          <div className={styles.actions}>
            {order.status === 'รอดำเนินการ' && (
              <>
                <button
                  className={styles.btnPrimary}
                  disabled={act === 'confirm'}
                  onClick={() => changeStatus('กำลังดำเนินการจัดเตรียมสินค้า', 'confirm')}
                >
                  {act === 'confirm' ? 'กำลังคอนเฟิร์ม…' : 'Confirm Order'}
                </button>
                <button
                  className={styles.btnDanger}
                  disabled={act === 'cancel'}
                  onClick={() => changeStatus('ยกเลิก', 'cancel')}
                >
                  {act === 'cancel' ? 'กำลังยกเลิก…' : 'Cancel Order'}
                </button>
              </>
            )}

            <button className={styles.btnGhost} onClick={() => router.back()}>ย้อนกลับ</button>
          </div>
        </div>
      </div>
    </>
  );
}
