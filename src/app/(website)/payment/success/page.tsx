// src/app/(website)/payment/success/page.tsx
import { redirect } from 'next/navigation';

export default async function PaymentSuccessRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; orderId?: string }>;
}) {
  const { session_id, orderId } = await searchParams;

  if (session_id) {
    // ✅ redirect แบบเดิม (Stripe)
    redirect(`/payment-success/${encodeURIComponent(session_id)}`);
  }

  if (orderId) {
    // ✅ redirect ไปหน้า success ใหม่ ที่รองรับ orderId
    redirect(`/success?orderId=${encodeURIComponent(orderId)}`);
  }

  // ❌ ถ้าไม่มีทั้งคู่ กลับหน้าหลัก
  redirect('/');
}
