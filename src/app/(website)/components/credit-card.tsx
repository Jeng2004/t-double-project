'use client';

import styles from './credit-card.module.css';

export default function CreditCardForm() {
  return (
      <div className={styles.modal}>
        <h3 className={styles.title}>ข้อมูลบัตรเครดิต/เดบิต</h3>
        <input type="text" placeholder="หมายเลขบัตร" className={styles.input} />
        <input type="text" placeholder="ชื่อเจ้าของบัตร" className={styles.input} />
        <div className={styles.row}>
          <input type="text" placeholder="MM/YY" className={styles.input} />
          <input type="text" placeholder="CVV" className={styles.input} />
        </div>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" />
          บันทึกข้อมูลสำหรับครั้งถัดไป
        </label>
        <button className={styles.submit}>ยืนยันการชำระเงิน</button>
      </div>
  );
}
