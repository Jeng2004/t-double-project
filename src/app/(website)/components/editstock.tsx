'use client';

import React, { useMemo, useRef, useState } from 'react';
import styles from './editstock.module.css';

type EditStockBasicProps = {
  id: string;
  initialName: string;
  initialCategory: string | null;
  initialImageUrls: string[];
  open: boolean;                     // ← ควบคุมการเปิด/ปิด โมดัล
  onClose: () => void;               // ← ปิดโมดัล
  onSaved?: () => void;              // ← callback หลังบันทึกสำเร็จ
};

export default function EditStockBasic({
  id,
  initialName,
  initialCategory,
  initialImageUrls,
  open,
  onClose,
  onSaved,
}: EditStockBasicProps) {
  const [name, setName] = useState(initialName || '');
  const [category, setCategory] = useState((initialCategory ?? '') || '');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [replaceAllImages, setReplaceAllImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // แสดงภาพเดิม (อ่านอย่างเดียว) — จะถูกแทนที่ก็ต่อเมื่อติ๊ก “แทนที่ภาพทั้งหมด”
  const existing = useMemo(() => initialImageUrls ?? [], [initialImageUrls]);

  const pickFiles = () => fileInputRef.current?.click();

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setNewFiles(files);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErr(null);
      setOk(null);

      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('category', category.trim());

      // แนวทาง “แบบเดิมของ API ที่คุณมีอยู่ตอนนี้”
      // - ถ้าส่ง field image (ไฟล์ใหม่อย่างน้อย 1 ไฟล์) → API จะตั้ง imageUrls = ไฟล์ชุดใหม่
      // - ถ้าไม่ส่ง field image → API จะคง imageUrls เดิม
      // ดังนั้นการ “ลบภาพเก่า” ทำได้โดยเลือก “แทนที่ภาพทั้งหมด” แล้วอัปโหลดไฟล์ชุดใหม่
      if (replaceAllImages) {
        newFiles.forEach((f) => fd.append('image', f));
      }

      // ใช้ PATCH สำหรับแก้เฉพาะส่วน (ชื่อ/หมวดหมู่/รูป) ให้เบากว่า PUT
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: fd,
        credentials: 'include',
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PATCH ${res.status}: ${t}`);
      }

      setOk('บันทึกสำเร็จ');
      onSaved?.();
      onClose(); // ปิดโมดัลหลังเซฟ
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // ปิดด้วยกด backdrop
  const onBackdropClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (ev.target === ev.currentTarget) onClose();
  };

  if (!open) return null;

  return (
    <div className={styles.backdrop} onMouseDown={onBackdropClick}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="edit-basic-title">
        <div className={styles.header}>
          <h3 id="edit-basic-title" className={styles.title}>แก้ไขข้อมูลพื้นฐาน</h3>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* ข้อความแจ้งผล */}
        {ok && <div className={styles.ok}>✅ {ok}</div>}
        {err && <div className={styles.err}>❌ {err}</div>}

        {/* ฟอร์ม */}
        <div className={styles.grid2}>
          <div>
            <label className={styles.label}>ชื่อสินค้า</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น Classic Tee"
            />
          </div>
          <div>
            <label className={styles.label}>หมวดหมู่</label>
            <input
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="เช่น T-Shirt"
            />
          </div>
        </div>

        {/* รูปเดิม */}
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <div>
              <div className={styles.blockTitle}>รูปปัจจุบัน</div>
              <div className={styles.note}>ภาพเดิมจะคงอยู่ ถ้าไม่ติ๊ก “แทนที่ภาพทั้งหมด”</div>
            </div>
          </div>

          {existing.length === 0 ? (
            <div className={styles.note}>— ยังไม่มีรูป —</div>
          ) : (
            <div className={styles.gallery}>
              {existing.map((url, i) => (
                <div className={styles.card} key={url + i}>
                  <div
                    className={styles.thumb}
                    style={{ backgroundImage: `url(${url})` }}
                    title={url}
                  />
                  <div className={styles.cardBar}>
                    <small className={styles.fileInfo}>{url.split('/').pop()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* อัปโหลดรูปใหม่ (ทางเลือก) */}
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <div>
              <div className={styles.blockTitle}>อัปโหลดรูปใหม่ (ถ้าต้องการ)</div>
              <div className={styles.note}>
                ติ๊ก <b>แทนที่ภาพทั้งหมด</b> แล้วเลือกไฟล์ เพื่อให้สินค้าใช้รูป “ชุดใหม่” แทนรูปเดิม
              </div>
            </div>
            <div className={styles.right}>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={replaceAllImages}
                  onChange={(e) => setReplaceAllImages(e.target.checked)}
                />
                <span>แทนที่ภาพทั้งหมด</span>
              </label>
              <button className={styles.btnGhost} onClick={pickFiles}>เลือกไฟล์…</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleFilesChange}
              />
            </div>
          </div>

          {replaceAllImages && newFiles.length > 0 && (
            <div className={styles.gallery}>
              {newFiles.map((f, idx) => (
                <div className={styles.card} key={idx}>
                  <div className={styles.thumbPreview}>
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className={styles.thumbImg}
                    />
                  </div>
                  <div className={styles.cardBar}>
                    <small className={styles.fileInfo}>{f.name}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ปุ่ม */}
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
