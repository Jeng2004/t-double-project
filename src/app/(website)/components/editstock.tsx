'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// ให้การเปรียบเทียบชื่อ “แม่น” ขึ้น (กันเคสช่องว่าง/ตัวพิมพ์/ยูนิโค้ดผสม)
function normalizeName(s: string) {
  return s
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

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

  // เช็กชื่อซ้ำแบบ client (debounce)
  const [checking, setChecking] = useState(false);
  const [dupClient, setDupClient] = useState(false);

  // แสดงภาพเดิม (อ่านอย่างเดียว) — จะถูกแทนที่ก็ต่อเมื่อติ๊ก “แทนที่ภาพทั้งหมด”
  const existing = useMemo(() => initialImageUrls ?? [], [initialImageUrls]);

  const pickFiles = () => fileInputRef.current?.click();

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setNewFiles(files);
  };

  // 🔎 เช็กชื่อซ้ำล่วงหน้า (เรียก /api/products แล้วเทียบในฝั่ง client)
  useEffect(() => {
    if (!open) return;
    const target = normalizeName(name);
    const current = normalizeName(initialName);

    // ถ้าชื่อไม่เปลี่ยน/ว่าง → ไม่ต้องเช็ก
    if (!target || target === current) {
      setDupClient(false);
      return;
    }

    let cancel = false;
    const h = setTimeout(async () => {
      try {
        setChecking(true);
        setErr(null);

        // ดึงรายการสินค้า (พอสำหรับ compare)
        const res = await fetch('/api/products', { cache: 'no-store', credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: Array<{ id: string | number; name: string }> = await res.json();

        const clash = list.some((p) => String(p.id) !== String(id) && normalizeName(p.name) === target);
        if (!cancel) setDupClient(clash);
      } catch {
        // ถ้าเช็กไม่ได้ ก็ไม่บล็อก—ไปให้ backend ตัดสิน (เรายังกันที่ API อีกชั้น)
        if (!cancel) setDupClient(false);
      } finally {
        if (!cancel) setChecking(false);
      }
    }, 350); // debounce 350ms

    return () => { cancel = true; clearTimeout(h); };
  }, [name, initialName, id, open]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setErr(null);
      setOk(null);

      // ป้องกันกดบันทึกตอนชื่อซ้ำที่ตรวจเจอฝั่ง client
      if (!name.trim()) {
        setErr('กรุณากรอกชื่อสินค้า');
        setSaving(false);
        return;
      }
      if (dupClient) {
        setErr('ชื่อนี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่น');
        setSaving(false);
        return;
      }

      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('category', category.trim());

      if (replaceAllImages) {
        newFiles.forEach((f) => fd.append('image', f));
      }

      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: fd,
        credentials: 'include',
      });

      if (!res.ok) {
        // ✅ ดักสถานะชื่อซ้ำที่มาจาก API (กันชัวร์ชั้น backend)
        if (res.status === 409) {
          setErr('ชื่อนี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่น');
          return; // ไม่ปิดโมดัล
        }
        const t = await res.text();
        throw new Error(`PATCH ${res.status}: ${t}`);
      }

      setOk('บันทึกสำเร็จ');
      onSaved?.();
      onClose(); // ปิดโมดัลหลังเซฟสำเร็จเท่านั้น
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

  // สถานะ error ของช่องชื่อ (รวมทั้งกรณีตรวจเจอซ้ำใน client)
  const nameHasError =
    (!!err && /ชื่อ.*(ซ้ำ|ใช้แล้ว)/.test(err)) || dupClient;

  // ปิดปุ่มเมื่อ: กำลังเซฟ | ชื่อว่าง | กำลังเช็กชื่อ | พบชื่อซ้ำ
  const saveDisabled = saving || !name.trim() || checking || dupClient;

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
              aria-invalid={nameHasError}
              title={nameHasError ? 'ชื่อนี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่น' : undefined}
            />
            <div className={styles.helperRow}>
              {checking && <small className={styles.note}>กำลังตรวจสอบชื่อซ้ำ…</small>}
              {dupClient && !checking && (
                <small className={styles.errInline}>ชื่อนี้ถูกใช้แล้ว</small>
              )}
            </div>
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
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saveDisabled}>
            {saving ? 'กำลังบันทึก…' : dupClient ? 'ชื่อซ้ำ' : checking ? 'กำลังตรวจสอบ…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
