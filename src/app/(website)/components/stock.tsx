'use client';

import { useEffect, useState } from 'react';
import styles from './stock.module.css';
import Image from 'next/image';
import type { Product, SizeKey } from '@/types/product';

interface StockProps {
  onEditClick: (product: Product) => void;
  onDeleted?: (id: string) => void;
}

/** ขยาย Product เพื่อเก็บ index รูปชั่วคราว */
interface ProductWithIdx extends Product {
  _idx?: number;
}

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

/** แปลง unknown -> number แบบปลอดภัย (เฉพาะ finite) */
const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// ราคาเริ่ม (min)
const getDisplayPrice = (price: unknown): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;

  if (price && typeof price === 'object') {
    const rec = price as Record<string, unknown>;
    const nums = (['S', 'M', 'L', 'XL'] as const)
      .map((k) => toFiniteNumber(rec[k]))
      .filter((v): v is number => v !== null);
    if (nums.length) return Math.min(...nums);
  }
  return null;
};

// ราคาแยกตามไซส์
const getPriceForSize = (price: unknown, size: SizeKey): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (price && typeof price === 'object') {
    const rec = price as Record<string, unknown>;
    return toFiniteNumber(rec[size]);
  }
  return null;
};

export default function Stock({ onEditClick, onDeleted }: StockProps) {
  const [products, setProducts] = useState<ProductWithIdx[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status} ${text || ''}`.trim());
        }
        const data = (await res.json()) as unknown;
        setProducts(Array.isArray(data) ? (data as ProductWithIdx[]) : []);
      } catch (e: unknown) {
        setErrMsg(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const advanceImage = (productId: string, len: number) => {
    if (!len || len <= 1) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, _idx: ((p._idx ?? 0) + 1) % len } : p
      )
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบสินค้านี้ถาวรหรือไม่?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`DELETE ${res.status}: ${t}`);
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
      onDeleted?.(id);
    } catch (e: unknown) {
      console.error('❌ ลบสินค้าไม่สำเร็จ', e);
      const msg = e instanceof Error ? e.message : 'ลบสินค้าไม่สำเร็จ';
      alert('ลบสินค้าไม่สำเร็จ: ' + msg);
    }
  };

  if (loading) return <div className={styles.container}>กำลังโหลดสินค้า...</div>;

  return (
    <div className={styles.container}>
      <h2 className={styles.pageTitle}>สินค้าในสต็อก</h2>

      {errMsg && (
        <div style={{ color: '#c00', marginBottom: 12 }}>
          ❌ {errMsg}{' '}
          <button
            onClick={() => location.reload()}
            style={{
              marginLeft: 8,
              background: '#000',
              color: '#fff',
              border: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            ลองโหลดใหม่
          </button>
        </div>
      )}

      {products.length === 0 ? (
        <div>ยังไม่มีสินค้า</div>
      ) : (
        <>
          {/* หัวตาราง 5 คอลัมน์ (ชื่อ | Size | จำนวน | ราคา | จัดการ) */}
          <div className={styles.tableHeader}>
            <div className={styles.colName}>ชื่อ</div>
            <div className={styles.colSize}>Size</div>
            <div className={styles.colQty}>จำนวน</div>
            <div className={styles.colPrice}>ราคา</div>
            <div className={styles.colEdit}>จัดการ</div>
          </div>

          {products.map((item) => {
            const imgs =
              Array.isArray(item.imageUrls) && item.imageUrls.length > 0
                ? item.imageUrls
                : ['/placeholder.png'];
            const idx = item._idx ?? 0;
            const currentImg = imgs[idx % imgs.length];

            const sizeEntries: [SizeKey, number][] = [
              ['S', item.stock?.S ?? 0],
              ['M', item.stock?.M ?? 0],
              ['L', item.stock?.L ?? 0],
              ['XL', item.stock?.XL ?? 0],
            ];

            const displayPrice = getDisplayPrice(item.price);

            return (
              // การ์ดใช้กริด 5 คอลัมน์ให้ตรงกับ header
              <div className={styles.card} key={item.id}>
                {/* คอลัมน์ที่ 1: ชื่อ/รูป */}
                <div className={styles.productInfo}>
                  <div
                    className={styles.imageContainer}
                    onClick={() => advanceImage(String(item.id), imgs.length)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        advanceImage(String(item.id), imgs.length);
                      }
                    }}
                    title={imgs.length > 1 ? 'คลิกรูปเพื่อดูภาพถัดไป' : 'มีเพียงภาพเดียว'}
                  >
                    <Image
                      src={currentImg}
                      alt={item.name || 'product image'}
                      width={200}
                      height={200}
                      className={styles.image}
                      draggable={false}
                    />
                  </div>

                  <div>
                    <p className={styles.name}>{item.name}</p>
                    <p className={styles.price}>
                      {displayPrice !== null ? `ราคาเริ่ม: ${formatNumber(displayPrice)}฿` : 'ราคา: -'}
                    </p>
                  </div>
                </div>

                {/* คอลัมน์ 2–5: ตารางไซส์ 4 คอลัมน์ (Size | จำนวน | ราคา | จัดการ) */}
                <div className={styles.sizeTable}>
                  {sizeEntries.map(([size, qty], idx2) => {
                    const p = getPriceForSize(item.price, size);
                    return (
                      <div className={styles.sizeRow} key={size}>
                        {/* Size */}
                        <div className={styles.size}>{size}</div>
                        {/* จำนวน */}
                        <div className={`${styles.qty} ${qty <= 0 ? styles.outOfStock : ''}`}>
                          {qty <= 0 ? 'หมด' : qty}
                        </div>
                        {/* ราคา */}
                        <div className={styles.priceCol}>
                          {p !== null && p > 0 ? `${formatNumber(p)}฿` : '-'}
                        </div>
                        {/* จัดการ */}
                        {idx2 === 0 ? (
                          <div className={styles.editSingle}>
                            <button onClick={() => onEditClick(item)}>แก้ไขสินค้า</button>
                            <button
                              onClick={() => handleDelete(String(item.id))}
                              className={styles.deleteBtn}
                            >
                              ลบสินค้า
                            </button>
                          </div>
                        ) : (
                          <div /> /* ช่องว่างเพื่อให้ layout คงรูป */
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
