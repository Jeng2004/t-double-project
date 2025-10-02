// src/app/(website)/editstock/[id]/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import styles from './editstock.module.css';
import NavbarAdmin from '../../components/NavbarAdmin';
import type { SizeKey } from '@/types/product';
import EditStockBasic from '../../components/editstock';

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
  // ✅ เลี่ยงการ destructure ตรง ๆ เผื่อชนเคส union | null
  const params = useParams() as { id?: string } | null;
  const id = params?.id ?? '';
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  // ค่าแก้ไขได้ (สำหรับตาราง Variant)
  const [priceBySize, setPriceBySize] = useState<PriceBySize>({ S: 0, M: 0, L: 0, XL: 0 });
  const [stockBySize, setStockBySize] = useState<StockBySize>({ S: 0, M: 0, L: 0, XL: 0 });

  // ✅ ค่าคงเหลือจากระบบ (แสดงเป็น read-only)
  const [initialStockBySize, setInitialStockBySize] = useState<StockBySize>({
    S: 0, M: 0, L: 0, XL: 0,
  });

  // 🔔 โมดัลแก้ไขข้อมูลพื้นฐาน (ชื่อ/หมวดหมู่/รูป)
  const [showBasic, setShowBasic] = useState(false);

  // โหลดข้อมูลสินค้า
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProductRes = await res.json();

        setName(data.name ?? '');
        setCategory((data.category ?? '') || '');
        setImageUrls(Array.isArray(data.imageUrls) ? data.imageUrls : []);

        // ราคา: รองรับทั้ง number เดี่ยว และ object รายไซส์
        if (typeof data.price === 'number') {
          const p = data.price;
          setPriceBySize({ S: p, M: p, L: p, XL: p });
        } else {
          setPriceBySize({
            S: toNum(data.price?.S),
            M: toNum(data.price?.M),
            L: toNum(data.price?.L),
            XL: toNum(data.price?.XL),
          });
        }

        const stockObj: StockBySize = {
          S: toNum(data.stock?.S),
          M: toNum(data.stock?.M),
          L: toNum(data.stock?.L),
          XL: toNum(data.stock?.XL),
        };
        setStockBySize(stockObj);         // ค่าแก้ไขได้
        setInitialStockBySize(stockObj);  // ✅ ค่าคงเหลือ(ระบบ)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'โหลดข้อมูลสินค้าไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // จำนวนสต๊อกที่เหลืออยู่ (แสดงคงที่จากค่า initial)
  const remainBySize = useMemo<StockBySize>(() => ({
    S: initialStockBySize.S,
    M: initialStockBySize.M,
    L: initialStockBySize.L,
    XL: initialStockBySize.XL,
  }), [initialStockBySize]);

  const sizes: SizeKey[] = ['S', 'M', 'L', 'XL'];

  // บันทึกเฉพาะส่วน Variant (ราคา/สต๊อก)
  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append('name', name); // ส่ง name ไปด้วยกรณี API คุณต้องการ (ไม่เปลี่ยนก็ได้)

      // ราคาแยกไซส์
      fd.append('price_S', String(priceBySize.S ?? 0));
      fd.append('price_M', String(priceBySize.M ?? 0));
      fd.append('price_L', String(priceBySize.L ?? 0));
      fd.append('price_XL', String(priceBySize.XL ?? 0));

      // สต๊อกแยกไซส์
      fd.append('stock_S', String(stockBySize.S ?? 0));
      fd.append('stock_M', String(stockBySize.M ?? 0));
      fd.append('stock_L', String(stockBySize.L ?? 0));
      fd.append('stock_XL', String(stockBySize.XL ?? 0));

      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
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
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
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
        {/* หัวเรื่อง + ปุ่มเปิดโมดัลแก้ไขข้อมูลพื้นฐาน */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Product Name: {name || '-'}
          </h1>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setShowBasic(true)}
            aria-label="แก้ไขข้อมูลพื้นฐาน"
          >
            แก้ไขข้อมูล
          </button>
        </div>

        {/* แสดง Category ถ้ามี */}
        {category.trim() && (
          <p className={styles.categoryText}>Category: {category}</p>
        )}

        {/* รูปตัวอย่าง */}
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
                  <th>Price</th>
                  <th>Stock</th>
                  <th>จำนวนสต๊อกที่เหลืออยู่</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((sz) => (
                  <tr key={sz}>
                    <td className={styles.cellCenter}>{sz}</td>

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

                    {/* ✅ แสดงค่าคงเหลือ(ระบบ) แบบคงที่ */}
                    <td className={styles.cellCenter}>{remainBySize[sz]}</td>
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

      {/* โมดัลแก้ไขข้อมูลพื้นฐาน (ชื่อ/หมวดหมู่/รูป) */}
      <EditStockBasic
        id={String(id)}
        initialName={name}
        initialCategory={category}
        initialImageUrls={imageUrls}
        open={showBasic}
        onClose={() => setShowBasic(false)}
        onSaved={() => {
          // รีเฟรชข้อมูลในหน้า (ถ้าใช้ Next 13+ จะมี router.refresh)
          router.refresh?.();
        }}
      />
    </>
  );
}
