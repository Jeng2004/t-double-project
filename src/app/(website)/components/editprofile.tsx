// src/app/(website)/components/editprofile.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './editprofile.module.css';
import Image from 'next/image';

export default function EditProfile({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preview, setPreview] = useState<string>('/man-profile.avif');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const userId = localStorage.getItem('userId');
      if (!userId) return;
      const res = await fetch(`/api/profile?userId=${userId}`);
      const data = await res.json();
      setName(data.user?.name ?? '');
      setPhone(data.user?.phone ?? '');
      setEmail(data.user?.email ?? '');
      setPreview(data.user?.profileImage || '/man-profile.avif');
    };
    load();
  }, []);

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const url = URL.createObjectURL(f);
      setPreview(url);
    }
  };

  const handleSave = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return alert('ไม่พบ userId');

    try {
      setSaving(true);
      const form = new FormData();
      form.append('userId', userId);
      form.append('name', name);
      form.append('phone', phone);
      if (file) form.append('profileImage', file);

      const res = await fetch('/api/profile', { method: 'PATCH', body: form });
      if (!res.ok) throw new Error(await res.text());

      window.location.reload();
    } catch (err) {
      console.error('อัปเดตข้อมูลไม่สำเร็จ', err);
      alert('อัปเดตข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return alert('ไม่พบ userId');
    if (!confirm('ลบรูปโปรไฟล์ตอนนี้เลยใช่ไหม?')) return;

    try {
      setRemoving(true);
      const res = await fetch(`/api/profile?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());

      // รีเซ็ตสถานะฝั่งหน้าเว็บ
      setFile(null);
      setPreview('/man-profile.avif');
      // ถ้าต้องการรีเฟรชหน้า:
      // window.location.reload();
    } catch (err) {
      console.error('ลบรูปไม่สำเร็จ', err);
      alert('ลบรูปไม่สำเร็จ');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <div className={styles.header}>แก้ไขโปรไฟล์</div>

        <div className={styles.avatar}>
          <div onClick={onPickImage} className={styles.avatarPick}>
            <Image
              src={preview}
              alt="User"
              width={100}
              height={100}
              className={styles.avatarImg}
            />
            <div className={styles.avatarHint}>แตะเพื่ออัปโหลดรูป</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFileChange}
          />

          <button
            className={styles.deleteBtn}
            onClick={handleRemoveImage}
            disabled={removing}
          >
            {removing ? 'กำลังลบ...' : 'ลบรูปโปรไฟล์'}
          </button>
        </div>

        <div className={styles.field}>
          <label>ชื่อ</label>
          <input
            className={styles.textInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ใส่ชื่อ"
          />
        </div>

        <div className={styles.field}>
          <label>โทรศัพท์</label>
          <input
            className={styles.textInput}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="ใส่โทรศัพท์"
          />
        </div>

        <div className={styles.field}>
          <label>อีเมล</label>
          <div className={styles.readonlyBox}>{email}</div>
        </div>

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
