'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import styles from './editstock.module.css';
import NavbarAdmin from '../../components/NavbarAdmin';
import type { SizeKey } from '@/types/product';

type PriceBySize = Record<SizeKey, number>;
type StockBySize = Record<SizeKey, number>;

type ProductRes = {
  id: string | number;
  name: string;
  category?: string | null;
  imageUrls?: string[];
  price?: number | Partial<Record<SizeKey, number | string>>;
  stock?: Partial<Record<SizeKey, number | string>>;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function EditStockPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const [priceBySize, setPriceBySize] = useState<PriceBySize>({
    S: 0, M: 0, L: 0, XL: 0,
  });
  const [stockBySize, setStockBySize] = useState<StockBySize>({
    S: 0, M: 0, L: 0, XL: 0,
  });

  // โหลดข้อมูลสินค้า
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/products/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProductRes = await res.json();

        setName(data.name ?? '');
        setCategory((data.category as string) ?? '');
        setImageUrls(Array.isArray(data.imageUrls) ? data.imageUrls : []);

        setPriceBySize({
          S: toNum((data.price as any)?.S ?? data.price),
          M: toNum((data.price as any)?.M ?? data.price),
          L: toNum((data.price as any)?.L ?? data.price),
          XL: toNum((data.price as any)?.XL ?? data.price),
        });
        setStockBySize({
          S: toNum((data.stock as any)?.S),
          M: toNum((data.stock as any)?.M),
          L: toNum((data.stock as any)?.L),
          XL: toNum((data.stock as any)?.XL),
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดข้อมูลสินค้าไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // จำนวนสต๊อกที่เหลืออยู่ (ถ้ายังไม่ได้มี logic “จอง/ขายไป” ให้แสดงเท่ากับ stock)
  const remainBySize = useMemo<StockBySize>(() => ({
    S: stockBySize.S,
    M: stockBySize.M,
    L: stockBySize.L,
    XL: stockBySize.XL,
  }), [stockBySize]);

  const sizes: SizeKey[] = ['S', 'M', 'L', 'XL'];

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append('name', name);

      // 🔁 ราคาแยกไซส์ (ตามที่ API ฝั่งคุณรองรับ)
      fd.append('price_S', String(priceBySize.S ?? 0));
      fd.append('price_M', String(priceBySize.M ?? 0));
      fd.append('price_L', String(priceBySize.L ?? 0));
      fd.append('price_XL', String(priceBySize.XL ?? 0));

      // 🔁 Stock แยกไซส์
      fd.append('stock_S', String(stockBySize.S ?? 0));
      fd.append('stock_M', String(stockBySize.M ?? 0));
      fd.append('stock_L', String(stockBySize.L ?? 0));
      fd.append('stock_XL', String(stockBySize.XL ?? 0));

      // หมายเหตุ: ถ้าจะรองรับ category ที่แก้ไขได้ ให้เพิ่มใน API แล้วส่งไปด้วย
      // fd.append('category', category);

      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PUT ${res.status}: ${t}`);
      }
      alert('✅ บันทึกสำเร็จ');
      router.push('/stock-admin');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('ลบสินค้านี้ถาวรหรือไม่?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      alert('✅ ลบสินค้าเรียบร้อย');
      router.push('/stock-admin');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <>
        <NavbarAdmin />
        <div className={styles.container}>กำลังโหลด...</div>
      </>
    );
  }

  if (err) {
    return (
      <>
        <NavbarAdmin />
        <div className={styles.container} style={{ color: '#c00' }}>
          ❌ {err}
        </div>
      </>
    );
  }

  const imgA = imageUrls[0] ?? '/placeholder.png';
  const imgB = imageUrls[1] ?? '/placeholder.png';

  return (
    <>
      <NavbarAdmin />
      <div className={styles.container}>
        {/* หัวเรื่อง */}
        <h1 className={styles.title}>Product Name: {name || '-'}</h1>
        <p className={styles.categoryText}>Category: {category || 'T-shirt'}</p>

        {/* สองรูปตัวอย่าง */}
        <div className={styles.previewRow}>
          <div className={styles.previewBox}>
            <Image src={imgA} alt="preview 1" width={520} height={520} className={styles.previewImg} />
          </div>
          <div className={styles.previewBox}>
            <Image src={imgB} alt="preview 2" width={520} height={520} className={styles.previewImg} />
          </div>
        </div>

        {/* ตาราง Variant Management */}
        <div className={styles.tableSection}>
          <h3 className={styles.sectionTitle}>Variant Management</h3>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Product Code</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>จำนวนสต๊อกที่เหลืออยู่</th>
                  <th>แก้ไขสินค้า</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((sz) => (
                  <tr key={sz}>
                    <td className={styles.cellCenter}>{sz}</td>

                    {/* หมายเหตุ: ถ้าจะเก็บ code จริงใน DB ให้เพิ่ม field / API เอง
                        ตอนนี้แค่โชว์ input ไว้ก่อน */}
                    <td>
                      <input
                        className={styles.input}
                        placeholder={`CT-${sz}`}
                        aria-label={`product-code-${sz}`}
                      />
                    </td>

                    <td>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        value={priceBySize[sz]}
                        onChange={(e) =>
                          setPriceBySize((p) => ({ ...p, [sz]: Number(e.target.value) }))
                        }
                      />
                    </td>

                    <td>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        value={stockBySize[sz]}
                        onChange={(e) =>
                          setStockBySize((s) => ({ ...s, [sz]: Number(e.target.value) }))
                        }
                      />
                    </td>

                    <td className={styles.cellCenter}>{remainBySize[sz]}</td>

                    <td className={styles.cellCenter}>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        onClick={() => {
                          const q = prompt(`ระบุจำนวน (ไซซ์ ${sz})`, String(stockBySize[sz]));
                          if (q == null) return;
                          const n = Number(q);
                          if (!Number.isFinite(n) || n < 0) return;
                          setStockBySize((s) => ({ ...s, [sz]: n }));
                        }}
                      >
                        ระบุจำนวน
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ปุ่มล่างขวา */}
          <div className={styles.footerBtns}>
            <button type="button" className={styles.secondaryBtn} onClick={handleDelete}>
              ลบสินค้าออก
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
