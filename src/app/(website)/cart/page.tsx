'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './cart.module.css';
import Navbar from '../components/Navbar';
import CartItem from '../components/CartItem';
import { useRouter } from 'next/navigation';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

type ApiCartItem = {
  id: string;
  userId: string;
  productId: string;
  size: SizeKey;
  quantity: number;
  unitPrice?: number;      // server เติมให้ใน GET/POST/PATCH
  totalPrice?: number;     // server เติมให้ใน GET/POST/PATCH
  availableStock?: number; // server เติมให้ใน GET
  product?: {
    id: string;
    name: string;
    imageUrls?: string[];
    // price / stock ฝั่ง API มีเก็บไว้ แต่เราไม่ได้ใช้ที่นี่โดยตรง
  };
};

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<ApiCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null); // สำหรับ disable ปุ่ม item นั้นๆ
  const [err, setErr] = useState<string | null>(null);

  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  const fetchCart = async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/cart?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) {
        try { const j = JSON.parse(text); if (j?.error) throw new Error(j.error); } catch {}
        throw new Error(text || `โหลดตะกร้าล้มเหลว (HTTP ${res.status})`);
      }
      const list = text ? (JSON.parse(text) as ApiCartItem[]) : [];
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดตะกร้าล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, it) => {
        const unit = typeof it.unitPrice === 'number' ? it.unitPrice : 0;
        return sum + unit * (it.quantity ?? 0);
      }, 0),
    [items]
  );

  // Helpers
  const keyOf = (it: ApiCartItem) => `${it.productId}:${it.size}`;

  const handleInc = async (it: ApiCartItem) => {
    const k = keyOf(it);
    setBusyKey(k);
    try {
      const nextQty = (it.quantity ?? 0) + 1;
      const res = await fetch('/api/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          productId: it.productId,
          size: it.size,
          quantity: nextQty,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        try { const j = JSON.parse(text); if (j?.error) throw new Error(j.error); } catch {}
        throw new Error(text || `อัปเดตจำนวนล้มเหลว (HTTP ${res.status})`);
      }
      setItems(prev =>
        prev.map(x =>
          keyOf(x) === k
            ? { ...x, quantity: nextQty, totalPrice: (x.unitPrice ?? 0) * nextQty }
            : x
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตจำนวนไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDec = async (it: ApiCartItem) => {
    if (it.quantity <= 1) return;
    const k = keyOf(it);
    setBusyKey(k);
    try {
      const nextQty = (it.quantity ?? 0) - 1;
      const res = await fetch('/api/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          productId: it.productId,
          size: it.size,
          quantity: nextQty,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        try { const j = JSON.parse(text); if (j?.error) throw new Error(j.error); } catch {}
        throw new Error(text || `อัปเดตจำนวนล้มเหลว (HTTP ${res.status})`);
      }
      setItems(prev =>
        prev.map(x =>
          keyOf(x) === k
            ? { ...x, quantity: nextQty, totalPrice: (x.unitPrice ?? 0) * nextQty }
            : x
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'อัปเดตจำนวนไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (it: ApiCartItem) => {
    const k = keyOf(it);
    setBusyKey(k);
    try {
      const res = await fetch('/api/cart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          productId: it.productId,
          size: it.size,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        try { const j = JSON.parse(text); if (j?.error) throw new Error(j.error); } catch {}
        throw new Error(text || `ลบสินค้าไม่สำเร็จ (HTTP ${res.status})`);
      }
      setItems(prev => prev.filter(x => keyOf(x) !== k));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ลบสินค้าไม่สำเร็จ');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.cartSection}>
          <div className={styles.header}>
            <div className={styles.columnProduct}>สินค้า</div>
            <div className={styles.columnPrice}>ราคา</div>
            <div className={styles.columnQty}>จำนวน</div>
          </div>

          {loading && <div style={{ padding: 20 }}>กำลังโหลดตะกร้า…</div>}
          {err && !loading && (
            <div style={{ padding: 20, color: '#c00' }}>
              ❌ {err}{' '}
              <button
                onClick={fetchCart}
                style={{ marginLeft: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc' }}
              >
                ลองใหม่
              </button>
            </div>
          )}

          {!loading && !err && items.length === 0 && (
            <div style={{ padding: 20 }}>ตะกร้ายังว่างเปล่า</div>
          )}

          {!loading &&
            !err &&
            items.map((it) => {
              const img = it.product?.imageUrls?.[0] ?? '/placeholder.png';
              const name = it.product?.name ?? 'สินค้าของฉัน';
              const price = typeof it.unitPrice === 'number' ? it.unitPrice : 0;
              const disabled = busyKey === keyOf(it);

              return (
                <CartItem
                  key={keyOf(it)}
                  name={name}
                  size={it.size}
                  code={it.product?.id ?? it.productId}
                  price={price}
                  quantity={it.quantity}
                  image={img}
                  color={'-'}
                  stockLeft={it.availableStock}  
                  onInc={() => handleInc(it)}
                  onDec={() => handleDec(it)}
                  onRemove={() => handleRemove(it)}
                  disabled={disabled}
                />
              );
            })}
        </div>

        <div className={styles.summary}>
          <h3>สรุปคำสั่งซื้อ</h3>

          <div className={styles.summaryRow}>
            <span>ยอดรวม</span>
            <span>{subtotal.toFixed(2)}฿</span>
          </div>

          <div className={styles.summaryRow}>
            <span>รวมทั้งหมด</span>
            <span>{subtotal.toFixed(2)}฿</span>
          </div>

          <button
            className={styles.checkout}
            disabled={items.length === 0}
            onClick={() => router.push('/Order-details')}
          >
            ดำเนินการชำระเงิน
          </button>
          <button className={styles.continue} onClick={() => router.push('/')}>
            เลือกซื้อสินค้าต่อ
          </button>
        </div>
      </div>
    </>
  );
}
