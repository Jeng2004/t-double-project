// src/app/(website)/Confirm-OTP/page.tsx
'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './Confirm-OTP.module.css';

export default function ConfirmOTPPage() {
  const searchParams = useSearchParams(); // บาง typing บอกว่าอาจเป็น null → ใช้ optional chaining ตอน get()
  const router = useRouter();

  // ใช้ optional chaining ป้องกัน error ที่ว่า searchParams อาจเป็น null
  const token = searchParams?.get('token') ?? '';
  const emailQuery = searchParams?.get('email') ?? '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // ใช้อีเมลจริงที่ส่งมา
  const displayedEmail = useMemo(() => emailQuery || 'example@gmail.com', [emailQuery]);

  const otp = useMemo(() => digits.join(''), [digits]);

  const focusNext = (idx: number) => inputsRef.current[idx + 1]?.focus();
  const focusPrev = (idx: number) => inputsRef.current[idx - 1]?.focus();

  const onChangeDigit = (val: string, idx: number) => {
    const v = val.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[idx] = v;
    setDigits(next);
    if (v) focusNext(idx);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace' && !digits[idx]) {
      e.preventDefault();
      focusPrev(idx);
      const next = [...digits];
      next[Math.max(0, idx - 1)] = '';
      setDigits(next);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrev(idx);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusNext(idx);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const next = Array(6).fill('').map((_, i) => text[i] || '');
    setDigits(next);
    const last = Math.min(text.length, 5);
    inputsRef.current[last]?.focus();
  };

  const handleVerify = async () => {
    setMessage('');
    setError('');
    if (otp.length !== 6) {
      setError('กรุณากรอกรหัสให้ครบ 6 หลัก');
      return;
    }
    try {
      const res = await fetch('/api/register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpToken: token, otp }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || 'ยืนยันสำเร็จ');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch {
      setError('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>ยืนยันรหัส OTP ทางอีเมล</h1>
        <p className={styles.desc}>
          เราได้ส่งรหัสยืนยัน (รหัส OTP) ไปยังอีเมลของคุณที่ลงทะเบียนไว้ กรุณากรอกรหัส 6 หลัก
          จากอีเมลเพื่อยืนยันตัวตนและดำเนินการต่อ
        </p>
        <p className={styles.emailMuted}>{displayedEmail}</p>

        <div className={styles.otpRow} onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={d}
              onChange={(e) => onChangeDigit(e.target.value, i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={styles.otpInput}
              aria-label={`OTP digit ${i + 1}`}
            />
          ))}
        </div>

        <button className={styles.button} onClick={handleVerify}>
          ยืนยัน OTP
        </button>

        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
