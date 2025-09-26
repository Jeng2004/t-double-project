// src/app/(website)/Special-Size/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Special-Size.module.css';
import Navbar from '../components/Navbar';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type PostBody = {
  userId?: string;
  email?: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  productType: string;
  model: string;
  quantity: number;
  sizeLabel: string;
  chest: number;
  length: number;
  notes?: string | null;
  status?: string;
};

type Mode = 'preset' | 'custom';

export default function SpecialSizePage() {
  const userId = typeof window !== 'undefined' ? getUserIdForFrontend() : '';

  // ฟอร์ม
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [address, setAddress]     = useState('');

  const [productType, setProductType] = useState('');
  const [model, setModel]             = useState('');
  const [quantity, setQuantity]       = useState<number | ''>('');

  const [mode, setMode]             = useState<Mode>('preset');
  const [presetSize, setPresetSize] = useState('2XL');
  const [chest, setChest]           = useState<number | ''>('');
  const [length, setLength]         = useState<number | ''>('');
  const [notes, setNotes]           = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage]       = useState<string | null>(null);

  // preload โปรไฟล์ (ถ้ามี userId)
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/profile?userId=${userId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (ignore) return;
        const fullName: string = data?.user?.name ?? '';
        setFirstName(fullName.split(' ')[0] ?? '');
        setLastName(fullName.split(' ').slice(1).join(' ') ?? '');
        setEmail(data?.user?.email ?? '');
        setPhone(data?.user?.phone ?? '');
        setAddress(data?.user?.address ?? '');
      } catch { /* ignore */ }
    };
    load();
    return () => { ignore = true; };
  }, [userId]);

  const sizeLabel = useMemo(() => (mode === 'preset' ? presetSize : 'custom'), [mode, presetSize]);

  const qtyNumber = typeof quantity === 'number' ? quantity : Number(quantity || 0);
  const validQty  = Number.isFinite(qtyNumber) && qtyNumber >= 10;

  // ✅ ผ่อนเงื่อนไข: ไม่บังคับอีเมลหรือ userId เพื่อให้ "กดส่ง" ได้ก่อน
  const canSubmit = useMemo(() => {
    const baseFilled =
      firstName.trim() &&
      lastName.trim() &&
      phone.trim() &&
      address.trim() &&
      productType.trim() &&
      model.trim() &&
      validQty;

    if (!baseFilled) return false;

    if (mode === 'preset') {
      return !!presetSize.trim();
    } else {
      const c = typeof chest === 'number' ? chest : Number(chest || 0);
      const l = typeof length === 'number' ? length : Number(length || 0);
      return c > 0 && l > 0;
    }
  }, [firstName, lastName, phone, address, productType, model, validQty, mode, presetSize, chest, length]);

  // แสดงเหตุผลที่ปุ่มยัง disabled (ช่วยดีบั๊ก)
  const disabledReason = useMemo(() => {
    if (!firstName.trim()) return 'กรอกชื่อ';
    if (!lastName.trim())  return 'กรอกนามสกุล';
    if (!phone.trim())     return 'กรอกเบอร์โทร';
    if (!address.trim())   return 'กรอกที่อยู่';
    if (!productType.trim()) return 'กรอกประเภทสินค้า';
    if (!model.trim())       return 'กรอกรุ่นสินค้า';
    if (!validQty)           return 'จำนวนขั้นต่ำ 10 ตัว';
    if (mode === 'preset' && !presetSize.trim()) return 'ระบุชื่อไซส์ (เช่น 2XL)';
    if (mode === 'custom') {
      const c = typeof chest === 'number' ? chest : Number(chest || 0);
      const l = typeof length === 'number' ? length : Number(length || 0);
      if (!(c > 0)) return 'ระบุรอบอก (นิ้ว)';
      if (!(l > 0)) return 'ระบุความยาว (นิ้ว)';
    }
    return '';
  }, [firstName, lastName, phone, address, productType, model, validQty, mode, presetSize, chest, length]);

  const resetForm = () => {
    setProductType('');
    setModel('');
    setQuantity('');
    setMode('preset');
    setPresetSize('2XL');
    setChest('');
    setLength('');
    setNotes('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // ✅ ตรวจเรื่องอีเมล/ผู้ใช้ตอนส่งจริง (ถ้าไม่มีทั้งสอง → เตือน)
    if (!userId && !email.trim()) {
      setMessage('❌ กรุณากรอกอีเมล หรือเข้าสู่ระบบก่อนส่งคำสั่งซื้อ');
      return;
    }

    if (!canSubmit) {
      setMessage(`❌ กรุณากรอกข้อมูลให้ครบถ้วน (${disabledReason || 'กรอกไม่ครบ'})`);
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);

      const c = typeof chest === 'number' ? chest : Number(chest || 0);
      const l = typeof length === 'number' ? length : Number(length || 0);

      const payload: PostBody = {
        userId: userId || undefined,
        email: email || undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        productType: productType.trim(),
        model: model.trim(),
        quantity: qtyNumber,
        sizeLabel,
        chest: mode === 'custom' ? c : c || 0,
        length: mode === 'custom' ? l : l || 0,
        notes: notes.trim() ? notes.trim() : undefined,
        status: 'pending',
      };

      const res = await fetch('/api/special-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data: { message?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || `ส่งคำสั่งซื้อไม่สำเร็จ (HTTP ${res.status})`);

      setMessage(data.message || '✅ ส่งคำสั่งซื้อสำเร็จ');
      resetForm();
    } catch (err) {
      setMessage(`❌ ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>แบบฟอร์มสั่ง Size พิเศษ</h1>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label>ชื่อ</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>นามสกุล</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label>เบอร์โทร</label>
                <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>อีเมล (ถ้าไม่ได้เข้าสู่ระบบ)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className={styles.field}>
              <label>ที่อยู่สำหรับจัดส่ง</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <h3 className={styles.sectionTitle}>รายละเอียดสินค้า</h3>
            <div className={styles.field}>
              <label>ประเภทสินค้า</label>
              <input value={productType} onChange={(e) => setProductType(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>รุ่นสินค้า</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>จำนวนที่ต้องการ (ขั้นต่ำ 10)</label>
              <input
                type="number"
                min={10}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <h3 className={styles.sectionTitle}>รายละเอียด Size</h3>
            <div className={styles.segment}>
              <label className={styles.radio}>
                <input type="radio" name="sizemode" checked={mode === 'preset'} onChange={() => setMode('preset')} />
                <span>เลือกลำดับ “ไซส์”</span>
              </label>
              <label className={styles.radio}>
                <input type="radio" name="sizemode" checked={mode === 'custom'} onChange={() => setMode('custom')} />
                <span>ระบุขนาดพิเศษเอง</span>
              </label>
            </div>

            {mode === 'preset' ? (
              <div className={styles.rowPreset}>
                <div className={styles.field}>
                  <label>Size (เช่น 2XL / 3XL / 5XL)</label>
                  <input value={presetSize} onChange={(e) => setPresetSize(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>รอบอก (นิ้ว)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={chest}
                    onChange={(e) => setChest(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label>ความยาว (นิ้ว)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label>รายละเอียด/หมายเหตุเพิ่มเติม</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className={styles.policy}>
              <div>การรับขั้นต่ำ 10 ตัวขึ้นไปสำหรับไซส์พิเศษ</div>
              <div>ระยะเวลาดำเนินการประมาณ 7–14 วัน</div>
              <div>โปรดตรวจสอบข้อมูลขนาดและรายละเอียดให้ครบถ้วนก่อนส่ง</div>
            </div>

            {message && (
              <div className={message.startsWith('✅') ? styles.msgOk : styles.msgErr}>{message}</div>
            )}
            {!canSubmit && !message && disabledReason && (
              <div className={styles.msgErr}>กรุณาแก้ไข: {disabledReason}</div>
            )}

            <div className={styles.actions}>
              <button type="submit" className={styles.submit} disabled={submitting || !canSubmit}>
                {submitting ? 'กำลังส่ง…' : 'ส่งคำสั่งซื้อ'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
