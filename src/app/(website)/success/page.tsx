'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SuccessRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const orderId = searchParams.get('orderId');
    const sessionId =
      searchParams.get('session_id') ||
      searchParams.get('sessionId') ||
      searchParams.get('id');

    if (orderId) {
      router.replace(
        `/payment-success/${encodeURIComponent(orderId)}?orderId=${encodeURIComponent(orderId)}`
      );
    } else if (sessionId) {
      router.replace(`/payment-success/${encodeURIComponent(sessionId)}`);
    } else {
      router.replace('/');
    }
  }, [router, searchParams]);

  // เผื่อเฟรมหนึ่งก่อน redirect
  return <div style={{ padding: 24 }}>กำลังพาไปหน้าสรุปการชำระเงิน…</div>;
}
