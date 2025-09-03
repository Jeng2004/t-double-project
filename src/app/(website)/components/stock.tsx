'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './stock.module.css';
import type { Product, SizeKey } from '@/types/product';

interface StockProps {
  onDeleted?: (id: string) => void;
}

/** ข้อมูลสำหรับ UI: เติมฟิลด์ที่อาจไม่มีใน Product ให้เป็น optional */
type UIProduct = Product & {
  category?: string;
  imageUrls?: string[];
  stock?: Partial<Record<SizeKey, unknown>>;
  _idx?: number; // index รูปภาพปัจจุบัน
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sizeOrder: SizeKey[] = ['S', 'M', 'L', 'XL'];

const toSizeRange = (stock?: Partial<Record<SizeKey, unknown>>) => {
  if (!stock) return '-';
  const a = sizeOrder.filter((s) => toNum(stock[s]) > 0);
  if (a.length === 0) return '-';
  return a.length === 1 ? a[0] : `${a[0]}–${a[a.length - 1]}`;
};

export default function Stock({ onDeleted }: StockProps) {
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as unknown;

        // ป้องกัน runtime: รับเฉพาะ array แล้ว cast เป็น UIProduct[]
        setProducts(Array.isArray(data) ? (data as UIProduct[]) : []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const advanceImage = (id: string, len: number) => {
    if (len <= 1) return;
    setProducts((prev) =>
      prev.map((p) =>
        String(p.id) === id ? { ...p, _idx: ((p._idx ?? 0) + 1) % len } : p,
      ),
    );
  };

  if (loading) return <div className={styles.container}>กำลังโหลดสินค้า...</div>;

  return (
    <div className={styles.container}>
      <h2 className={styles.pageTitle}>สินค้าในสต็อก</h2>
      {err && <div style={{ color: '#c00', marginBottom: 10 }}>❌ {err}</div>}

      {/* Header: ชื่อสินค้า | หมวดหมู่ | จำนวนไซส์ | จัดการสินค้า */}
      <div className={styles.tableHeader}>
        <div className={styles.colName}>ชื่อสินค้า</div>
        <div className={styles.colCategory}>หมวดหมู่</div>
        <div className={styles.colSizeRange}>จำนวนไซส์</div>
        <div className={styles.colEdit}>จัดการสินค้า</div>
      </div>

      {products.map((item) => {
        const imgs = item.imageUrls && item.imageUrls.length > 0
          ? item.imageUrls
          : ['/placeholder.png'];
        const idx = item._idx ?? 0;
        const thumb = imgs[idx % imgs.length];

        return (
          <div className={styles.card} key={String(item.id)}>
            {/* คอลัมน์ 1: รูป + ชื่อ (คลิกที่รูปเพื่อเปลี่ยนรูป) */}
            <div className={styles.productInfo}>
              <div
                className={styles.imageBox}
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
                  src={thumb}
                  alt={item.name || 'product image'}
                  width={140}
                  height={140}
                  className={styles.image}
                  draggable={false}
                />
              </div>
              <p className={styles.name}>{item.name}</p>
            </div>

            {/* คอลัมน์ 2: หมวดหมู่ */}
            <div className={styles.category}>{item.category ?? '-'}</div>

            {/* คอลัมน์ 3: จำนวนไซส์ */}
            <div className={styles.sizeRange}>{toSizeRange(item.stock)}</div>

            {/* คอลัมน์ 4: จัดการสินค้า */}
            <div className={styles.editCol}>
              <button onClick={() => router.push(`/editstock/${item.id}`)}>แก้ไข</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
