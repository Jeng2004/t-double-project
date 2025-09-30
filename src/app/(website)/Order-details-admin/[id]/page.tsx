// src/app/(website)/Order-details-admin/[id]/page.tsx
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
  | 'จัดส่งสินค้าสำเร็จเเล้ว'; // ← ตัด 'กำลังจัดส่งคืนสินค้า'

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

const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');
const nf = (n: number) => { try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); } };

// กันสถานะนอกลิสต์ให้เป็น 'รอดำเนินการ'
const normalizeStatus = (s: unknown): AllowedStatus => {
  const allowed: AllowedStatus[] = [
    'ยกเลิก',
    'รอดำเนินการ',
    'กำลังดำเนินการจัดเตรียมสินค้า',
    'กำลังดำเนินการจัดส่งสินค้า',
    'จัดส่งสินค้าสำเร็จเเล้ว',
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
    case 'ยกเลิก':
    default: return `${styles.badge} ${styles.badgeCancel}`;
  }
};

export default function OrderDetailsAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [act, setAct] = useState<'confirm' | 'cancel' | null>(null);

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
                product: p
                  ? {
                      id: String(p.id ?? ''),
                      name: String(p.name ?? ''),
                      imageUrls: Array.isArray(p.imageUrls) ? (p.imageUrls as string[]) : [],
                      code: (p.code as string | null | undefined) ?? null,
                    }
                  : null,
              };
            })
          : [];

        const mapped: OrderRow = {
          id: String(data.id ?? ''),
          trackingId: data.trackingId ?? null,
          status: normalizeStatus(data.status), // ← ปรับให้ปลอดภัย
          createdAt: String(data.createdAt ?? ''),
          createdAtThai: data.createdAtThai ?? null,
          totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : null,
          orderItems: items,
          user: data.user
            ? {
                id: data.user.id,
                email: data.user.email ?? null,
                name: data.user.name ?? null,
                phone: data.user.phone ?? null,
                address: data.user.address ?? null,
              }
            : null,
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
      setOrder((prev) => prev ? { ...prev, status: normalizeStatus(data.order?.status ?? status) } : prev);
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
  const paymentStatus =
    order.status === 'รอดำเนินการ' || order.status === 'ยกเลิก' ? 'รอตรวจสอบ' : 'ชำระแล้ว';

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.container}>
          {/* 1) รายละเอียดคำสั่งซื้อ */}
          <h1 className={styles.title}>รายละเอียดคำสั่งซื้อ</h1>
          <div className={styles.infoGrid}>
            <div className={styles.infoLabel}>เลขที่คำสั่งซื้อ:</div>
            <div className={styles.infoValue}>ORD-{order.id}</div>

            <div className={styles.infoLabel}>สถานะ:</div>
            <div className={styles.infoValue}>
              <span className={statusBadgeClass(order.status)}>{order.status}</span>
            </div>
          </div>

          {/* 1.1 ข้อมูลลูกค้า */}
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

          {/* 2) สินค้าในคำสั่งซื้อ */}
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

          {/* 3) ข้อมูลการชำระเงิน */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลการชำระเงิน</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>วิธีการชำระเงิน:</div>
              <div className={styles.infoValue}>{paymentMethod}</div>

              <div className={styles.infoLabel}>สถานะการชำระเงิน:</div>
              <div className={styles.infoValue}>{paymentStatus}</div>
            </div>

            <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Payment Verification</div>

            {/* สลิปจำลอง */}
            <div className={styles.fakeSlip}>
              <div className={styles.fakeSlipHeader}>PAYMENT SLIP (DEMO)</div>
              <div className={styles.fakeSlipBody}>
                <div>Transfer Date: 2024-01-15</div>
                <div>Time: 10:35 AM</div>
                <div>Bank: First National Bank</div>
                <div>Ref No: TX-0000001</div>
                <div>Amount: ฿{nf(orderTotal)}</div>
              </div>
            </div>
          </section>

          {/* ปุ่ม */}
          <div className={styles.actions}>
            {/* เฉพาะ 'รอดำเนินการ' ให้กด Confirm/Cancel */}
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
