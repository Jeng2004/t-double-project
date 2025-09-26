'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './stock.module.css';
import type { UIProduct, SizeKey, StockBySize, PriceBySize } from '@/types/product';

interface StockProps {
  onDeleted?: (id: string) => void;
  onEditClick?: (product: UIProduct) => void;
}

const sizeOrder: SizeKey[] = ['S', 'M', 'L', 'XL'];

const toNum = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

function coerceStock(u?: unknown): StockBySize {
  const src = (u ?? {}) as Record<string, unknown>;
  return { S: toNum(src.S), M: toNum(src.M), L: toNum(src.L), XL: toNum(src.XL) };
}
function coercePrice(u?: unknown): PriceBySize {
  const src = (u ?? {}) as Record<string, unknown>;
  return { S: toNum(src.S), M: toNum(src.M), L: toNum(src.L), XL: toNum(src.XL) };
}

/** แปลง raw product → UIProduct */
function toUI(pRaw: unknown): UIProduct {
  const p = (pRaw ?? {}) as Record<string, unknown>;

  const rawCategory =
    (p.category as string | undefined) ??
    (p.Category as string | undefined) ??
    (p.cat as string | undefined) ??
    null;

  const imageUrls =
    Array.isArray(p.imageUrls) && (p.imageUrls as unknown[]).every((x) => typeof x === 'string')
      ? (p.imageUrls as string[])
      : ['/placeholder.png'];

  return {
    id: String(p.id ?? p._id ?? ''),
    name: String(p.name ?? ''),
    description: (p.description as string | null | undefined) ?? null,
    category: rawCategory && String(rawCategory).trim() ? String(rawCategory).trim() : null,
    imageUrls,
    price: coercePrice(p.price),
    stock: coerceStock(p.stock),
  };
}

const toSizeRange = (stock?: StockBySize) => {
  if (!stock) return '-';
  const avail = sizeOrder.filter((s) => toNum(stock[s]) > 0);
  if (avail.length === 0) return '-';
  return avail.length === 1 ? avail[0] : `${avail[0]}–${avail[avail.length - 1]}`;
};

export default function Stock({ onDeleted }: StockProps) {
  const router = useRouter();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [q, setQ] = useState<string>(''); // ← ช่องค้นหา

  // เก็บ index ของภาพปัจจุบันของแต่ละ productId
  const [currentImageIndexes, setCurrentImageIndexes] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();

        const rows = Array.isArray(data) ? data : [];
        const ui = rows.map(toUI);
        setProducts(ui);

        const init: Record<string, number> = {};
        ui.forEach((p) => { init[p.id] = 0; });
        setCurrentImageIndexes(init);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      const c = (p.category ?? '').trim();
      if (c) s.add(c);
    });
    return Array.from(s).sort();
  }, [products]);

  // กรองจากหมวดหมู่ก่อน แล้วค่อยค้นหาแบบคำหลัก
  const filtered = useMemo(() => {
    const base =
      categoryFilter === 'ALL'
        ? products
        : products.filter((p) => (p.category ?? '') === categoryFilter);

    const term = q.trim().toLowerCase();
    if (!term) return base;

    return base.filter((p) => {
      const hay = [
        p.id,
        p.name,
        p.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [products, categoryFilter, q]);

  const handleImageClick = (product: UIProduct) => {
    setCurrentImageIndexes((prev) => {
      const current = prev[product.id] ?? 0;
      const next = (current + 1) % product.imageUrls.length;
      return { ...prev, [product.id]: next };
    });
  };

  if (loading) return <div className={styles.container}>กำลังโหลดสินค้า...</div>;

  return (
    <div className={styles.container}>
      <h2 className={styles.pageTitle}>สินค้าในสต็อก</h2>
      {err && <div style={{ color: '#c00', marginBottom: 10 }}>❌ {err}</div>}

      {/* แถบเครื่องมือ: ค้นหา + กรองหมวดหมู่ + ผลลัพธ์ */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.search}
            placeholder="ค้นหาสินค้า (ชื่อ, รหัส, หมวดหมู่)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className={styles.clearBtn} onClick={() => setQ('')} aria-label="clear">×</button>
          )}
        </div>

        <div className={styles.catWrap}>
          <label htmlFor="cat" className={styles.catLabel}>หมวดหมู่:</label>
          <select
            id="cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={styles.catSelect}
          >
            <option value="ALL">ทั้งหมด</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className={styles.resultInfo}>
          พบ {filtered.length} รายการ
        </div>
      </div>

      {/* Header ตาราง */}
      <div className={styles.tableHeader}>
        <div className={styles.colName}>ชื่อสินค้า</div>
        <div className={styles.colCode}>รหัสสินค้า</div>
        <div className={styles.colCategory}>หมวดหมู่</div>
        <div className={styles.colSizeRange}>จำนวนไซส์</div>
        <div className={styles.colEdit}>จัดการสินค้า</div>
      </div>

      {filtered.map((item) => {
        const index = currentImageIndexes[item.id] ?? 0;
        const thumb = item.imageUrls[index] ?? '/placeholder.png';
        return (
          <div className={styles.card} key={item.id}>
            {/* คอลัมน์ 1: รูป + ชื่อ */}
            <div className={styles.productInfo}>
              <div
                className={styles.imageBox}
                title={item.imageUrls.length > 1 ? 'คลิกเพื่อดูภาพถัดไป' : 'มีเพียงภาพเดียว'}
                onClick={() => handleImageClick(item)}
              >
                <Image
                  src={thumb}
                  alt={item.name || 'product image'}
                  width={140}
                  height={140}
                  className={styles.image}
                />
              </div>
              <p className={styles.name}>{item.name}</p>
            </div>

            {/* คอลัมน์ 2: รหัสสินค้า */}
            <div className={styles.colCodeCell}>{item.id}</div>

            {/* คอลัมน์ 3: หมวดหมู่ */}
            <div className={styles.category}>{item.category ?? '-'}</div>

            {/* คอลัมน์ 4: ช่วงไซส์ */}
            <div className={styles.sizeRange}>{toSizeRange(item.stock)}</div>

            {/* คอลัมน์ 5: ปุ่มแก้ไข */}
            <div className={styles.editCol}>
              <button onClick={() => router.push(`/editstock/${item.id}`)}>แก้ไข</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
