'use client';

import styles from './register.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [message, setMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setMessage('');

    if (formData.password !== formData.confirmPassword) {
      setMessage('❌ รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push(`/Confirm-OTP?token=${data.otpToken}&email=${formData.email}`);
      } else {
        setMessage(`❌ ${data.error || 'เกิดข้อผิดพลาด'}`);
      }
    } catch (err) {
      setMessage('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.formBox}>
        <h2 className={styles.title}>สมัครสมาชิก</h2>
        <p className={styles.subtitle}>สำหรับลูกค้าใหม่</p>

        <input
          type="text"
          name="username"
          placeholder="ชื่อผู้ใช้ (username)"
          value={formData.username}
          onChange={handleChange}
          className={styles.input}
        />
        <input
          type="text"
          name="name"
          placeholder="ชื่อ-นามสกุล"
          value={formData.name}
          onChange={handleChange}
          className={styles.input}
        />
        <input
          type="email"
          name="email"
          placeholder="อีเมล"
          value={formData.email}
          onChange={handleChange}
          className={styles.input}
        />
        <input
          type="password"
          name="password"
          placeholder="รหัสผ่าน"
          value={formData.password}
          onChange={handleChange}
          className={styles.input}
        />
        <input
          type="password"
          name="confirmPassword"
          placeholder="ยืนยันรหัสผ่าน"
          value={formData.confirmPassword}
          onChange={handleChange}
          className={styles.input}
        />

        {message && <p className={styles.message}>{message}</p>}

        <button className={styles.button} onClick={handleSubmit}>
          สมัครสมาชิก
        </button>
      </div>
    </div>
  );
}
