// src/app/(website)/payment/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './payment.module.css';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import { getUserIdForFrontend } from '@/lib/get-user-id';
import { useRouter, useSearchParams } from 'next/navigation';

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

type BuyNowItem = {
  productId: string;
  size: SizeKey;
  quantity: number;
  price: number;
  unitPrice: number;
  totalPrice: number;
  productName?: string;
  image?: string;
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

// วิธีชำระเงิน
type PayMethod = 'stripe' | 'manual';

// กัน HTML error
async function readJsonSafe(res: Response) {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return JSON.parse(text); } catch {}
  }
  throw new Error(text || `HTTP ${res.status}`);
}

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 👇 helper กัน searchParams เป็น null
  const getParam = (key: string): string | null => {
    // ใน client เสมอ แต่กันไว้เผื่อ type
    return searchParams?.get(key) ?? null;
  };

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
  const [payMethod, setPayMethod] = useState<PayMethod>('stripe');
  const loadedRef = useRef(false);

  // ซื้อเลย
  const [buyNowItems, setBuyNowItems] = useState<BuyNowItem[] | null>(null);

  // Modal ยืนยัน
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // เปิด/ปิด modal ด้วยคีย์บอร์ด
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowConfirm(false);
    }
    if (showConfirm) {
      document.addEventListener('keydown', onKey);
      setTimeout(() => confirmBtnRef.current?.focus(), 0);
    }
    return () => document.removeEventListener('keydown', onKey);
  }, [showConfirm]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const userId = getUserIdForFrontend();
    if (!userId) {
      setCartLoading(false);
      setCartErr('ไม่พบ userId กรุณาเข้าสู่ระบบ');
      return;
    }

    const loadUser = async () => {
      try {
        const res = await fetch(`/api/users`, { cache: 'no-store' });
        if (!res.ok) return;
        const dataUnknown: unknown = await res.json();
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
      } catch { /* ignore */ }
    };

    const mode = getParam('mode');

    if (mode === 'buy-now') {
      try {
        const raw = sessionStorage.getItem('buy-now-items');
        const parsed = raw ? (JSON.parse(raw) as BuyNowItem[]) : null;
        setBuyNowItems(parsed && parsed.length > 0 ? parsed : null);
      } catch {
        setBuyNowItems(null);
      }
    }

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
    if (mode === 'buy-now') {
      setCartLoading(false);
    } else {
      loadCart();
    }
  }, [searchParams]); // ok ที่จะใส่ searchParams เป็น dep ใน client

  const grandTotal = useMemo(() => {
    if (buyNowItems && buyNowItems.length > 0) {
      return buyNowItems.reduce((s, it) => s + (Number.isFinite(it.totalPrice) ? it.totalPrice : 0), 0);
    }
    return cart.reduce((sum, it) => sum + (Number.isFinite(it.totalPrice) ? it.totalPrice : 0), 0);
  }, [buyNowItems, cart]);

  const isEmpty =
    (buyNowItems && buyNowItems.length === 0) ||
    (!buyNowItems && cart.length === 0);

  // กด submit ครั้งแรก → แสดง modal (ยังไม่สร้างออเดอร์)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (isEmpty) {
      alert('ตะกร้าของคุณว่างเปล่า');
      return;
    }
    setShowConfirm(true);
  };

  // ยืนยัน → สร้างออเดอร์ + ขอ Stripe + redirect
  const proceedPayment = async () => {
    try {
      setCreating(true);
      const userId = getUserIdForFrontend();
      if (!userId) throw new Error('❌ ไม่พบ userId, กรุณา login ก่อน');

      const mode = getParam('mode'); // 👈 ใช้ helper เดิม

      const baseCustomer = {
        name: `${fname} ${lname}`.trim(),
        phone,
        address: `${address} ${addressDetail}`.trim(),
        email,
      };

      const baseBody = { userId, ...baseCustomer };
      const bodyToSend =
        mode === 'buy-now' && buyNowItems && buyNowItems.length > 0
          ? { ...baseBody, items: buyNowItems }
          : baseBody;

      // 1) สร้างออเดอร์
      const res1 = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bodyToSend),
      });
      const data1 = await (async () => { try { return await readJsonSafe(res1); } catch (err) { throw err; } })();
      if (!res1.ok) throw new Error(data1?.error || 'สร้างคำสั่งซื้อไม่สำเร็จ');

      const orderId = data1?.order?.id as string | undefined;
      if (!orderId) throw new Error('❌ ไม่พบ orderId');

      if (payMethod === 'stripe') {
        // 2) ขอ Stripe session
        const res2 = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const data2 = await (async () => { try { return await readJsonSafe(res2); } catch (err) { throw err; } })();
        if (!res2.ok || !data2?.url) throw new Error(data2?.error || 'ไม่พบ URL ชำระเงิน');

        sessionStorage.setItem('pending-order-id', orderId);
        if (mode === 'buy-now') sessionStorage.removeItem('buy-now-items');

        window.location.href = data2.url;
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
      alert(msg);
    } finally {
      setCreating(false);
      setShowConfirm(false);
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

          {/* วิธีชำระเงิน */}
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

          <h3>รายการสั่งซื้อ</h3>

          {cartLoading ? (
            <div style={{ marginBottom: 12 }}>กำลังโหลดตะกร้า…</div>
          ) : cartErr ? (
            <div style={{ color: '#c00', marginBottom: 12 }}>❌ {cartErr}</div>
          ) : buyNowItems && buyNowItems.length > 0 ? (
            <>
              {buyNowItems.map((it, idx) => (
                <div className={styles.orderSummary} key={`${it.productId}:${it.size}:${idx}`}>
                  <Image
                    src={it.image || '/placeholder.png'}
                    alt={it.productName || 'product'}
                    width={80}
                    height={80}
                  />
                  <div>
                    <div className={styles.productName}>{it.productName ?? '-'}</div>
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

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={creating || Boolean((buyNowItems && buyNowItems.length === 0) || (!buyNowItems && cart.length === 0))}
          >
            {creating ? 'กำลังไปหน้าชำระเงิน…' : 'ดำเนินการชำระเงิน'}
          </button>
        </form>
      </div>

      {/* Modal ยืนยัน (เด้งกลางจอ) */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => setShowConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              padding: 20,
            }}
          >
            <h3 id="confirm-title" style={{ margin: 0, fontSize: 18 }}>ยืนยันไปหน้าชำระเงิน</h3>
            <p style={{ margin: '12px 0 16px', color: '#444' }}>
              ระบบจะพาคุณไปหน้า Stripe เพื่อชำระเงินตอนนี้
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={creating}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #bbb',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                ref={confirmBtnRef}
                onClick={proceedPayment}
                disabled={creating}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#111',
                  color: '#fff',
                }}
              >
                {creating ? 'กำลังดำเนินการ…' : 'ยืนยันชำระเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
