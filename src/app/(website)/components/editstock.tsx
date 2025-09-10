// src/app/(website)/components/editstock.tsx
'use client';

import styles from './editstock.module.css';
import { useEffect, useState } from 'react';
import type { Product, SizeKey } from '@/types/product';

export interface EditStockProps {
  product: Product;
  onClose: () => void;
  onSave?: (updated: {
    id: string;
    name: string;
    priceBySize: Record<SizeKey, number>;
    stock: Record<SizeKey, number>;
  }) => void;
  onDelete?: () => void;
}

type PriceBySizeStr = Record<SizeKey, string>;
type PriceBySizeNum = Record<SizeKey, number>;

const SIZES: SizeKey[] = ['S', 'M', 'L', 'XL'] as const;

const toNonNeg = (v: string | number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** ดึงราคาไซส์จาก product.price (รองรับ number เดียวหรือ object) */
const getPriceObjFromProduct = (price: unknown): Partial<Record<SizeKey, number>> => {
  if (typeof price === 'number' && Number.isFinite(price)) {
    return { S: price, M: price, L: price, XL: price };
  }
  if (price && typeof price === 'object') {
    const rec = price as Record<string, unknown>;
    const obj: Partial<Record<SizeKey, number>> = {};
    for (const k of SIZES) {
      const n = toFiniteNumber(rec[k]);
      if (n !== null) obj[k] = n;
    }
    return obj;
  }
  return {};
};

export default function EditStock({ product, onClose, onSave, onDelete }: EditStockProps) {
  const [productName, setProductName] = useState('');
  const [priceBySize, setPriceBySize] = useState<PriceBySizeStr>({ S: '', M: '', L: '', XL: '' });
  const [sizes, setSizes] = useState<Record<SizeKey, string>>({ S: '0', M: '0', L: '0', XL: '0' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setProductName(product.name || '');

    const currentPriceObj = getPriceObjFromProduct(product.price);
    setPriceBySize({
      S: currentPriceObj.S !== undefined ? String(currentPriceObj.S) : '',
      M: currentPriceObj.M !== undefined ? String(currentPriceObj.M) : '',
      L: currentPriceObj.L !== undefined ? String(currentPriceObj.L) : '',
      XL: currentPriceObj.XL !== undefined ? String(currentPriceObj.XL) : '',
    });

    setSizes({
      S: String(product.stock?.S ?? 0),
      M: String(product.stock?.M ?? 0),
      L: String(product.stock?.L ?? 0),
      XL: String(product.stock?.XL ?? 0),
    });
  }, [product]);

  const handleSizeQtyChange = (size: SizeKey, value: string) => {
    if (value === '' || /^[0-9]+$/.test(value)) {
      setSizes((prev) => ({ ...prev, [size]: value }));
    }
  };

  const handleSizePriceChange = (size: SizeKey, value: string) => {
    // ยอมรับตัวเลขหรือทศนิยมไม่ติดลบ
    if (value === '' || /^(?:\d+|\d*\.\d+)$/.test(value)) {
      setPriceBySize((prev) => ({ ...prev, [size]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setErr(null);
    try {
      setSaving(true);

      // resolve ราคาต่อไซส์ -> ให้ค่าว่างเป็น 0 (หรือจะไม่ส่งก็ได้ แต่เราจะ "ส่งครบ" เพื่อให้ฝั่ง API บันทึกเป็น object แน่นอน)
      const resolvedPrice: PriceBySizeNum = {
        S: toNonNeg(priceBySize.S === '' ? 0 : priceBySize.S),
        M: toNonNeg(priceBySize.M === '' ? 0 : priceBySize.M),
        L: toNonNeg(priceBySize.L === '' ? 0 : priceBySize.L),
        XL: toNonNeg(priceBySize.XL === '' ? 0 : priceBySize.XL),
      };

      const formData = new FormData();
      formData.append('name', productName.trim());

      // ❗️สำคัญ: ไม่ส่ง field ชื่อ 'price' เด็ดขาด เพื่อกัน API แปลเป็นราคาเดี่ยว
      formData.append('price_S', String(resolvedPrice.S));
      formData.append('price_M', String(resolvedPrice.M));
      formData.append('price_L', String(resolvedPrice.L));
      formData.append('price_XL', String(resolvedPrice.XL));

      // stock
      formData.append('stock_S', sizes.S || '0');
      formData.append('stock_M', sizes.M || '0');
      formData.append('stock_L', sizes.L || '0');
      formData.append('stock_XL', sizes.XL || '0');

      // ใช้ PUT เสมอ (อย่าใช้ PATCH) เพื่อให้ API ฝั่งคุณ updateData.price เป็น object ตามฟิลด์ *_S/M/L/XL
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`อัปเดตไม่สำเร็จ (HTTP ${res.status}) ${t}`);
      }

      onSave?.({
        id: String(product.id),
        name: productName.trim(),
        priceBySize: resolvedPrice,
        stock: {
          S: toNonNeg(sizes.S),
          M: toNonNeg(sizes.M),
          L: toNonNeg(sizes.L),
          XL: toNonNeg(sizes.XL),
        },
      });

      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <button className={styles.closeButton} onClick={onClose}>✕</button>
        <h2 className={styles.title}>แก้ไขสินค้า</h2>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>ชื่อสินค้า</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
          />

          <label>ราคาแยกตามขนาด</label>
          <div className={styles.sizeGrid}>
            {SIZES.map((size) => (
              <div key={size} className={styles.sizeItem}>
                <label>ราคา {size}</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={priceBySize[size]}
                  onChange={(e) => handleSizePriceChange(size, e.target.value)}
                  placeholder={`ราคา ${size}`}
                  required
                />
              </div>
            ))}
          </div>

          <label>จำนวนในแต่ละขนาด</label>
          <div className={styles.sizeGrid}>
            {SIZES.map((size) => (
              <div key={size} className={styles.sizeItem}>
                <label>จำนวน {size}</label>
                <input
                  type="number"
                  min={0}
                  value={sizes[size]}
                  onChange={(e) => handleSizeQtyChange(size, e.target.value)}
                  placeholder={`จำนวน size ${size}`}
                  required
                />
              </div>
            ))}
          </div>

          {err && <div style={{ color:'#c00' }}>❌ {err}</div>}

          <div className={styles.actionsRow}>
            {onDelete && (
              <button type="button" className={styles.dangerButton} onClick={onDelete} disabled={saving}>
                ลบสินค้า
              </button>
            )}
            <div className={styles.spacer} />
            <button type="submit" className={styles.submitButton} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
