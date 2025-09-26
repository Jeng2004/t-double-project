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
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: DBProduct[] = await res.json();
        setItems(data);
      } catch (e: unknown) {
        if (e instanceof Error) {
          setErr(e.message);
        } else {
          setErr('โหลดสินค้าล้มเหลว');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <>
      <Navbar />

      {/* Banner 1.png */}
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

      {/* สินค้าใหม่ */}
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
                const totalStock =
                  (p.stock?.S ?? 0) +
                  (p.stock?.M ?? 0) +
                  (p.stock?.L ?? 0) +
                  (p.stock?.XL ?? 0);
                const isOut = totalStock <= 0;

                return (
                  <Product
                    key={p.id}
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

      {/* Banner 2.png (ไม่เต็มขอบ, อยู่ใน container เดียวกับสินค้าใหม่) */}
      <div className="px-10 mb-10 flex justify-center">
        <Image
          src="/2.png"
          alt="Promotion Banner"
          width={1200}   // ปรับตรงนี้
          height={400}  // อัตราส่วนใกล้เคียงกับรูปจริง
          className="rounded-lg shadow"
        />
      </div>

      <Navbar2 />
    </>
  );
}
