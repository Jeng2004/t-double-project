'use client';

import Image from 'next/image';
import styles from './CartItem.module.css';
import { useEffect, useState } from 'react';

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
  onSetQty?: (qty: number) => void; // ✅ ใหม่: ตั้งจำนวนตามที่ผู้ใช้พิมพ์
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
  onSetQty,
  disabled,
}: CartItemProps) {
  const [inputQty, setInputQty] = useState<number>(quantity);

  useEffect(() => {
    setInputQty(quantity);
  }, [quantity]);

  const applyQty = () => {
    if (!onSetQty) return;
    const q = Math.max(1, Math.floor(Number(inputQty) || 1));
    onSetQty(q);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyQty();
  };

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

        {/* ✅ ช่องพิมพ์จำนวน + ปุ่มตั้ง */}
        <input
          type="number"
          min={1}
          step={1}
          value={inputQty}
          onChange={(e) => setInputQty(Number(e.target.value))}
          onKeyDown={onInputKeyDown}
          className={styles.qtyInput}     // ถ้ายังไม่มี class นี้ เพิ่มใน CSS: width: 72px; text-align: center;
          aria-label="กำหนดจำนวน"
          disabled={disabled}
        />
        <button onClick={applyQty} disabled={disabled} title="ตั้งจำนวน">ตั้งจำนวน</button>

        <button onClick={onInc} disabled={disabled}>+</button>
        <button className={styles.trash} onClick={onRemove} disabled={disabled} title="ลบสินค้า">🗑</button>
      </div>
    </div>
  );
}
