'use client';

import Image from 'next/image';
import styles from './product.module.css';
import type { SizeKey } from '@/types/product';

export type ProductProps = {
  name: string;
  /** รองรับทั้งราคาเดี่ยว หรือราคาแยกไซส์ */
  price: number | Partial<Record<SizeKey, unknown>>;
  imageUrl: string;
  isOutOfStock?: boolean;
  onClick?: () => void;
};

const formatNumber = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return String(n);
  }
};

const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** คืนราคา *ที่จะแสดง*:
 * - ถ้าเป็น number → ใช้ตรงๆ
 * - ถ้าเป็น object → ใช้ค่าต่ำสุดของ S/M/L/XL ที่เป็นตัวเลข
 * - ถ้าไม่มีตัวเลขเลย → null
 */
const getDisplayPrice = (price: ProductProps['price']): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (price && typeof price === 'object') {
    const keys: SizeKey[] = ['S', 'M', 'L', 'XL'];
    const nums = keys
      .map((k) => toFiniteNumber((price as Record<string, unknown>)[k]))
      .filter((v): v is number => v !== null);
    if (nums.length) return Math.min(...nums);
  }
  return null;
};

export default function Product({ name, price, imageUrl, isOutOfStock, onClick }: ProductProps) {
  const displayPrice = getDisplayPrice(price);

  return (
    <div className={styles.card} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className={styles.imageWrapper}>
        <Image src={imageUrl} alt={name} width={300} height={300} className={styles.image} />
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        {isOutOfStock ? (
          <p className={styles.outOfStock}>สินค้าหมดแล้ว</p>
        ) : (
          <p className={styles.price}>
            {displayPrice !== null ? `฿${formatNumber(displayPrice)}` : 'ราคา: -'}
          </p>
        )}
      </div>
    </div>
  );
}
