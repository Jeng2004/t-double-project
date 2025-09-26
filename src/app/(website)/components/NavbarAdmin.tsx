'use client';

import { useRouter } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';
import Image from 'next/image'; // เพิ่มเข้ามา

export default function NavbarAdmin() {
  const router = useRouter();

  return (
    <nav className="w-full h-16 bg-black text-white flex items-center justify-between px-6">
      {/* โลโก้ + เมนูฝั่งซ้าย */}
      <div className="flex items-center space-x-8">
        <div className="cursor-pointer" onClick={() => router.push('/')}>
          <Image
            src="/logo.png"
            alt="T Double Logo"
            width={120}
            height={40}
            priority
          />
        </div>

        <div className="hidden md:flex space-x-6 text-sm">
          <button
            onClick={() => router.push('/Order-admin')}
            className="hover:underline focus:outline-none">
            Order
          </button>
          <button
            onClick={() => router.push('/return_requests')}
            className="hover:underline focus:outline-none">
            return_requests
          </button>
          <button
            onClick={() => router.push('/stock-admin')}
            className="hover:underline focus:outline-none">
            Products in stock
          </button>
          <button
            onClick={() => router.push('/Add-product-admin')}
            className="hover:underline focus:outline-none">
            Add product
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
