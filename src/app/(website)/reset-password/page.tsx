'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './reset-password.module.css';

type Strength = 0 | 1 | 2 | 3 | 4;

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // ===== Password checks =====
  const rules = useMemo(() => {
    const len = newPassword.length >= 8;
    const lower = /[a-z]/.test(newPassword);
    const upper = /[A-Z]/.test(newPassword);
    const num = /[0-9]/.test(newPassword);
    const special = /[^A-Za-z0-9]/.test(newPassword);
    return { len, lower, upper, num, special };
  }, [newPassword]);

  const strength: Strength = useMemo(() => {
    let score = 0;
    if (rules.len) score++;
    if (rules.lower && rules.upper) score++;
    if (rules.num) score++;
    if (rules.special) score++;
    return score as Strength;
  }, [rules]);

  const strengthLabel = ['อ่อนมาก', 'อ่อน', 'ปานกลาง', 'ดี', 'แข็งแรง'][strength];
  const strengthClass = [
    styles.meterVeryWeak,
    styles.meterWeak,
    styles.meterMedium,
    styles.meterGood,
    styles.meterStrong,
  ][strength];

  const allPassed = rules.len && rules.lower && rules.upper && rules.num && rules.special;
  const match = newPassword !== '' && newPassword === confirmPassword;

  useEffect(() => {
    // เคลียร์ข้อความเมื่อแก้ไขอินพุต
    setError('');
    setMessage('');
  }, [newPassword, confirmPassword]);

  const handleReset = async () => {
    if (loading) return;
    setMessage('');
    setError('');

    if (!token) {
      setError('ลิงก์ไม่ถูกต้อง');
      return;
    }
    if (!allPassed) {
      setError('กรุณาตั้งรหัสผ่านให้ผ่านเงื่อนไขทั้งหมด');
      return;
    }
    if (!match) {
      setError('❌ รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/reset_password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || 'ตั้งรหัสผ่านใหม่เรียบร้อย');
        setTimeout(() => router.push('/login'), 1800);
      } else {
        setError(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch {
      setError('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleReset();
    }
  };

  return (
    <div className={styles.container} onKeyDown={onKeyDown}>
      <div className={styles.card}>
        <h1 className={styles.title}>ตั้งรหัสผ่านใหม่</h1>
        <p className={styles.subtitle}>
          สร้างรหัสผ่านที่ปลอดภัยเพื่อเข้าสู่ระบบต่อไป
        </p>

        {/* New password */}
        <label className={styles.label}>รหัสผ่านใหม่</label>
        <div className={styles.inputWrap}>
          <input
            type={showNew ? 'text' : 'password'}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            className={styles.input}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showNew ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>

        {/* Strength meter */}
        <div className={styles.meter}>
          <div className={`${styles.meterBar} ${strengthClass}`} style={{ width: `${(strength / 4) * 100}%` }} />
        </div>
        <div className={styles.meterLabel}>ความแข็งแรง: {strengthLabel}</div>

        {/* Rules checklist */}
        <ul className={styles.rules}>
          <li className={rules.len ? styles.pass : ''}>
            {rules.len ? '✓' : '•'} ยาวอย่างน้อย 8 ตัวอักษร
          </li>
          <li className={rules.lower && rules.upper ? styles.pass : ''}>
            {(rules.lower && rules.upper) ? '✓' : '•'} มีตัวพิมพ์เล็กและตัวพิมพ์ใหญ่
          </li>
          <li className={rules.num ? styles.pass : ''}>
            {rules.num ? '✓' : '•'} มีตัวเลขอย่างน้อย 1 ตัว
          </li>
          <li className={rules.special ? styles.pass : ''}>
            {rules.special ? '✓' : '•'} มีอักขระพิเศษอย่างน้อย 1 ตัว
          </li>
        </ul>

        {/* Confirm password */}
        <label className={styles.label}>ยืนยันรหัสผ่าน</label>
        <div className={styles.inputWrap}>
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="พิมพ์ซ้ำอีกครั้ง"
            className={`${styles.input} ${confirmPassword && !match ? styles.inputError : ''}`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showConfirm ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>
        {!match && confirmPassword && (
          <div className={styles.hint}>รหัสผ่านทั้งสองช่องต้องตรงกัน</div>
        )}

        {/* Messages */}
        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        {/* Submit */}
        <button
          className={styles.button}
          onClick={handleReset}
          disabled={!allPassed || !match || loading}
        >
          {loading ? 'กำลังตั้งรหัสผ่าน…' : 'ตั้งรหัสผ่านใหม่'}
        </button>
      </div>
    </div>
  );
}
