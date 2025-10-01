'use client';

import React, { use, useEffect } from 'react';
import Link from 'next/link';
import styles from './payment-success.module.css';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type CartListItem = { productId: string; size: string };

export default function PaymentSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ orderId?: string }>;
}) {
  // ✅ รองรับทั้ง /payment-success/[id] และ /success?orderId=
  const { id: sessionId } = use(params);
  const { orderId } = searchParams ? use(searchParams) : {};

  // ใช้ตัวไหนได้ก่อน (orderId จะมาก่อนถ้ามี)
  const identifier = orderId || sessionId;

  // ✅ ล้างตะกร้าแบบ fallback หลังจ่ายเงิน
  useEffect(() => {
    const cleanupCart = async () => {
      try {
        const userId = getUserIdForFrontend();
        if (!userId) return;

        const res = await fetch(`/api/cart?userId=${encodeURIComponent(userId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;

        const raw = (await res.json()) as unknown;
        if (!Array.isArray(raw) || raw.length === 0) return;

        const items = raw as CartListItem[];
        await Promise.allSettled(
          items.map((it) =>
            fetch('/api/cart', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, productId: it.productId, size: it.size }),
            })
          )
        );
      } catch (err) {
        console.error('❌ ล้างตะกร้าล้มเหลว:', err);
      }
    };

    cleanupCart();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.checkIcon}>✓</div>

      <h1 className={styles.title}>ชำระเงินสำเร็จ</h1>
      <p className={styles.subtitle}>
        ระบบได้รับการชำระเงินของคุณแล้ว ขอบคุณที่อุดหนุน 💛
        <br />
        คุณสามารถติดตามสถานะคำสั่งซื้อได้ในหน้าโปรไฟล์
      </p>

      <div className={styles.session}>
        {orderId ? 'ORDER ID:' : 'SESSION:'}&nbsp;<span>{identifier || '-'}</span>
      </div>

      <div className={styles.actions}>
        <Link href="/profile" className={styles.primaryBtn}>
          ดูคำสั่งซื้อของฉัน
        </Link>
        <Link href="/" className={styles.secondaryBtn}>
          เลือกซื้อสินค้าต่อ
        </Link>
      </div>
    </div>
  );
}