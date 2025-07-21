'use client';

import { useState } from 'react';
import styles from './Order-details.module.css';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import Qrcode from '../components/Qrcode';
import CreditCardForm from '../components/credit-card';

export default function OrderDetailsPage() {
  const [method, setMethod] = useState('QR พร้อมเพย์');
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <form className={styles.form}>
          <h3>ข้อมูลติดต่อ</h3>
          <input type="email" placeholder="อีเมล" className={styles.input} />

          <h3>การจัดส่ง</h3>
          <div className={styles.nameRow}>
            <input type="text" placeholder="ชื่อ" className={styles.input} />
            <input type="text" placeholder="นามสกุล" className={styles.input} />
          </div>
          <input type="text" placeholder="ที่อยู่" className={styles.input} />
          <input type="text" placeholder="รายละเอียดเพิ่มเติม" className={styles.input} />
          <input type="text" placeholder="โทรศัพท์" className={styles.input} />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" />
            บันทึกข้อมูลสำหรับครั้งถัดไป
          </label>

          <div className={styles.orderSummary}>
            <Image src="/JOKER-TEE.png" alt="JOKER TEE" width={100} height={100} />
            <div>
              <div className={styles.productName}>JOKER TEE</div>
              <div className={styles.productDetail}>Size: M</div>
              <div className={styles.productDetail}>คลัง: 9656</div>
            </div>
            <div className={styles.price}>550฿</div>
          </div>

          <h3>การชำระเงิน</h3>
          <select
            className={styles.paymentSelect}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option>QR พร้อมเพย์</option>
            <option>บัตรเครดิต/เดบิต</option>
          </select>

          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => setShowModal(true)}
          >
            ชำระเงิน
          </button>
        </form>

        {/* ✅ Modal แสดงตามวิธีชำระเงิน */}
        {showModal && (
          <div className={styles.overlay}>
            <div className={styles.modalBox}>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                ✕
              </button>
              {method === 'QR พร้อมเพย์' && <Qrcode />}
              {method === 'บัตรเครดิต/เดบิต' && <CreditCardForm />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
