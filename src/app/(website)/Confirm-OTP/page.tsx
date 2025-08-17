'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './Confirm-OTP.module.css';

export default function ConfirmOTPPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token') || '';
  const emailQuery = searchParams.get('email') || '';

  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState(emailQuery);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleVerify = async () => {
    try {
      const res = await fetch('/api/register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpToken: token, otp }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
        setError('');
        setTimeout(() => {
          router.push('/login'); // เปลี่ยนเส้นทางหลังยืนยันสำเร็จ
        }, 2000);
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด');
        setMessage('');
      }
    } catch (err) {
      setError('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      setMessage('');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.box}>
        <h2 className={styles.title}>ยืนยัน OTP</h2>

        <input
          type="email"
          placeholder="อีเมล"
          value={email}
          disabled
          className={styles.input}
        />
        <input
          type="text"
          placeholder="กรอกรหัส OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          className={styles.input}
        />

        <button className={styles.button} onClick={handleVerify}>
          ยืนยัน OTP
        </button>

        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
