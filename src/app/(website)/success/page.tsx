// src/app/(website)/success/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SuccessRedirectPage() {
  const router = useRouter();

  // บางโปรเจ็กต์ตั้ง strict type จนมองว่าอาจเป็น null → แคสต์ให้ยอมรับได้
  const sp = useSearchParams() as URLSearchParams | null;

  // helper ปลอดภัยต่อ null
  const getParam = (key: string) => sp?.get(key) ?? null;

  useEffect(() => {
    const orderId = getParam('orderId');
    const sessionId =
      getParam('session_id') ||
      getParam('sessionId') ||
      getParam('id');

    if (orderId) {
      router.replace(
        `/payment-success/${encodeURIComponent(orderId)}?orderId=${encodeURIComponent(orderId)}`
      );
    } else if (sessionId) {
      router.replace(`/payment-success/${encodeURIComponent(sessionId)}`);
    } else {
      router.replace('/');
    }
  }, [router, sp]); // ใส่ sp แทน searchParams

  // เผื่อเฟรมหนึ่งก่อน redirect
  return <div style={{ padding: 24 }}>กำลังพาไปหน้าสรุปการชำระเงิน…</div>;
}
