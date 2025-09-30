// src/app/(website)/Special-admin-id/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import NavbarAdmin from '../../components/NavbarAdmin';
import styles from './Special-admin-id.module.css';

type AllowedStatus =
  | 'ยกเลิก'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการจัดเตรียมสินค้า'
  | 'กำลังดำเนินการจัดส่งสินค้า'
  | 'จัดส่งสินค้าสำเร็จเเล้ว';

type SpecialOrder = {
  id: string | number;
  status?: string | null;
  createdAt?: string | null;
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

  paymentUrl?: string | null;
};

const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n || 0); }
  catch { return String(n); }
};

// แตก sizeDetail => sizeLabel / notes
function parseSizeDetail(s?: string | null) {
  const raw = (s ?? '').trim();
  if (!raw) return { sizeLabel: '', notes: '' };
  let sizeLabel = '';
  let notes = '';
  raw.split('|').map((x) => x.trim()).forEach((part) => {
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

// map สถานะจาก BE ให้เป็นหนึ่งใน allowed (กัน error 400)
const normalizeStatus = (s?: string | null): AllowedStatus => {
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

export default function SpecialAdminDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<SpecialOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ใส่ราคา & ออกลิงก์ชำระ
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [creatingPayLink, setCreatingPayLink] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  // อัปเดตสถานะ (ผ่าน PATCH /special-orders/[id] รองรับเฉพาะ status)
  const [status, setStatus] = useState<AllowedStatus>('รอดำเนินการ');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setErr(null);
        // BE /[id] ส่ง object เดี่ยว
        const res = await fetch(`/api/special-orders/${id}`, { cache: 'no-store' });
        const data: SpecialOrder = await res.json();
        if (!res.ok) throw new Error((data as any)?.error || 'โหลดข้อมูลไม่สำเร็จ');

        if (!ignore) {
          setOrder(data);
          setUnitPrice(typeof data.price === 'number' ? String(data.price) : '');
          setStatus(normalizeStatus(data.status));
          setPaymentLink((data as any)?.paymentUrl ?? null);
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
  const qty = Number(order?.quantity || 0);
  const total = unitPrice ? Number(unitPrice || 0) * qty : 0;

  // ===== 1) ใส่ราคา + สร้างลิงก์ชำระเงิน (PUT /api/special-orders) =====
  async function createPaymentLink() {
    if (!order?.id) return;
    const p = parseFloat(unitPrice);
    if (!Number.isFinite(p) || p <= 0) {
      alert('กรุณากรอกราคาต่อหน่วยให้ถูกต้อง');
      return;
    }
    try {
      setCreatingPayLink(true);
      const res = await fetch(`/api/special-orders`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, price: p }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'สร้างลิงก์ชำระเงินไม่สำเร็จ');

      const url = data?.order?.paymentUrl || data?.paymentUrl || data?.session?.url || null;
      setPaymentLink(url);
      alert('✅ บันทึกราคาและออกลิงก์ชำระเงินเรียบร้อย');
    } catch (e: any) {
      alert(e?.message || 'ไม่สามารถสร้างลิงก์ชำระเงินได้');
    } finally {
      setCreatingPayLink(false);
    }
  }

  // ===== 2) อัปเดตสถานะ (PATCH /api/special-orders/[id] { status }) =====
  async function updateStatus() {
    if (!order?.id) return;
    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/special-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'อัปเดตสถานะไม่สำเร็จ');
      alert('✅ อัปเดตสถานะเรียบร้อย');
    } catch (e: any) {
      alert(e?.message || 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setUpdatingStatus(false);
    }
  }

  // ฟอลแบ็กข้อมูลผู้รับ (ตามที่ผู้ใช้ขอให้แสดงชุดนี้)
  const customerName =
    order?.user?.name ||
    [order?.firstName, order?.lastName].filter(Boolean).join(' ') ||
    'yodsapad Suntawong';
  const customerPhone = order?.user?.phone || order?.phone || '0884567452';
  const customerEmail = order?.user?.email || order?.email || 'yodsapad2547@gmail.com';
  const customerAddress = order?.user?.address || order?.address || 'ที่อยู่1111111';

  if (loading) return <div className={styles.page}>⏳ กำลังโหลด...</div>;
  if (err || !order) return <div className={styles.page}>❌ {err || 'ไม่พบคำสั่งซื้อ'}</div>;

  return (
    <>
      <NavbarAdmin />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>จัดการออเดอร์พิเศษ (แอดมิน) – ตรวจสอบ/ใส่ราคา</h1>

          {/* ข้อมูลหลัก */}
          <div className={styles.infoGrid}>
            <div>หมายเลขออเดอร์:</div>
            <div><b>ORD-{order.id}</b></div>

            <div>วันที่สั่งซื้อ:</div>
            <div>{order.createdAtThai ?? order.createdAt ?? '-'}</div>

            <div>สถานะปัจจุบัน:</div>
            <div><span className={styles.badge}>{order.status || '-'}</span></div>

            <div>Tracking ID:</div>
            <div>{order.trackingId || '-'}</div>
          </div>

          {/* ข้อมูลลูกค้า (โชว์ใต้ Tracking ID ตามที่ขอ) */}
          <h3 className={styles.sectionTitle}>ข้อมูลลูกค้า</h3>
          <div className={styles.recipientCard}>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ชื่อผู้รับ</div>
                <div className={styles.recValue}>{customerName}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>เบอร์ติดต่อ</div>
                <div className={styles.recValue}>{customerPhone}</div>
              </div>
            </div>
            <div className={styles.recRow}>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>อีเมล</div>
                <div className={styles.recValue}>{customerEmail}</div>
              </div>
              <div className={styles.recCol}>
                <div className={styles.recLabel}>ที่อยู่จัดส่ง</div>
                <div className={styles.recValue}>{customerAddress}</div>
              </div>
            </div>
          </div>

          {/* รายละเอียดสินค้า + ระบุราคา */}
          <h3 className={styles.sectionTitle}>รายละเอียดสินค้า</h3>
          <div className={styles.itemRow}>
            <Image src="/special.png" alt="special" width={120} height={120} className={styles.thumb} />
            <div className={styles.itemMeta}>
              <div className={styles.itemName}>
                {order.productName || 'Special Order'} {order.color ? `(${order.color})` : ''}
              </div>
              <div className={styles.itemSub}>
                {sizeLabel ? `Size: ${sizeLabel} • ` : ''}x{qty}
              </div>
              {notes && <div className={styles.itemNote}>หมายเหตุ: {notes}</div>}
            </div>

            <div className={styles.itemPrice}>
              <input
                type="number"
                className={styles.priceInput}
                placeholder="ราคาต่อหน่วย (THB)"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <div className={styles.totalSmall}>รวม: ฿{nf(total)}</div>
              <button
                className={styles.btnPrimary}
                onClick={createPaymentLink}
                disabled={creatingPayLink}
                title="บันทึกราคาและส่งลิงก์ชำระเงินให้ลูกค้า"
              >
                {creatingPayLink ? 'กำลังสร้างลิงก์…' : '💳 ใส่ราคา & ออกลิงก์ชำระเงิน'}
              </button>
              {paymentLink && (
                <a className={styles.linkBtn} href={paymentLink} target="_blank" rel="noreferrer">
                  เปิดลิงก์ชำระเงิน
                </a>
              )}
            </div>
          </div>

          {/* อัปเดตสถานะคำสั่งซื้อ (PATCH /[id]) */}
          <h3 className={styles.sectionTitle}>อัปเดตสถานะ (แอดมิน)</h3>
          <div className={styles.statusRow}>
            <select
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as AllowedStatus)}
            >
              <option value="รอดำเนินการ">รอดำเนินการ</option>
              <option value="กำลังดำเนินการจัดเตรียมสินค้า">กำลังดำเนินการจัดเตรียมสินค้า</option>
              <option value="กำลังดำเนินการจัดส่งสินค้า">กำลังดำเนินการจัดส่งสินค้า</option>
              <option value="จัดส่งสินค้าสำเร็จเเล้ว">จัดส่งสินค้าสำเร็จเเล้ว</option>
              <option value="ยกเลิก">ยกเลิก</option>
            </select>
            <button
              className={styles.btnGhost}
              onClick={updateStatus}
              disabled={updatingStatus}
              title="อัปเดตสถานะคำสั่งซื้อ"
            >
              {updatingStatus ? 'กำลังอัปเดต…' : 'อัปเดตสถานะ'}
            </button>
          </div>

          <div className={styles.actions}>
            <button onClick={() => router.back()} className={styles.btnOutline}>ย้อนกลับ</button>
          </div>
        </div>
      </div>
    </>
  );
}
