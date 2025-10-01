'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import Navbar2 from '../components/Navbar2';
import Product from '../components/product';
import styles from './sweater.module.css';
import type { Product as DBProduct } from '@/types/product';

type MaybeCateg = { category?: string | null; categoryName?: string | null; categoryTH?: string | null };

function pickCategoryValue(p: DBProduct): string {
  const m = p as unknown as MaybeCateg;
  return (m.category ?? m.categoryName ?? m.categoryTH ?? '').toString();
}
function isSweaterCategory(cate: string) {
  const c = cate.toLowerCase();
  return c.includes('เสื้อแขนยาว') || c.includes('long sleeve') || c.includes('long-sleeve') || c.includes('sweater');
}

export default function SweaterPage() {
  const router = useRouter();
  const [items, setItems] = useState<DBProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: DBProduct[] = await res.json();
        setItems(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () => items.filter((p) => isSweaterCategory(pickCategoryValue(p))),
    [items]
  );

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>เสื้อแขนยาว</h1>

          {loading && <div className={styles.info}>กำลังโหลด…</div>}
          {err && <div className={styles.error}>❌ {err}</div>}

          {!loading && !err && (
            <div className={styles.grid}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>ยังไม่มีสินค้าในหมวดนี้</div>
              ) : (
                filtered.map((p) => {
                  const imageUrl = p.imageUrls?.[0] || '/placeholder.png';
                  return (
                    <Product
                      key={String(p.id)}
                      name={p.name}
                      stock={p.stock}
                      imageUrl={imageUrl}
                      onClick={() => router.push(`/product/${p.id}`)}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
      <Navbar2 />
    </>
  );
}
