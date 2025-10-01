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
  price?: number | null;
  sizeDetail?: string | null;

  user?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;

  paymentUrl?: string | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const nf = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n || 0); }
  catch { return String(n); }
};

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
  // ✅ กัน null จาก useParams
  const params = useParams() as (Readonly<Record<string, string>> | null);
  const id = params?.id ?? '';

  const router = useRouter();

  const [order, setOrder] = useState<SpecialOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ราคา & ชำระเงิน
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [creatingPayLink, setCreatingPayLink] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  // อัปเดตสถานะ
  const [status, setStatus] = useState<AllowedStatus>('รอดำเนินการ');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/special-orders/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const raw: unknown = await res.json();

        if (!res.ok) {
          const msg =
            isRecord(raw) && typeof raw.error === 'string'
              ? raw.error
              : 'โหลดข้อมูลไม่สำเร็จ';
          throw new Error(msg);
        }

        const data = raw as SpecialOrder;

        if (!ignore) {
          setOrder(data);
          setUnitPrice(typeof data.price === 'number' ? String(data.price) : '');
          setStatus(normalizeStatus(data.status));
          setPaymentLink(typeof data.paymentUrl === 'string' ? data.paymentUrl : null);
        }
      } catch (e: unknown) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [id]);

  const { sizeLabel, notes } = useMemo(() => parseSizeDetail(order?.sizeDetail), [order?.sizeDetail]);
  const qty = Number(order?.quantity || 0);
  const total = unitPrice ? Number(unitPrice || 0) * qty : 0;

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
      const raw: unknown = await res.json();
      if (!res.ok) {
        const msg =
          isRecord(raw) && typeof raw.error === 'string'
            ? raw.error
            : 'สร้างลิงก์ชำระเงินไม่สำเร็จ';
        throw new Error(msg);
      }

      let url: string | null = null;
      if (isRecord(raw) && typeof raw.paymentUrl === 'string') {
        url = raw.paymentUrl;
      } else if (isRecord(raw) && isRecord(raw.order) && typeof raw.order.paymentUrl === 'string') {
        url = raw.order.paymentUrl;
      } else if (isRecord(raw) && isRecord(raw.session) && typeof raw.session.url === 'string') {
        url = raw.session.url;
      }
      setPaymentLink(url);
      alert('✅ บันทึกราคาและออกลิงก์ชำระเงินเรียบร้อย');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'ไม่สามารถสร้างลิงก์ชำระเงินได้');
    } finally {
      setCreatingPayLink(false);
    }
  }

  async function updateStatus() {
    if (!order?.id) return;
    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/special-orders/${encodeURIComponent(String(order.id))}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const raw: unknown = await res.json();
      if (!res.ok) {
        const msg =
          isRecord(raw) && typeof raw.error === 'string'
            ? raw.error
            : 'อัปเดตสถานะไม่สำเร็จ';
        throw new Error(msg);
      }
      alert('✅ อัปเดตสถานะเรียบร้อย');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setUpdatingStatus(false);
    }
  }

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
