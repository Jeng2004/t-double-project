'use client';

import Image from 'next/image';
import styles from './product.module.css';

export type ProductProps = {
  name: string;
  price: number;
  imageUrl: string;
  isOutOfStock?: boolean;
  onClick?: () => void; // ✅ เพิ่ม onClick
};

export default function Product({ name, price, imageUrl, isOutOfStock, onClick }: ProductProps) {
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
          <p className={styles.price}>฿{price.toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}
