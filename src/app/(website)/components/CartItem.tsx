'use client';

import Image from 'next/image';
import styles from './CartItem.module.css';

type CartItemProps = {
  name: string;
  size: string;
  code: string;
  price: number;
  quantity: number;
  image: string;
  color: string;
};

export default function CartItem({
  name,
  size,
  code,
  price,
  quantity,
  image,
  color,
}: CartItemProps) {
  return (
    <div className={styles.cartItem}>
      <div className={styles.itemInfo}>
        <Image src={image} alt={name} width={100} height={100} />
        <div>
          <div className={styles.itemName}>{name}</div>
          <div className={styles.itemDetail}>Size: {size}</div>
          <div className={styles.itemDetail}>คลัง: {code}</div>
          <div className={styles.itemDetail}>สี: {color}</div> {/* ✅ เพิ่มบรรทัดนี้ */}
        </div>
      </div>

      <div className={styles.itemPrice}>{price.toFixed(2)}฿</div>

      <div className={styles.qtyControl}>
        <button>-</button>
        <span>{quantity}</span>
        <button>+</button>
        <button className={styles.trash}>🗑</button>
      </div>
    </div>
  );
}
