'use client';

import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <h2 className={styles.title}>เข้าสู่ระบบ</h2>
        <p className={styles.subtitle}>ลูกค้าที่ลงทะเบียนแล้ว</p>
        <p className={styles.description}>
          กรุณาระบุอีเมลและรหัสผ่านที่เชื่อมโยงกับบัญชีของคุณ หากคุณพบปัญหา กรุณาใช้ลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่านของคุณ <br />
          ช่องที่มีเครื่องหมายดอกจัน (*) จำเป็นต้องกรอก
        </p>

        <label className={styles.label}>EMAIL ADDRESS*</label>
        <input
          type="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={styles.label}>PASSWORD*</label>
        <input
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className={styles.button} onClick={() => router.push('/')}>
          SIGN IN
        </button>
        <button className={styles.button} onClick={() => router.push('/forgotpassword')}>
            FORGOT PASSWORD
        </button>
      </div>

      <div className={styles.registerBox}>
        <h2 className={styles.title}>สมัครสมาชิก</h2>
        <p className={styles.subtitle}>ต้องการบัญชีใช่ไหม?</p>
        <button className={styles.button} onClick={() => router.push('/register')}>
          PROCEED TO REGISTER
        </button>
      </div>
    </div>
  );
}
