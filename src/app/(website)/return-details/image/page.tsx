'use client';

import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

export default function ReturnImagePage() {
  const params = useSearchParams();
  const src = params.get('src');

  if (!src) return <div style={{ padding: 40 }}>❌ ไม่พบรูป</div>;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '90vw',
          height: '90vh',
        }}
      >
        <Image
          src={src}
          alt="หลักฐาน"
          fill
          style={{
            objectFit: 'contain',
            borderRadius: '10px',
            boxShadow: '0 0 20px rgba(255,255,255,0.3)',
          }}
          sizes="(max-width: 768px) 100vw, 90vw"
        />
      </div>
    </div>
  );
}
