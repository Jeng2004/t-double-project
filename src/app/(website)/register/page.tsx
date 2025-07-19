'use client';

import styles from './register.module.css';
import { useState } from 'react';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className={styles.container}>
      <div className={styles.formBox}>
        <h2 className={styles.title}>สมัครสมาชิก</h2>
        <p className={styles.subtitle}>สำหรับลูกค้าใหม่</p>

        <input
          type="text"
          name="name"
          placeholder="ชื่อ"
          value={formData.name}
          onChange={handleChange}
          className={styles.input}
        />
        <input
          type="text"
          name="surname"
          placeholder="นามสกุล"
          value={formData.surname}
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

        <button className={styles.button}>SIGN UP</button>
      </div>
    </div>
  );
}
