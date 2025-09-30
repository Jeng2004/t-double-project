// src/app/(website)/Special-details-id/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import styles from './Special-details-id.module.css';

type SpecialOrder = {
  id: string | number;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdAtThai?: string | null;
  trackingId?: string | null;

  productName?: string | null;
  category?: string | null;
  color?: string | null;
  quantity?: number | null;
  price?: number | null;       // ราคาต่อหน่วย (ถ้ามี)
  sizeDetail?: string | null;  // เช่น "preset:2XL | notes:…"

  user?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  isApproved?: boolean | null;          // ช่วยตัดสินใจเรื่องยกเลิก/คืน
  paymentIntentId?: string | null;      // ใช้ในคืนเงิน (ฝั่งแบ็กเอนด์เช็กอยู่แล้ว)
  paymentUrl?: string | null;
};

const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n); }
  catch { return String(n); }
};

// แตก sizeDetail => sizeLabel / notes
function parseSizeDetail(s?: string | null) {
  const raw = (s ?? '').trim();
  if (!raw) return { sizeLabel: '', notes: '' };
  let sizeLabel = '';
  let notes = '';
  raw.split('|').map(x => x.trim()).forEach(part => {
    const low = part.toLowerCase();
    if (low.startsWith('preset:') || low.startsWith('size:')) {
      sizeLabel = part.split(':').slice(1).join(':').trim();
    } else if (low.startsWith('notes:') || low.startsWith('หมายเหตุ:')) {
      notes = part.split(':').slice(1).join(':').trim();
    }
  });
  if (!sizeLabel) sizeLabel = raw;
  return { sizeLabel, notes };
}

// แปลงสถานะออเดอร์ → สถานะชำระเงิน (สำหรับแสดงขวาสุด)
function paymentStatusFromOrderStatus(status?: string | null) {
  const s = (status || '').toLowerCase();
  if (s.includes('รอชำระ')) return 'รอชำระเงิน';
  if (s.includes('รอดำเนินการ')) return 'ชำระแล้ว/รอผลิต';
  return s ? 'ชำระแล้ว' : '-';
}

export default function SpecialDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<SpecialOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ฟอร์มยกเลิก
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  // ฟอร์มคืนสินค้า
  const [returnReason, setReturnReason] = useState('');
  const [returnFiles, setReturnFiles] = useState<FileList | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnMsg, setReturnMsg] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setErr(null);

        // รองรับทั้ง /[id] (คืน object) และ ?id= (คืน {order})
        const byPath = await fetch(`/api/special-orders/${id}`, { cache: 'no-store' });
        if (byPath.ok) {
          const data = (await byPath.json()) as SpecialOrder;
          if (!ignore) setOrder(data);
        } else {
          const byQuery = await fetch(`/api/special-orders?id=${id}`, { cache: 'no-store' });
          const data = await byQuery.json();
          if (!byQuery.ok) throw new Error(data?.error || 'โหลดคำสั่งซื้อพิเศษไม่สำเร็จ');
          if (!ignore) setOrder((data?.order ?? data) as SpecialOrder);
        }
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    if (id) load();
    return () => { ignore = true; };
  }, [id]);

  const { sizeLabel, notes } = useMemo(() => parseSizeDetail(order?.sizeDetail), [order?.sizeDetail]);
  const unitPrice = typeof order?.price === 'number' ? order?.price : null;
  const qty = Number(order?.quantity || 0);
  const total = unitPrice ? unitPrice * qty : null;
  const payStatus = paymentStatusFromOrderStatus(order?.status);

  // ฟอลแบ็กข้อมูลผู้รับ
  const name =
    order?.user?.name ||
    [order?.firstName, order?.lastName].filter(Boolean).join(' ') ||
    '-';
  const email = order?.user?.email || order?.email || '-';
  const phone = order?.user?.phone || order?.phone || '-';
  const address = order?.user?.address || order?.address || '-';

  // เงื่อนไขเปิด/ปิดปุ่ม (เช็กแบบคร่าว ๆ — ฝั่ง API เป็นตัวตัดสินสุดท้าย)
  const s = (order?.status || '').toString();
  const isShipping = s.includes('กำลังดำเนินการจัดส่ง');
  const isDelivered = s.includes('จัดส่งสินค้าสำเร็จ');
  const isWaitingPayment = s.includes('รอชำระ');
  const canCancelUI = !!order && !isShipping && !isDelivered && !isWaitingPayment; // จ่ายแล้ว + ยังไม่ส่ง
  const canReturnUI = !!order && isDelivered;                                      // คืนได้เมื่อจัดส่งสำเร็จ

  async function handleCancel() {
    if (!order) return;
    try {
      setCanceling(true);
      setCancelMsg(null);
      const res = await fetch('/api/cancel-special-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: cancelReason || 'ไม่ระบุเหตุผล' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'ยกเลิกคำสั่งซื้อไม่สำเร็จ');
      setCancelMsg('✅ ยกเลิกคำสั่งซื้อและคืนเงินเรียบร้อย');
      // รีโหลดข้อมูล
      const fresh = await fetch(`/api/special-orders/${order.id}`, { cache: 'no-store' });
      if (fresh.ok) setOrder(await fresh.json());
    } catch (e) {
      setCancelMsg(`❌ ${(e as Error).message}`);
    } finally {
      setCanceling(false);
    }
  }

  async function handleReturn() {
    if (!order) return;
    try {
      setReturning(true);
      setReturnMsg(null);

      const fd = new FormData();
      fd.append('orderId', String(order.id));
      fd.append('reason', returnReason || 'ไม่ระบุเหตุผล');
      const files = returnFiles ? Array.from(returnFiles) : [];
      files.forEach(f => fd.append('images', f));

      const res = await fetch('/api/return-special-orders', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'ส่งคำขอคืนสินค้าไม่สำเร็จ');
      setReturnMsg('✅ ส่งคำขอคืนสินค้าเรียบร้อย (รอตรวจสอบ)');
      setReturnFiles(null);
      // ไม่จำเป็นต้องรีโหลดสถานะออเดอร์ทันที
    } catch (e) {
      setReturnMsg(`❌ ${(e as Error).message}`);
    } finally {
      setReturning(false);
    }
  }

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
          <div className={styles.container}>
            <div className={styles.error}>❌ {err || 'ไม่พบคำสั่งซื้อพิเศษ'}</div>
            <button className={styles.btnGhost} onClick={() => router.back()}>ย้อนกลับ</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>รายละเอียดคำสั่งซื้อ</h1>

          {/* หมายเลขคำสั่งซื้อ (ORD-xxx ตัวหนา) */}
          <div className={styles.orderLine}>
            <span className={styles.orderIdLabel}>หมายเลขคำสั่งซื้อ:</span>
            <span className={styles.orderIdValue}><b>ORD-{order.id}</b></span>
          </div>

          {/* หัวข้อ "ข้อมูลคำสั่งซื้อ" (ตัวหนา) */}
          <div className={styles.infoHeader}><b>ข้อมูลคำสั่งซื้อ</b></div>

          {/* ตาราง 2 คอลัมน์: ซ้าย label / ขวา value (4 บรรทัดรวมยอด) */}
          <div className={styles.infoGrid}>
            <div className={styles.infoLabel}>วันที่สั่งซื้อ</div>
            <div className={styles.infoValue}>{order.createdAtThai ?? order.createdAt ?? '-'}</div>

            <div className={styles.infoLabel}>วิธีการชำระเงิน</div>
            <div className={styles.infoValue}>บัตร / QR (Stripe)</div>

            <div className={styles.infoLabel}>สถานะการชำระเงิน</div>
            <div className={styles.infoValue}>{payStatus}</div>

            <div className={styles.infoLabel}>ยอดรวมทั้งหมด</div>
            <div className={styles.infoValue}>{total ? `฿${nf(total)}` : '-'}</div>
          </div>

          {/* หัวข้อ “สถานะคำสั่งซื้อ/รายละเอียดสินค้า” + สถานะชิดขวาสุด */}
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitle}>สถานะคำสั่งซื้อ/รายละเอียดสินค้า</span>
            <span className={styles.badge}>{order.status || '-'}</span>
          </div>

          {/* กล่องสินค้า (รูปซ้าย) */}
          <div className={styles.itemRow}>
            <div className={styles.thumbBox}>
              <Image src="/special.png" alt="special" width={120} height={120} className={styles.thumb} />
            </div>
            <div className={styles.itemMeta}>
              <div className={styles.itemName}>
                {order.productName || 'Special Order'} {order.color ? `(${order.color})` : ''}
              </div>
              <div className={styles.itemSub}>
                {sizeLabel ? <>Size: {sizeLabel} • </> : null}x{qty}
              </div>
              {notes && <div className={styles.itemNote}>หมายเหตุ: {notes}</div>}
            </div>
            <div className={styles.itemPrice}>
              {unitPrice ? `฿${nf(unitPrice)}` : <span className={styles.muted}>รอใส่ราคา</span>}
            </div>
          </div>

          {/* เว้นวรรค + ข้อมูลการจัดส่ง */}
          <h3 className={styles.sectionTitleSpaced}>ข้อมูลการจัดส่ง</h3>
          <div className={styles.trackingRow}>
            <div className={styles.trackingLabel}>หมายเลขติดตามพัสดุ</div>
            <div className={styles.trackingValue}>{order.trackingId || '-'}</div>
          </div>

          {/* เว้นวรรค + ผู้สั่งซื้อ */}
          <h3 className={styles.sectionTitleSpaced}>ข้อมูลผู้สั่งซื้อ</h3>
          <div className={styles.recipientCard}>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ชื่อผู้รับ</div>
                <div className={styles.recValue}>{name}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                <div className={styles.recValue}>{phone}</div>
              </div>
            </div>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>อีเมล</div>
                <div className={styles.recValue}>{email}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                <div className={styles.recValue}>{address}</div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────
              การดำเนินการ: ยกเลิก / คืนสินค้า
              ──────────────────────────────────────────── */}
          <h3 className={styles.sectionTitleSpaced}>การดำเนินการกับคำสั่งซื้อ</h3>

          {/* กล่องยกเลิกคำสั่งซื้อ */}
          <div className={styles.actionCard}>
            <div className={styles.actionHeader}>
              <div className={styles.actionTitle}>ยกเลิกคำสั่งซื้อ</div>
              <span className={`${styles.pill} ${canCancelUI ? styles.pillWarn : styles.pillDisabled}`}>
                {canCancelUI ? 'พร้อมดำเนินการ' : 'ไม่สามารถยกเลิกได้'}
              </span>
            </div>
            <div className={styles.actionBody}>
              <div className={styles.hint}>
                เงื่อนไขโดยสรุป: ต้องเป็นออเดอร์ที่ชำระเงินแล้ว, ยังไม่จัดส่ง และอยู่ในช่วงเวลาอนุญาต (ไม่เกิน 3 วันหลังชำระเงิน)*
              </div>
              <textarea
                className={styles.textarea}
                placeholder="ระบุเหตุผล (ไม่บังคับ)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={!canCancelUI || canceling}
              />
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={handleCancel}
                disabled={!canCancelUI || canceling}
              >
                {canceling ? 'กำลังดำเนินการ…' : 'ยกเลิกคำสั่งซื้อและขอคืนเงิน'}
              </button>
              {cancelMsg && <div className={styles.resultMsg}>{cancelMsg}</div>}
            </div>
          </div>

          {/* กล่องคืนสินค้า */}
          <div className={styles.actionCard}>
            <div className={styles.actionHeader}>
              <div className={styles.actionTitle}>ส่งคำขอคืนสินค้า</div>
              <span className={`${styles.pill} ${canReturnUI ? styles.pillInfo : styles.pillDisabled}`}>
                {canReturnUI ? 'พร้อมดำเนินการ' : 'คืนได้เมื่อจัดส่งสำเร็จ'}
              </span>
            </div>
            <div className={styles.actionBody}>
              <div className={styles.hint}>
                เงื่อนไขโดยสรุป: ออเดอร์ต้อง “จัดส่งสินค้าสำเร็จแล้ว” และภายใน 3 วัน พร้อมแนบรูปความเสียหาย/ปัญหา 1–5 รูป*
              </div>
              <input
                type="file"
                className={styles.fileInput}
                accept="image/*"
                multiple
                onChange={(e) => setReturnFiles(e.target.files)}
                disabled={!canReturnUI || returning}
              />
              <textarea
                className={styles.textarea}
                placeholder="ระบุเหตุผล (อธิบายปัญหา/สภาพสินค้า)"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                disabled={!canReturnUI || returning}
              />
              <button
                className={styles.btn}
                onClick={handleReturn}
                disabled={!canReturnUI || returning}
              >
                {returning ? 'กำลังส่งคำขอ…' : 'ส่งคำขอคืนสินค้า'}
              </button>
              {returnMsg && <div className={styles.resultMsg}>{returnMsg}</div>}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnGhost} onClick={() => router.back()}>ย้อนกลับ</button>
          </div>
        </div>
      </div>
    </>
  );
}
