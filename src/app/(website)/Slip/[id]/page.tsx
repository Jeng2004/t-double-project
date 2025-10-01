'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Navbar2 from '../../components/Navbar2';
import styles from './Slip.module.css';

export default function SlipPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    const load = async () => {
      if (!id) return;
      setLoading(true);
      setErr(null);

      try {
        // 1) ลองดึงสลิปก่อน
        let res = await fetch(`/api/slip?orderId=${id}`, { cache: 'no-store' });

        // 2) ถ้าไม่มี ให้สั่งสร้างจาก POST แล้วลองดึงอีกครั้ง
        if (!res.ok) {
          const create = await fetch('/api/slip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: id }),
          });
          if (!create.ok) throw new Error('ไม่สามารถสร้างสลิปได้');

          res = await fetch(`/api/slip?orderId=${id}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('ไม่สามารถดึงสลิปได้');
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ไม่สามารถโหลดสลิปได้');
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>สลิปการชำระเงิน</h1>

          {loading ? (
            <div>กำลังโหลด…</div>
          ) : err ? (
            <div className={styles.error}>❌ {err}</div>
          ) : pdfUrl ? (
            <>
              <div className={styles.viewerWrap}>
                {/* object รองรับ PDF; มี iframe เป็น fallback */}
                <object data={pdfUrl} type="application/pdf" className={styles.viewer}>
                  <iframe src={pdfUrl} className={styles.viewer} />
                </object>
              </div>

              <div className={styles.actions}>
                <a className={styles.btnPrimary} href={pdfUrl} download={`slip-${id}.pdf`}>
                  ดาวน์โหลด PDF
                </a>
                <a className={styles.btnGhost} href={pdfUrl} target="_blank" rel="noreferrer">
                  เปิดในแท็บใหม่
                </a>
                <button className={styles.btnGhost} onClick={() => router.back()}>
                  ย้อนกลับ
                </button>
              </div>
            </>
          ) : (
            <div className={styles.error}>ไม่สามารถโหลดสลิปได้</div>
          )}
        </div>
      </div>
      <Navbar2 />
    </>
  );
}
