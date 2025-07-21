'use client';

import styles from './Track-orders.module.css';
import Image from 'next/image';

export default function TrackOrders() {
  return (
    <div>
      <h4 className={styles.title}>ติดตามการสั่งซื้อ</h4>
      <div className={styles.orderList}>
        {[1, 2, 3].map((_, index) => (
          <div key={index} className={styles.orderItem}>
            <Image src="/JOKER-TEE.png" alt="Product" width={60} height={60} />
            <div>
              <p className={styles.productName}>JOKER TEE</p>
              <span className={styles.productDetail}>Size: M &nbsp; x1</span>
            </div>
            <div className={styles.price}>฿550</div>
            <div
              className={
                index === 0 ? styles.statusPending : styles.statusSuccess
              }
            >
              {index === 0 ? 'กำลังดำเนินการจัดส่ง' : 'จัดส่งสำเร็จ'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
