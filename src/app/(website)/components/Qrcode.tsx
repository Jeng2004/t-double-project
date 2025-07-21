'use client';

import { useState } from 'react';
import styles from './Qrcode.module.css';
import Image from 'next/image';

export default function Qrcode() {
    const [fileName, setFileName] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
        setFileName(file.name);
        }
    };

  return (
    <div className={styles.modal}>
      <h3 className={styles.title}>QR พร้อมเพย์</h3>
      <Image
        src="/Qrcode.jpg"
        alt="QR PromptPay"
        width={200}
        height={200}
        className={styles.qr}
      />

      <label className={styles.label}>อัปโหลดหลักฐานการโอน</label>

      <label htmlFor="fileUpload" className={styles.inputWrapper}>
        อัปโหลดรูปภาพ
        <input
          type="file"
          id="fileUpload"
          accept="image/*"
          className={styles.input}
          onChange={handleFileChange}
        />
      </label>

      {fileName && <p className={styles.fileName}>📄 {fileName}</p>}


      <button className={styles.submit}>บันทึกหลักฐานการโอน</button>
    </div>
  );
}
