'use client';

import styles from './stock.module.css';
import Image from 'next/image';

interface StockProps {
  onEditClick: (product: ProductType) => void;
}

interface ProductType {
  id: number;
  name: string;
  price: string;
  image: string;
  sizes: Record<string, number | string>;
}

const stockData: ProductType[] = [
  {
    id: 1,
    name: 'JOKER TEE',
    price: '1,500฿',
    image: '/JOKER-TEE.png',
    sizes: { S: 456, M: 236, L: 445, XL: 598 },
  },
  {
    id: 2,
    name: 'WHITE TEE',
    price: '1,200฿',
    image: '/WHITE-TEE.png',
    sizes: { S: 123, M: 456, L: 789, XL: 101 },
  },
  {
      id: 3,
    name: 'WHITE TEE',
    price: '1,200฿',
    image: '/WHITE-TEE.png',
    sizes: { S: 123, M: 456, L: 789, XL: 101 },
  },

];

export default function Stock({ onEditClick }: StockProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.pageTitle}>สินค้าในสต็อก</h2>

      <div className={styles.tableHeader}>
        <div className={styles.colName}>ชื่อ</div>
        <div className={styles.colSize}>Size</div>
        <div className={styles.colQty}>จำนวน</div>
        <div className={styles.colEdit}>เพิ่มสินค้า</div>
      </div>

      {stockData.map((item) => (
        <div className={styles.card} key={item.id}>
          <div className={styles.productInfo}>
            <Image
              src={item.image}
              alt={item.name}
              width={100}
              height={100}
              className={styles.image}
            />
            <div>
              <p className={styles.name}>{item.name}</p>
              <p className={styles.price}>ราคา: {item.price}</p>
            </div>
          </div>

            <div className={styles.sizeTable}>
            {Object.entries(item.sizes).map(([size, qty], idx) => (
                <div className={styles.sizeRow} key={idx}>
                <div className={styles.size}>{size}</div>
                <div
                    className={`${styles.qty} ${String(qty) === 'หมด' ? styles.outOfStock : ''}`}
                >
                    {qty}
                </div>

                {/* ✅ ปุ่มเฉพาะแถวแรก */}
                {idx === 0 && (
                    <div className={styles.editSingle}>
                    <button onClick={() => onEditClick(item)}>แก้ไขสินค้า</button>
                    </div>
                )}
                </div>
            ))}
            </div>
        </div>
      ))}
    </div>
  );
}
