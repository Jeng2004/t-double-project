// C:\Users\yodsa\t-double-project\src\app\(website)\Order-details\page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './Order-details.module.css';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import { getUserIdForFrontend } from '@/lib/get-user-id';

// ---------- Types ----------
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

// ---------- Helpers ----------
const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');

const splitName = (full?: string | null): { fname: string; lname: string } => {
  if (!full) return { fname: '', lname: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { fname: '', lname: '' };
  if (parts.length === 1) return { fname: parts[0], lname: '' };
  return { fname: parts.slice(0, -1).join(' '), lname: parts.at(-1) ?? '' };
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isUserProfile = (u: unknown): u is UserProfile =>
  isRecord(u) &&
  typeof u.id === 'string' &&
  typeof u.email === 'string' &&
  typeof u.name === 'string';

export default function OrderDetailsPage() {
  // ฟอร์มผู้ใช้
  const [email, setEmail] = useState('');
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [phone, setPhone] = useState('');

  // ตะกร้า
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartErr, setCartErr] = useState<string | null>(null);

  // submit order
  const [creating, setCreating] = useState(false);

  // ป้องกัน useEffect dev-mode เรียกซ้ำ
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

    // 1) โหลดโปรไฟล์ทั้งหมดจาก /api/users แล้วกรองเองด้วย userId
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
            // addressDetail เว้นไว้กรอกเอง
          }
        }
      } catch (err) {
        // ไม่ต้องบล็อคหน้า
        console.error('❌ loadUser error:', err);
      }
    };

    // 2) โหลดตะกร้า
    const loadCart = async () => {
      setCartLoading(true);
      setCartErr(null);
      try {
        const res = await fetch(`/api/cart?userId=${encodeURIComponent(userId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status} ${t}`);
        }
        const itemsUnknown = (await res.json()) as unknown;
        if (Array.isArray(itemsUnknown)) {
          // ปล่อยผ่าน (backend คืน type ตรงแล้ว)
          setCart(itemsUnknown as CartItem[]);
        } else {
          setCart([]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'โหลดตะกร้าไม่สำเร็จ';
        setCartErr(msg);
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
          // ไม่ต้องส่ง items → API จะอ่านจากตะกร้าเอง
        }),
      });

      const data = (await res.json()) as { order?: { trackingId: string }; error?: string };
      if (!res.ok) throw new Error(data.error || 'สร้างคำสั่งซื้อไม่สำเร็จ');

      alert(`✅ สร้าง Order สำเร็จ! Tracking ID: ${data.order?.trackingId ?? '-'}`);
      // window.location.href = '/orders';
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
      alert(msg);
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
          />

          <h3>การจัดส่ง</h3>
          <div className={styles.nameRow}>
            <input
              type="text"
              placeholder="ชื่อ"
              className={styles.input}
              value={fname}
              onChange={(e) => setFname(e.target.value)}
            />
            <input
              type="text"
              placeholder="นามสกุล"
              className={styles.input}
              value={lname}
              onChange={(e) => setLname(e.target.value)}
            />
          </div>
          <input
            type="text"
            placeholder="ที่อยู่"
            className={styles.input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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
          />

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
            {creating ? 'กำลังสร้าง Order…' : 'ชำระเงิน'}
          </button>
        </form>
      </div>
    </>
  );
}
