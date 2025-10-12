// src/app/(website)/components/product.tsx
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
    if (images.length <= 1 || isOutOfStock) return; // ไม่สไลด์เมื่อหมดสต็อก
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % images.length);
    }, 800);
  };

  const stopSlide = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIdx(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ปิดคลิก/คีย์บอร์ดเมื่อหมดสต็อก
  const handleClick = () => {
    if (isOutOfStock) return;
    onClick?.();
  };
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (isOutOfStock) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className={styles.card}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick && !isOutOfStock ? 'button' : undefined}
      tabIndex={onClick && !isOutOfStock ? 0 : -1}
      aria-disabled={isOutOfStock || undefined}
      title={isOutOfStock ? 'สินค้าหมดแล้ว' : name}
      style={{
        cursor: onClick && !isOutOfStock ? 'pointer' : 'default',
        opacity: isOutOfStock ? 0.65 : 1,
        pointerEvents: isOutOfStock ? 'auto' : 'auto', // ยอมให้โฮเวอร์ได้ แต่เราบล็อกคลิกใน handleClick อยู่แล้ว
      }}
    >
      <div
        className={styles.imageWrapper}
        onMouseEnter={startSlide}
        onMouseLeave={stopSlide}
        style={{ position: 'relative' }}
      >
        <Image
          key={images[idx]}
          src={images[idx]}
          alt={name}
          fill
          className={styles.image}
          sizes="(max-width: 480px) 100vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Overlay “สินค้าหมดแล้ว” */}
        {isOutOfStock && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.55))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: '#fff',
              fontSize: '0.95rem',
              letterSpacing: 0.3,
              borderRadius: '8px',
            }}
          >
            สินค้าหมดแล้ว
          </div>
        )}
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{name}</p>

        {isOutOfStock ? (
          <p className={styles.outOfStock}>หมดสต็อก</p>
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
