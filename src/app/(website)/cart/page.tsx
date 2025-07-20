'use client';

import styles from './cart.module.css';
import Navbar from '../components/Navbar';
import CartItem from '../components/CartItem';

export default function CartPage() {
  const cartItems = [
    {
      id: 1,
      name: 'JOKER TEE',
      size: 'M',
      code: '9656',
      color: 'ดำ',
      price: 550.0,
      quantity: 1,
      image: '/JOKER-TEE.png',
    },
    {
      id: 2,
      name: 'BASIC STÜSSY THERMAL',
      size: 'L',
      code: '462',
      color: 'ขาว',
      price: 2660.0,
      quantity: 1,
      image: '/JOKER-TEE.png',
    },
    {
      id: 3,
      name: 'BASIC STÜSSY THERMAL',
      size: 'L',
      code: '462',
      color: 'ขาว',
      price: 1200.0,
      quantity: 1,
      image: '/JOKER-TEE.png',
    },
  ];

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.cartSection}>
          <div className={styles.header}>
            <div className={styles.columnProduct}>สินค้า</div>
            <div className={styles.columnPrice}>ราคา</div>
            <div className={styles.columnQty}>จำนวน</div>
          </div>

          {cartItems.map((item) => (
            <CartItem
              key={item.id}
              name={item.name}
              size={item.size}
              code={item.code}
              price={item.price}
              quantity={item.quantity}
              image={item.image}
              color={item.color}
            />
          ))}
        </div>

        <div className={styles.summary}>
          <h3>สรุปคำสั่งซื้อ</h3>
          <div className={styles.summaryRow}>
            <span>ยอดรวม</span>
            <span>{total.toFixed(2)}฿</span>
          </div>
          <div className={styles.summaryRow}>
            <span>รวมทั้งหมด</span>
            <span>{total.toFixed(2)}฿</span>
          </div>

          <button className={styles.checkout}>ดำเนินการชำระเงิน</button>
          <button className={styles.continue}>เลือกซื้อสินค้าต่อ</button>
        </div>
      </div>
    </>
  );
}
