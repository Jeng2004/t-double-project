'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './payment.module.css';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

type ProductLite = {
  id: string;
  name: string;
  imageUrls: string[];
  price: Record<SizeKey, number> | number;
  stock: Partial<Record<SizeKey, number>>;
};

type CartItem = {
  id: string;
  userId: string;
  productId: string;
  size: SizeKey;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  availableStock: number;
  product: ProductLite;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
};

const formatNumber = (n: number) => {
  try { return new Intl.NumberFormat('th-TH').format(n); } catch { return String(n); }
};
const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');

const splitName = (full?: string | null): { fname: string; lname: string } => {
  if (!full) return { fname: '', lname: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { fname: '', lname: '' };
  if (parts.length === 1) return { fname: parts[0], lname: '' };
  return { fname: parts.slice(0, -1).join(' '), lname: parts.at(-1) ?? '' };
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isUserProfile = (u: unknown): u is UserProfile =>
  isRecord(u) && typeof u.id === 'string' && typeof u.email === 'string' && typeof u.name === 'string';

// ---------- NEW: วิธีชำระเงิน ----------
type PayMethod = 'stripe' | 'manual';

export default function PaymentPage() {
  const [email, setEmail] = useState('');
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [phone, setPhone] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartErr, setCartErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('stripe'); // ✅ ค่าเริ่มต้นเป็น Stripe
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const userId = getUserIdForFrontend();
    if (!userId) {
      setCartLoading(false);
      setCartErr('ไม่พบ userId กรุณาเข้าสู่ระบบ');
      return;
    }

    // โหลดโปรไฟล์เพื่อเติมฟอร์ม
    const loadUser = async () => {
      try {
        const res = await fetch(`/api/users`, { cache: 'no-store' });
        if (!res.ok) return;
        const dataUnknown = (await res.json()) as unknown;
        if (Array.isArray(dataUnknown)) {
          const matched = dataUnknown.find(
            (row): row is UserProfile => isUserProfile(row) && row.id === userId
          );
          if (matched) {
            setEmail(matched.email ?? '');
            const { fname, lname } = splitName(matched.name);
            setFname(fname);
            setLname(lname);
            setPhone(matched.phone ?? '');
            setAddress(matched.address ?? '');
          }
        }
      } catch (err) {
        console.error('❌ loadUser error:', err);
      }
    };

    // โหลดตะกร้า
    const loadCart = async () => {
      setCartLoading(true);
      setCartErr(null);
      try {
        const res = await fetch(`/api/cart?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
        const itemsUnknown = (await res.json()) as unknown;
        if (Array.isArray(itemsUnknown)) setCart(itemsUnknown as CartItem[]);
        else setCart([]);
      } catch (e) {
        setCartErr(e instanceof Error ? e.message : 'โหลดตะกร้าไม่สำเร็จ');
      } finally {
        setCartLoading(false);
      }
    };

    loadUser();
    loadCart();
  }, []);

  const grandTotal = useMemo(
    () => cart.reduce((sum, it) => sum + (Number.isFinite(it.totalPrice) ? it.totalPrice : 0), 0),
    [cart]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    try {
      setCreating(true);
      const userId = getUserIdForFrontend();
      if (!userId) throw new Error('❌ ไม่พบ userId, กรุณา login ก่อน');

      // 1️⃣ สร้างออเดอร์ก่อน
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          name: `${fname} ${lname}`.trim(),
          phone,
          address: `${address} ${addressDetail}`.trim(),
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างคำสั่งซื้อไม่สำเร็จ');

      const orderId = data?.order?.id;
      if (!orderId) throw new Error('❌ ไม่พบ orderId');

      // 2️⃣ ขอ Stripe Checkout Session โดยส่ง orderId ไป
      const res2 = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data2 = await res2.json();
      if (!res2.ok || !data2?.url) throw new Error(data2.error || '❌ ไม่พบ URL ชำระเงิน');

      // 3️⃣ พา user ไป Stripe Checkout
      window.location.href = data2.url;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCreating(false);
    }
  };


  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h3>ข้อมูลติดต่อ</h3>
          <input
            type="email"
            placeholder="อีเมล"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <h3>การจัดส่ง</h3>
          <div className={styles.nameRow}>
            <input
              type="text"
              placeholder="ชื่อ"
              className={styles.input}
              value={fname}
              onChange={(e) => setFname(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="นามสกุล"
              className={styles.input}
              value={lname}
              onChange={(e) => setLname(e.target.value)}
              required
            />
          </div>
          <input
            type="text"
            placeholder="ที่อยู่"
            className={styles.input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="รายละเอียดเพิ่มเติม"
            className={styles.input}
            value={addressDetail}
            onChange={(e) => setAddressDetail(e.target.value)}
          />
          <input
            type="tel"
            placeholder="โทรศัพท์"
            className={styles.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          {/* ---------- NEW: วิธีชำระเงิน ---------- */}
          <h3>วิธีชำระเงิน</h3>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="pay-method"
              value="stripe"
              checked={payMethod === 'stripe'}
              onChange={() => setPayMethod('stripe')}
            />
            <span>บัตร/PromptPay (Stripe Checkout)</span>
          </label>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="pay-method"
              value="manual"
              checked={payMethod === 'manual'}
              onChange={() => setPayMethod('manual')}
            />
            <span>ชำระภายหลัง (โอน/เก็บเงินปลายทาง) — สถานะจะเป็น “รอชำระเงิน”</span>
          </label>

          <h3>รายการสั่งซื้อ</h3>

          {cartLoading ? (
            <div style={{ marginBottom: 12 }}>กำลังโหลดตะกร้า…</div>
          ) : cartErr ? (
            <div style={{ color: '#c00', marginBottom: 12 }}>❌ {cartErr}</div>
          ) : cart.length === 0 ? (
            <div className={styles.emptyCart}>ตะกร้าของคุณว่างเปล่า</div>
          ) : (
            <>
              {cart.map((it) => (
                <div className={styles.orderSummary} key={it.id}>
                  <Image
                    src={firstImage(it.product?.imageUrls)}
                    alt={it.product?.name ?? 'product'}
                    width={80}
                    height={80}
                  />
                  <div>
                    <div className={styles.productName}>{it.product?.name ?? '-'}</div>
                    <div className={styles.productDetail}>Size: {it.size}</div>
                    <div className={styles.productDetail}>
                      ราคา/ชิ้น: {formatNumber(it.unitPrice)}฿ × {it.quantity}
                    </div>
                  </div>
                  <div className={styles.price}>{formatNumber(it.totalPrice)}฿</div>
                </div>
              ))}

              <div className={styles.totalRow}>
                <span>รวมทั้งหมด</span>
                <strong>{formatNumber(grandTotal)}฿</strong>
              </div>
            </>
          )}

          <button type="submit" className={styles.submitBtn} disabled={creating || cart.length === 0}>
            {creating
              ? (payMethod === 'stripe' ? 'กำลังไปหน้าชำระเงิน…' : 'กำลังสร้างคำสั่งซื้อ…')
              : (payMethod === 'stripe' ? 'ดำเนินการชำระเงิน' : 'สั่งซื้อ (ชำระภายหลัง)')}
          </button>
        </form>
      </div>
    </>
  );
}
