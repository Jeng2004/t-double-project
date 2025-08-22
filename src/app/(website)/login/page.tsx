'use client';

import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    setMessage('');

    if (!email || !password) {
      setMessage('❌ กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('userId', data.user.id);
        console.log('✅ Login สำเร็จ:', data.user);
        console.log('📦 userId ที่เก็บไว้:', localStorage.getItem('userId'));
        setMessage('✅ เข้าสู่ระบบสำเร็จ');

        // ✅ redirect ตาม role
        if (data.user?.role === 'admin') {
          router.push('/Order-admin');
        } else {
          router.push('/');
        }
      } else {
        setMessage(`❌ ${data.error || 'เข้าสู่ระบบไม่สำเร็จ'}`);
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

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

        {message && <p className={styles.message}>{message}</p>}

        <button
          className={styles.button}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'SIGN IN'}
        </button>

        <button
          className={styles.button}
          onClick={() => router.push('/forgotpassword')}
        >
          FORGOT PASSWORD
        </button>
      </div>

      <div className={styles.registerBox}>
        <h2 className={styles.title}>สมัครสมาชิก</h2>
        <p className={styles.subtitle}>ต้องการบัญชีใช่ไหม?</p>
        <button
          className={styles.button}
          onClick={() => router.push('/register')}
        >
          PROCEED TO REGISTER
        </button>
      </div>
    </div>
  );
}
