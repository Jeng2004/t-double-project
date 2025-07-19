'use client';

import styles from './forgotpassword.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const router = useRouter();

  return (
    <div className={styles.container}>
      <div className={styles.box}>
        <h2 className={styles.title}>ลืมรหัสผ่าน</h2>
        <p className={styles.subtitle}>สำหรับผู้ใช้ที่ลงทะเบียนแล้ว</p>
        <p className={styles.description}>
          กรุณากรอกที่อยู่อีเมลของคุณด้านล่าง คุณจะได้รับลิงก์สำหรับรีเซ็ตรหัสผ่าน
        </p>

        <label className={styles.label}>EMAIL ADDRESS</label>
        <input
          type="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button className={styles.button}>RESET PASSWORD</button>
        <button className={styles.button} onClick={() => router.push('/login')}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
