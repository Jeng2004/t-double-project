'use client';

import Image from 'next/image';
import styles from './CartItem.module.css';

type CartItemProps = {
  name: string;
  size: string;
  code: string;
  price: number;   // unit price
  quantity: number;
  image: string;
  color: string;
  stockLeft?: number;   
  onInc?: () => void;
  onDec?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
};

export default function CartItem({
  name,
  size,
  code,
  price,
  quantity,
  image,
  color,
  stockLeft, 
  onInc,
  onDec,
  onRemove,
  disabled,
}: CartItemProps) {
  return (
    <div className={styles.cartItem}>
      <div className={styles.itemInfo}>
        <Image src={image} alt={name} width={100} height={100} />
        <div>
          <div className={styles.itemName}>{name}</div>
          <div className={styles.itemDetail}>Size: {size}</div>
          <div className={styles.itemDetail}>คงเหลือ: {stockLeft !== undefined ? stockLeft : '-'}</div>

        </div>
      </div>

      <div className={styles.itemPrice}>{price.toFixed(2)}฿</div>

      <div className={styles.qtyControl}>
        <button onClick={onDec} disabled={disabled || quantity <= 1}>−</button>
        <span>{quantity}</span>
        <button onClick={onInc} disabled={disabled}>+</button>
        <button className={styles.trash} onClick={onRemove} disabled={disabled} title="ลบสินค้า">🗑</button>
      </div>
    </div>
  );
}
