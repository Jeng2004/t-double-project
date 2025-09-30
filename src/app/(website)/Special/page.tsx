// src/app/(website)/Special/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import styles from './Special.module.css';
import type { Product as DBProduct, SizeKey } from '@/types/product';
import { useRouter } from 'next/navigation';

export default function SpecialPage() {
  const router = useRouter();
  const [items, setItems] = useState<DBProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: DBProduct[] = await res.json();
        setItems(data);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // กรองเฉพาะ category = "Special" (ไม่สนตัวพิมพ์เล็กใหญ่)
  const specialItems = useMemo(() => {
    const norm = (v?: string | null) => (v || '').trim().toLowerCase();
    return items.filter(p => norm(p.category) === 'special');
  }, [items]);

  const sizeOrder: SizeKey[] = ['S', 'M', 'L', 'XL'];

  return (
    <>
      <Navbar />

      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>สินค้า Special</h1>

          {loading && <div className={styles.infoText}>กำลังโหลดสินค้า...</div>}
          {err && <div className={styles.errText}>❌ {err}</div>}

          {!loading && !err && (
            <>
              {specialItems.length === 0 ? (
                <div className={styles.infoText}>ยังไม่มีสินค้า Special</div>
              ) : (
                <div className={styles.grid}>
                  {specialItems.map((p) => {
                    const totalStock =
                      (p.stock?.S ?? 0) +
                      (p.stock?.M ?? 0) +
                      (p.stock?.L ?? 0) +
                      (p.stock?.XL ?? 0);
                    const isOut = totalStock <= 0;

                    return (
                      <div
                        key={p.id}
                        className={styles.card}
                        onClick={() => router.push(`/product/${p.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') router.push(`/product/${p.id}`);
                        }}
                      >
                        <div className={styles.name}>{p.name}</div>

                        {isOut ? (
                          <div className={styles.outOfStock}>สินค้าหมดแล้ว</div>
                        ) : (
                          <div className={styles.sizes}>
                            {sizeOrder.map((s) => {
                              const left = p.stock?.[s] ?? 0;
                              return (
                                <span
                                  key={s}
                                  className={left > 0 ? styles.size : styles.sizeOut}
                                  title={left > 0 ? `มีไซส์ ${s}` : `ไซส์ ${s} หมด`}
                                >
                                  {s}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
