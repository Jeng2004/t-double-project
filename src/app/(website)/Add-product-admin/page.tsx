'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Add-product-admin.module.css';
import NavbarAdmin from '../components/NavbarAdmin';
import Image from 'next/image';

type FormState = {
  name: string;
  description: string;
  category: string;
  stock_S: string;
  stock_M: string;
  stock_L: string;
  stock_XL: string;
  price_S: string;
  price_M: string;
  price_L: string;
  price_XL: string;
};

const SIZES = ['S', 'M', 'L', 'XL'] as const;

export default function AddProductAdminPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    category: '',
    stock_S: '',
    stock_M: '',
    stock_L: '',
    stock_XL: '',
    price_S: '',
    price_M: '',
    price_L: '',
    price_XL: '',
  });

  const [images, setImages] = useState<FileList | null>(null);
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toNum = (v: string) => Number(v || '0');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.name.trim()) return setMessage('กรุณาใส่ชื่อสินค้า');

    // ต้องมีราคาอย่างน้อย 1 ไซส์ > 0
    const priceValues = [form.price_S, form.price_M, form.price_L, form.price_XL].map(toNum);
    const hasAnyPrice = priceValues.some((n) => Number.isFinite(n) && n > 0);
    if (!hasAnyPrice) {
      return setMessage('กรุณาใส่ราคาอย่างน้อย 1 ไซส์ (> 0)');
    }

    if (!images || images.length === 0) {
      return setMessage('กรุณาอัปโหลดรูปอย่างน้อย 1 รูป');
    }
    if (images.length > 11) {
      return setMessage('อัปโหลดได้ไม่เกิน 11 รูป');
    }

    const formData = new FormData();
    formData.append('name', form.name.trim());
    formData.append('description', form.description || '');
    formData.append('category', form.category || '');

    // สต็อก
    formData.append('stock_S', form.stock_S || '0');
    formData.append('stock_M', form.stock_M || '0');
    formData.append('stock_L', form.stock_L || '0');
    formData.append('stock_XL', form.stock_XL || '0');

    // ราคา
    formData.append('price_S', form.price_S || '0');
    formData.append('price_M', form.price_M || '0');
    formData.append('price_L', form.price_L || '0');
    formData.append('price_XL', form.price_XL || '0');

    Array.from(images).forEach((file) => formData.append('image', file));

    try {
      setSubmitting(true);
      setMessage('กำลังอัปโหลด...');
      const res = await fetch('/api/products', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('✅ เพิ่มสินค้าเรียบร้อยแล้ว');
        setForm({
          name: '',
          description: '',
          category: '',
          stock_S: '',
          stock_M: '',
          stock_L: '',
          stock_XL: '',
          price_S: '',
          price_M: '',
          price_L: '',
          price_XL: '',
        });
        setImages(null);
        setCurrentImageIndex(0);
        setImagePreview((prev) => {
          prev.forEach((url) => URL.revokeObjectURL(url));
          return [];
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setMessage(`❌ ${data.error || 'ไม่สามารถเพิ่มสินค้าได้'}`);
      }
    } catch {
      setMessage('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setImagePreview((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });

    const urls = Array.from(files).map((file) => URL.createObjectURL(file));
    setImages(files);
    setImagePreview(urls);
    setCurrentImageIndex(0);
  };

  useEffect(() => {
    return () => {
      imagePreview.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreview]);

  // พรีวิว: คลิกซ้าย/ขวาเพื่อเปลี่ยน
  const prev = (len: number) => setCurrentImageIndex((i) => (i - 1 + len) % len);
  const next = (len: number) => setCurrentImageIndex((i) => (i + 1) % len);

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const len = imagePreview.length;
    if (len <= 1) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    const midX = bounds ? bounds.left + bounds.width / 2 : e.currentTarget.clientWidth / 2;
    if (e.clientX < midX) prev(len);
    else next(len);
  };

  const handleStageKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = imagePreview.length;
    if (len <= 1) return;
    if (e.key === 'ArrowLeft') prev(len);
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') next(len);
  };

  return (
    <>
      <NavbarAdmin />
      <div className={styles.container}>
        {/* ซ้าย: พรีวิวรูป */}
        <div className={styles.left}>
          {imagePreview.length > 0 && (
            <div
              className={styles.previewStage}
              ref={stageRef}
              onClick={handleStageClick}
              onKeyDown={handleStageKey}
              role="button"
              tabIndex={0}
              aria-label="พรีวิวรูปสินค้า: คลิกซีกซ้าย/ขวาเพื่อเปลี่ยนรูป"
              title={
                imagePreview.length > 1
                  ? 'คลิกซีกซ้าย=รูปก่อน / คลิกซีกขวา=รูปถัดไป'
                  : 'มีเพียงรูปเดียว'
              }
            >
              <Image
                src={imagePreview[currentImageIndex]}
                alt={`Preview ${currentImageIndex + 1} / ${imagePreview.length}`}
                className={styles.previewImage}
                draggable={false}
                width={420}              // ✅ ต้องใส่ width / height
                height={525}             // ✅ หรือใช้ aspect-ratio ใกล้เคียง
                priority={currentImageIndex === 0}   // โหลดภาพแรกเร็วขึ้น
              />
              {imagePreview.length > 1 && (
                <>
                  <div className={`${styles.hit} ${styles.hitLeft}`} aria-hidden />
                  <div className={`${styles.hit} ${styles.hitRight}`} aria-hidden />
                </>
              )}
            </div>
          )}
        </div>

        {/* ขวา: ฟอร์ม */}
        <div className={styles.right}>
          <h2 className={styles.title}>ADD PRODUCT</h2>
          <hr className={styles.line} />

          <form className={styles.form} onSubmit={handleUpload}>
            {/* ชื่อสินค้า */}
            <div className={styles.field}>
              <input
                type="text"
                name="name"
                className={styles.input}
                placeholder=" "
                value={form.name}
                onChange={handleChange}
                aria-label="ชื่อสินค้า"
                required
              />
              <label className={styles.label}>ชื่อสินค้า</label>
            </div>

            {/* หมวดหมู่ */}
            <div className={styles.field}>
              <input
                type="text"
                name="category"
                className={styles.input}
                placeholder=" "
                value={form.category}
                onChange={handleChange}
                aria-label="หมวดหมู่"
              />
              <label className={styles.label}>หมวดหมู่</label>
            </div>

            {/* อัปโหลดรูป */}
            <label className={styles.uploadBox}>
              <input
                ref={fileInputRef}
                type="file"
                className={styles.fileInput}
                multiple
                onChange={handleImageChange}
                aria-label="อัปโหลดรูปภาพสินค้า"
                accept="image/*"
              />
              <span>
                อัปโหลดรูป{images ? ` (${images.length} ไฟล์)` : ''}
              </span>
              <span className={styles.icon}>📤</span>
            </label>

            {/* ตารางกรอก Size / Price / Stock */}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZES.map((sz) => (
                    <tr key={sz}>
                      <td className={styles.cellCenter}>{sz}</td>
                      <td>
                        <input
                          type="number"
                          name={`price_${sz}`}
                          className={styles.input}
                          placeholder="0"
                          value={form[`price_${sz}` as keyof FormState]}
                          onChange={handleChange}
                          inputMode="decimal"
                          min={0}
                          step="any"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          name={`stock_${sz}`}
                          className={styles.input}
                          placeholder="0"
                          value={form[`stock_${sz}` as keyof FormState]}
                          onChange={handleChange}
                          inputMode="numeric"
                          min={0}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* รายละเอียดสินค้า */}
            <div className={styles.field}>
              <textarea
                name="description"
                className={`${styles.input} ${styles.textarea}`}
                placeholder=" "
                value={form.description}
                onChange={handleChange}
                aria-label="รายละเอียดสินค้า"
              />
              <label className={styles.label}>รายละเอียดสินค้า</label>
            </div>

            {message && (
              <p style={{ color: message.startsWith('✅') ? 'green' : 'red' }}>
                {message}
              </p>
            )}

            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
