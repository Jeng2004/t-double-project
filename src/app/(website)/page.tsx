'use client'; 

import Image from 'next/image';
import Navbar from './components/Navbar';
import Product from './components/product';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  return (
    <>
      <Navbar />
        {/* ✅ รูปแบนเนอร์ */}
        <div className="mb-10">
          <Image
            src="/home-bg.png"
            alt="Home Banner"
            width={1200}
            height={400}
            className="w-full h-auto object-cover"
          />
        </div>
      <div className="p-10">
        {/* ✅ หัวข้อสินค้าใหม่ */}
        <h2 className="text-xl font-semibold mb-6">สินค้าใหม่</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Product
            name="ASTRONAUT TEE"
            price={1200}
            imageUrl="/JOKER-TEE.png"
            isOutOfStock={true}
          />
          <Product
            name="JOKER TEE"
            price={1500}
            imageUrl="/JOKER-TEE.png"
            onClick={() => router.push('/product-details')}
          />
        </div>
      </div>
    </>
  );
}
