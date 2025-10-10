'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './product.module.css';
import type { SizeKey } from '@/types/product';

export type ProductProps = {
  name: string;
  /** stock ของแต่ละไซส์ */
  stock?: Partial<Record<SizeKey, number>>;
  /** รูปหลัก (เผื่อบางที่ยังส่งมาแบบเดิม) */
  imageUrl?: string;
  /** รูปทั้งหมดของสินค้า (ใช้สำหรับสไลด์ตอน hover) */
  imageUrls?: string[];
  onClick?: () => void;
};

export default function Product({ name, stock, imageUrl, imageUrls, onClick }: ProductProps) {
  const sizeOrder: SizeKey[] = ['S', 'M', 'L', 'XL'];
  const totalStock = sizeOrder.reduce((sum, s) => sum + (stock?.[s] ?? 0), 0);
  const isOutOfStock = totalStock <= 0;

  // รวมเป็นรายการเดียว โดยเอา imageUrl มาขึ้นหัวไว้ก่อนเผื่อซ้ำกับ imageUrls[0]
  const images: string[] = (imageUrls && imageUrls.length > 0)
    ? Array.from(new Set([imageUrl, ...imageUrls].filter(Boolean) as string[]))
    : [imageUrl || '/placeholder.png'];

  const [idx, setIdx] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startSlide = () => {
    if (images.length <= 1) return;
    // กันซ้อน
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % images.length);
    }, 800); // ความเร็วเปลี่ยนรูป (ms) ปรับได้
  };

  const stopSlide = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIdx(0); // กลับเป็นรูปแรกเมื่อเอาเมาส์ออก
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div
      className={styles.card}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div
        className={styles.imageWrapper}
        onMouseEnter={startSlide}
        onMouseLeave={stopSlide}
      >
        <Image
          key={images[idx]}              // บังคับให้รีเรนเดอร์เมื่อ src เปลี่ยน
          src={images[idx]}
          alt={name}
          fill
          className={styles.image}
          sizes="(max-width: 480px) 100vw, (max-width: 1024px) 33vw, 25vw"
        />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{name}</p>

        {isOutOfStock ? (
          <p className={styles.outOfStock}>สินค้าหมดแล้ว</p>
        ) : (
          <div className={styles.sizes}>
            {sizeOrder.map((s) => {
              const left = stock?.[s] ?? 0;
              return (
                <span key={s} className={left > 0 ? styles.size : styles.sizeOut}>
                  {s}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
