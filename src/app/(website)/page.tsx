'use client';

import Image from 'next/image';
import Navbar from './components/Navbar';
import Navbar2 from './components/Navbar2';
import Product from './components/product';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Product as DBProduct } from '@/types/product';

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<DBProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        // ✅ ใส่ credentials:'include' เพื่อให้ cookie ถูกส่งแน่ๆ
        const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
        if (!res.ok) {
          router.replace('/login');
          return;
        }

        // ล็อกอินแล้ว → โหลดสินค้า
        const load = async () => {
          try {
            const r = await fetch('/api/products', { cache: 'no-store', credentials: 'include' });
            if (!r.ok) throw new Error(await r.text());
            const data: DBProduct[] = await r.json();
            setItems(data);
          } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
          } finally {
            setLoading(false);
          }
        };
        load();
      } catch {
        router.replace('/login');
      }
    };
    check();
  }, [router]);

  return (
    <>
      <Navbar />

      <div className="mb-10">
        <Image
          src="/1.png"
          alt="Home Banner"
          width={1200}
          height={400}
          className="w-full h-auto object-cover"
          priority
        />
      </div>

      <div className="p-10">
        <h2 className="text-xl font-semibold mb-6">สินค้าใหม่</h2>

        {loading && <div>กำลังโหลดสินค้า...</div>}
        {err && <div className="text-red-600">❌ {err}</div>}

        {!loading && !err && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.length === 0 ? (
              <div>ยังไม่มีสินค้า</div>
            ) : (
              items.map((p) => {
                const imageUrl = p.imageUrls?.[0] || '/placeholder.png';
                return (
                  <Product
                    key={p.id}
                    name={p.name}
                    stock={p.stock}
                    imageUrl={imageUrl}         // เผื่อไว้ (ไม่จำเป็นก็ได้)
                    imageUrls={p.imageUrls ?? []}
                    onClick={() => router.push(`/product/${p.id}`)}
                  />
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="px-10 mb-10 flex justify-center">
        <Image
          src="/2.png"
          alt="Promotion Banner"
          width={1200}
          height={400}
          className="rounded-lg shadow"
        />
      </div>

      <Navbar2 />
    </>
  );
}
