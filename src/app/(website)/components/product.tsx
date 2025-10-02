'use client';

import Image from 'next/image';
import styles from './product.module.css';
import type { SizeKey } from '@/types/product';

export type ProductProps = {
  name: string;
  stock?: Partial<Record<SizeKey, number>>;
  imageUrl: string;
  onClick?: () => void;
};

export default function Product({ name, stock, imageUrl, onClick }: ProductProps) {
  const sizeOrder: SizeKey[] = ['S', 'M', 'L', 'XL'];
  const totalStock = sizeOrder.reduce((sum, s) => sum + (stock?.[s] ?? 0), 0);
  const isOutOfStock = totalStock <= 0;

  return (
    <div className={styles.card} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className={styles.imageWrapper}>
        <Image
          src={imageUrl}
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
              return <span key={s} className={left > 0 ? styles.size : styles.sizeOut}>{s}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
