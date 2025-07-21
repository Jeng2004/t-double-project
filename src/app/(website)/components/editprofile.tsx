'use client';

import { useState } from 'react';
import styles from './editprofile.module.css';
import Image from 'next/image';

export default function EditProfile({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Patcharaphan Sringarm');
  const [phone, setPhone] = useState('********56');
  const [email, setEmail] = useState('*************@gmail.com');

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <div className={styles.header}>แก้ไขโปรไฟล์</div>
        <div className={styles.avatar}>
          <Image src="/user-icon.png" alt="User" width={80} height={80} />
        </div>

        <div className={styles.field}>
          <label>ชื่อ</label>
          <div className={styles.inputBox}>
            <span>{name}</span>
            <span className={styles.arrow}>›</span>
          </div>
        </div>

        <div className={styles.field}>
          <label>โทรศัพท์</label>
          <div className={styles.inputBox}>
            <span>{phone}</span>
            <span className={styles.arrow}>›</span>
          </div>
        </div>

        <div className={styles.field}>
          <label>อีเมล</label>
          <div className={styles.inputBox}>
            <span>{email}</span>
            <span className={styles.arrow}>›</span>
          </div>
        </div>

        <button className={styles.saveBtn}>บันทึก</button>
      </div>
    </div>
  );
}
