'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './reset-password.module.css';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    setMessage('');
    setError('');

    if (!token) {
      setError('ลิงก์ไม่ถูกต้อง');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('❌ รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      const res = await fetch('/api/reset_password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
        setTimeout(() => router.push('/login'), 3000); // ✅ กลับหน้า login
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch {
      setError('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.box}>
        <h2 className={styles.title}>ตั้งรหัสผ่านใหม่</h2>

        <input
          type="password"
          placeholder="รหัสผ่านใหม่"
          className={styles.input}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="ยืนยันรหัสผ่าน"
          className={styles.input}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.button} onClick={handleReset}>
          ตั้งรหัสผ่านใหม่
        </button>
      </div>
    </div>
  );
}
