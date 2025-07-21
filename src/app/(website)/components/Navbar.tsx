'use client';

import { useRouter } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';

export default function Navbar() {
  const router = useRouter();

  return (
    <nav className="w-full h-16 bg-black text-white flex items-center justify-between px-6">
      {/* โลโก้ + เมนูฝั่งซ้าย */}
      <div className="flex items-center space-x-8">
        <div className="text-xl font-bold cursor-pointer" onClick={() => router.push('/')}>
          T Double
        </div>

        <div className="hidden md:flex space-x-6 text-sm">
          <button
            onClick={() => router.push('/')}
            className="hover:underline focus:outline-none">
            HOME
          </button>

          <button
            onClick={() => router.push('/tee')}
            className="hover:underline focus:outline-none">
            TEE
          </button>

                    <button
            onClick={() => router.push('/sweats')}
            className="hover:underline focus:outline-none">
            SWEATS
          </button>

        </div>
      </div>


      {/* ไอคอนฝั่งขวา */}
      <div className="flex items-center space-x-6 text-lg">
        <FaUserCircle
          className="cursor-pointer"
          onClick={() => router.push('/profile')}
        />
        <FaShoppingCart
          className="cursor-pointer"
          onClick={() => router.push('/cart')}
        />
        <FaBars className="cursor-pointer" />
      </div>
    </nav>
  );
}
