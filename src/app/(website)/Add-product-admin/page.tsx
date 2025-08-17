'use client';

import styles from './Add-product-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';

export default function AddProductAdminPage() {
  return (
    <>
      <NavbarAdmin />
      <div className={styles.container}>
        <div className={styles.left}>
          <div className={styles.imagePlaceholder}></div>
          <div className={styles.imagePlaceholder}></div>
        </div>
        <div className={styles.right}>
          <h2 className={styles.title}>เพิ่มสินค้า</h2>
          <hr className={styles.line} />

          <form className={styles.form}>
            <input type="text" placeholder="ชื่อสินค้า" className={styles.input} />
            <select className={styles.input}>
              <option>SIZE: S-XL</option>
              <option>SIZE: Free Size</option>
            </select>
            <div className={styles.priceRow}>
              <input type="number" placeholder="ราคา" className={styles.input} />
              <span className={styles.currency}>฿</span>
            </div>
            <input type="text" placeholder="หมวดหมู่" className={styles.input} />
            <label className={styles.uploadBox}>
              <input type="file" className={styles.fileInput} />
              <span>อัปโหลดรูปภาพ</span>
              <span className={styles.icon}>📤</span>
            </label>
            <button type="submit" className={styles.submit}>บันทึก</button>
          </form>
        </div>
      </div>
    </>
  );
}
