// C:\Users\yodsa\t-double-project\src\app\(website)\Search-product\page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../components/Navbar';
import Product from '../components/product';
import styles from './Search-product.module.css';

type SizeKey = 'S' | 'M' | 'L' | 'XL';
type PriceBySize = Partial<Record<SizeKey, number>>;

type BaseProduct = {
  _id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type VariantProduct = BaseProduct & {
  price: PriceBySize;
  stock: Partial<Record<SizeKey, number>>;
};

type SingleProduct = BaseProduct & {
  size: SizeKey;
  price: number | null;
  stock: number | null; // stock ของไซส์เดียว
};

type ApiProduct = VariantProduct | SingleProduct;

type SearchResponse = {
  results: ApiProduct[];
  total?: number;
  count?: number;
  message?: string;
};

const firstImage = (arr?: string[]) => (arr && arr.length > 0 ? arr[0] : '/placeholder.png');
const isSingleProduct = (p: ApiProduct): p is SingleProduct => 'size' in p;

// แปลง stock ให้เข้ากับ <Product /> เสมอ
function asStock(p: ApiProduct): Partial<Record<SizeKey, number>> {
  if (isSingleProduct(p)) {
    return { [p.size]: Number(p.stock ?? 0) } as Partial<Record<SizeKey, number>>;
  }
  return p.stock ?? {};
}

export default function SearchProductPage() {
  const router = useRouter();

  const params = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  const qParam = params?.get('q')?.trim() ?? '';
  const pageParam = Math.max(1, Number(params?.get('page') ?? '1'));
  const limit = 24;

  const [term, setTerm] = useState(qParam);
  const [items, setItems] = useState<ApiProduct[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || count || 1) / limit)),
    [total, count]
  );

  useEffect(() => {
    let ignore = false;

    (async () => {
      if (!qParam) {
        setItems([]);
        setTotal(0);
        setCount(0);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/products/search?name=${encodeURIComponent(qParam)}&page=${pageParam}&limit=${limit}`,
          { cache: 'no-store' }
        );
        const data: SearchResponse = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Search failed');

        if (!ignore) {
          setItems(Array.isArray(data.results) ? data.results : []);
          setTotal(Number(data.total ?? 0));
          setCount(Number(data.count ?? 0));
        }
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [qParam, pageParam]);

  const submitSearch = () => {
    const q = term.trim();
    if (!q) return;
    router.push(`/Search-product?q=${encodeURIComponent(q)}&page=1`);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitSearch();
  };
  const clearTerm = () => setTerm('');

  const goPage = (p: number) => {
    const n = Math.min(totalPages, Math.max(1, p));
    router.push(`/Search-product?q=${encodeURIComponent(qParam)}&page=${n}`);
  };

  const showEmpty =
    !loading && !err && qParam.length > 0 && (items.length === 0 || (total === 0 && count === 0));

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          {!showEmpty ? (
            <h1 className={styles.title}>
              ผลการค้นหา: <span className={styles.keyword}>{qParam || '-'}</span>
            </h1>
          ) : (
            <div className={styles.emptyWrap}>
              <div className={styles.emptyTitle}>
                0 RESULTS FOUND FOR “{qParam.toUpperCase()}”
              </div>
              <div className={styles.emptySub}>
                No results found for “{qParam}”. Check the spelling or use a different word or
                phrase.
              </div>
              <div className={styles.searchBar}>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search"
                />
                {!!term && (
                  <button className={styles.clearBtn} aria-label="clear" onClick={clearTerm}>
                    ×
                  </button>
                )}
                <button className={styles.submitBtn} onClick={submitSearch} aria-label="search">
                  🔍
                </button>
              </div>
            </div>
          )}

          {loading && <div className={styles.loading}>กำลังค้นหา…</div>}
          {err && <div className={styles.error}>❌ {err}</div>}

          {!loading && !err && items.length > 0 && (
            <>
              <div className={styles.grid}>
                {items.map((p) => {
                  const imageUrl = firstImage(p.imageUrls);
                  const stock = asStock(p);
                  return (
                    <Product
                      key={p._id}
                      name={p.name}
                      stock={stock}
                      imageUrl={imageUrl}
                      imageUrls={p.imageUrls ?? []} // ✅ ส่งเพื่อใช้สลับรูปตอน hover
                      onClick={() => router.push(`/product/${p._id}`)}
                    />
                  );
                })}
              </div>

              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  disabled={pageParam <= 1}
                  onClick={() => goPage(pageParam - 1)}
                >
                  Prev
                </button>
                <div className={styles.pageInfo}>
                  หน้า {pageParam} / {totalPages}
                </div>
                <button
                  className={styles.pageBtn}
                  disabled={pageParam >= totalPages}
                  onClick={() => goPage(pageParam + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
