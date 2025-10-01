'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentCancelPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('กำลังยกเลิกคำสั่งซื้อที่ยังไม่ชำระ…');

  useEffect(() => {
    (async () => {
      try {
        const orderId = sessionStorage.getItem('pending-order-id');
        if (!orderId) {
          setMsg('ไม่พบหมายเลขออเดอร์ที่รอชำระ (pending-order-id)');
          return;
        }

        // ✅ เปลี่ยนสถานะเป็น "ยกเลิก" ด้วย API เดิมของคุณ
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ยกเลิก' }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error((data && data.error) || 'ยกเลิกคำสั่งซื้อไม่สำเร็จ');

        sessionStorage.removeItem('pending-order-id');
        sessionStorage.removeItem('buy-now-items');

        setMsg('✅ ยกเลิกคำสั่งซื้อเรียบร้อย');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        setMsg(`❌ ${errMsg || 'ยกเลิกคำสั่งซื้อไม่สำเร็จ'}`);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>ยกเลิกการชำระเงิน</h1>
      <p>{msg}</p>
      <button onClick={() => router.push('/')} style={{ marginTop: 12 }}>
        กลับหน้าหลัก
      </button>
    </div>
  );
}
