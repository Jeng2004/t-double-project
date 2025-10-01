// src/app/(website)/Return-the-product/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import styles from './return-the-product.module.css';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว'
  | 'กำลังจัดส่งคืนสินค้า';

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
  user?: { id?: string; email?: string | null; name?: string | null } | null;
};

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');

export default function ReturnTheProductPage() {
  const params = useParams() as { id: string } | null;
  const id = params?.id ?? '';
  const router = useRouter();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ฟอร์ม
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  // โหลดออเดอร์เฉพาะรายการนี้
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ กันเคสไม่มี id
        if (!id) {
          throw new Error('ลิงก์ไม่ถูกต้อง: ไม่พบรหัสคำสั่งซื้อ');
        }

        const res = await fetch(`/api/orders?id=${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`โหลดคำสั่งซื้อผิดพลาด: ${res.status}`);
        const oData: OrderApi = await res.json();

        // ✅ ตรวจสิทธิ์เจ้าของ
        const ownerId = oData?.user?.id ?? null;
        if (!ownerId || ownerId !== userId) {
          throw new Error('ไม่พบคำสั่งซื้อของคุณหรือไม่มีสิทธิ์เข้าถึง');
        }

        // ✅ map → OrderRow (type-safe)
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

        if (!ignore) {
          setOrder(mapped);
          // เริ่มต้นจำนวนที่จะคืนเป็น 0 ทุกชิ้น
          setQuantities(Object.fromEntries(items.map((it) => [it.id, 0])));
        }
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    // มีทั้ง id และ userId แล้วค่อยโหลด
    if (id && userId) load();

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

  const handleQtyChange = (itemId: string, max: number, nextVal: number) => {
    const safe = Math.max(0, Math.min(max, Math.floor(nextVal || 0)));
    setQuantities((q) => ({ ...q, [itemId]: safe }));
  };

  const onSubmit = async () => {
    if (!order) return;

    // อนุญาตขอคืนเฉพาะเมื่อจัดส่งสำเร็จแล้ว (ให้สอดคล้องกับ API /api/orders/return/[id])
    if (order.status !== 'จัดส่งสินค้าสำเร็จเเล้ว') {
      alert('สามารถคืนสินค้าได้เฉพาะออเดอร์ที่จัดส่งสำเร็จแล้วเท่านั้น');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

    if (items.length === 0) return alert('กรุณาเลือกจำนวนสินค้าที่ต้องการคืน');
    if (!files || files.length < 1) return alert('กรุณาแนบรูปอย่างน้อย 1 รูป (สูงสุด 5 รูป)');

    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('orderId', order.id); // ✅ API คาดหวัง
      fd.append('reason', reason);
      fd.append('items', JSON.stringify(items));
      Array.from(files).slice(0, 5).forEach((f) => fd.append('images', f));

      // ✅ ใช้เส้นทางใหม่ /api/orders/return/[id]
      const res = await fetch(`/api/orders/return`, {
        method: 'POST',
        body: fd,
      });


      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ส่งคำขอไม่สำเร็จ: ${res.status} ${t}`);
      }

      alert('ส่งคำขอคืนสินค้าเรียบร้อย');
      router.push(`/Order-details-id/${order.id}`);
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

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>คืนสินค้า</h1>

          {/* อินโฟคำสั่งซื้อ */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ข้อมูลคำสั่งซื้อ</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoLabel}>หมายเลขคำสั่งซื้อ</div>
              <div className={styles.infoValue}>ORD-{order.id}</div>

              <div className={styles.infoLabel}>วันที่สั่งซื้อ</div>
              <div className={styles.infoValue}>{createdAtDisplay}</div>

              <div className={styles.infoLabel}>ยอดรวม</div>
              <div className={styles.infoValue}>฿{formatNumber(orderTotal)}</div>

              <div className={styles.infoLabel}>สถานะคำสั่งซื้อปัจจุบัน</div>
              <div className={canReturn ? styles.infoValueSuccess : styles.infoValue}>
                {order.status}
              </div>
            </div>
          </section>

          {!canReturn ? (
            // ถ้ายังไม่จัดส่งสำเร็จ แสดงคำอธิบายและปุ่มกลับ
            <section className={styles.section}>
              <p className={styles.error}>
                สามารถยื่นคำขอคืนสินค้าได้เมื่อคำสั่งซื้ออยู่ในสถานะ “จัดส่งสินค้าสำเร็จเเล้ว”
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.ghost}
                  onClick={() => router.push(`/Order-details-id/${order.id}`)}
                >
                  กลับไปหน้ารายละเอียดคำสั่งซื้อ
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* รายการสินค้า */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>รายการสินค้า</h3>
                <div className={styles.itemList}>
                  {order.orderItems.map((it) => (
                    <div key={it.id} className={styles.itemRow}>
                      <div className={styles.thumbBox}>
                        <Image
                          src={firstImage(it.product?.imageUrls)}
                          alt={it.product?.name || 'product'}
                          width={84}
                          height={84}
                          className={styles.thumb}
                        />
                      </div>
                      <div className={styles.itemMeta}>
                        <div className={styles.itemName}>{it.product?.name ?? '-'}</div>
                        <div className={styles.itemSub}>
                          Size: {it.size} • ซื้อ {it.quantity} ชิ้น
                          {typeof it.unitPrice === 'number' && (
                            <> • ราคา {formatNumber(it.unitPrice)} บาท</>
                          )}
                        </div>
                      </div>
                      <div className={styles.itemQtyCell}>
                        <label className={styles.qtyLabel}>จำนวนที่จะคืน</label>
                        <input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={quantities[it.id] ?? 0}
                          onChange={(e) =>
                            handleQtyChange(it.id, it.quantity, Number(e.target.value))
                          }
                          className={styles.qtyInput}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* เหตุผล + อัปโหลด */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>รายละเอียด/เหตุผลในการขอคืน</h3>
                <textarea
                  className={styles.textarea}
                  placeholder="เช่น สินค้ามีตำหนิ / ไซส์ไม่พอดี / ได้สินค้าไม่ครบ"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className={styles.uploadRow}>
                  <label className={styles.uploadLabel}>อัปโหลดรูปภาพสินค้า (1–5 รูป)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setFiles(e.target.files)}
                    className={styles.fileInput}
                  />
                </div>
              </section>

              {/* นโยบายการคืน */}
              <section className={styles.policyBox}>
                <div className={styles.policyTitle}>นโยบายการคืนสินค้า</div>
                <ul className={styles.policyList}>
                  <li>คืนสินค้าได้ภายใน 7–14 วัน หลังจากได้รับสินค้า</li>
                  <li>สินค้าต้องอยู่ในสภาพใช้งาน, ป้ายสินค้า/ถุงต้องอยู่ครบ, ไม่มีรอยหรือกลิ่นผิดปกติ</li>
                  <li>ระบบจะดำเนินการภายใน 3–7 วันทำการ</li>
                </ul>
              </section>

              {/* ปุ่มยืนยัน */}
              <div className={styles.actions}>
                <button className={styles.primary} onClick={onSubmit} disabled={submitting}>
                  {submitting ? 'กำลังส่งคำขอ…' : 'ยืนยันการคืนสินค้า'}
                </button>
                <button
                  className={styles.ghost}
                  onClick={() => router.push(`/Order-details-id/${order.id}`)}
                >
                  กลับไปหน้ารายละเอียดคำสั่งซื้อ
                </button>
              </div>

              <div className={styles.note}>
                * การยกเลิก/คืนสินค้าอาจมีเงื่อนไขเพิ่มเติม ขึ้นอยู่กับประเภทสินค้าและสภาพสินค้า
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
