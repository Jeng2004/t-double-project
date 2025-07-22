'use client';

import styles from './editstock.module.css';
import { useState } from 'react';

interface EditStockProps {
  onClose: () => void;
}

export default function EditStock({ onClose }: EditStockProps) {
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [sizes, setSizes] = useState({
    S: '',
    M: '',
    L: '',
    XL: '',
  });
  const [image, setImage] = useState<File | null>(null);

  const handleSizeChange = (size: string, value: string) => {
    setSizes((prev) => ({
      ...prev,
      [size]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({
      productName,
      price,
      sizes,
      image,
    });
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <button className={styles.closeButton} onClick={onClose}>✕</button>
        <h2 className={styles.title}>เพิ่มสินค้า</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>ชื่อสินค้า</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
          />

          <label>ราคา</label>
          <div className={styles.priceInput}>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <span>฿</span>
          </div>

          <label>จำนวนในแต่ละขนาด</label>
          <div className={styles.sizeGrid}>
            {(['S', 'M', 'L', 'XL'] as const).map((size) => (
              <div key={size} className={styles.sizeItem}>
                <label>{size}</label>
                <input
                  type="number"
                  value={sizes[size]}
                  onChange={(e) => handleSizeChange(size, e.target.value)}
                  placeholder={`จำนวน size ${size}`}
                  min={0}
                />
              </div>
            ))}
          </div>

          <label>เพิ่มรูปภาพ</label>
          <div className={styles.uploadBox}>
            <input
              type="file"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              accept="image/*"
            />
          </div>

          <button type="submit" className={styles.submitButton}>บันทึก</button>
        </form>
      </div>
    </div>
  );
}
