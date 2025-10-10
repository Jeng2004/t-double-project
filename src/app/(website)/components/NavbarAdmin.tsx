'use client';

import { useRouter } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export default function NavbarAdmin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const barsBtnRef = useRef<HTMLButtonElement>(null);

  // ✅ ปิดเมนูเมื่อคลิกข้างนอก
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ✅ ปิดเมนูเมื่อกด ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <nav className="w-full h-16 bg-black text-white flex items-center justify-between px-6">
      {/* โลโก้ + เมนูฝั่งซ้าย */}
      <div className="flex items-center space-x-8">
        <div className="cursor-pointer" onClick={() => router.push('/Order-admin')}>
          <Image src="/logo.png" alt="T Double Logo" width={120} height={40} priority />
        </div>

        <div className="hidden md:flex space-x-6 text-sm">
          <button onClick={() => router.push('/Order-admin')} className="hover:underline focus:outline-none">Order</button>
          <button onClick={() => router.push('/return_requests')} className="hover:underline focus:outline-none">Return_requests</button>
          <button onClick={() => router.push('/Special-admin')} className="hover:underline focus:outline-none">Special</button>
          <button onClick={() => router.push('/Special-return-admin')} className="hover:underline focus:outline-none">Special_return</button>
          <button onClick={() => router.push('/stock-admin')} className="hover:underline focus:outline-none">Products in stock</button>
          <button onClick={() => router.push('/Add-product-admin')} className="hover:underline focus:outline-none">Add product</button>
        </div>
      </div>

      {/* ไอคอนฝั่งขวา */}
      <div ref={ref} className="relative flex items-center gap-4">
        <FaUserCircle
          className="cursor-pointer w-5 h-5"
          onClick={() => router.push('/profile')}
          aria-label="Profile"
        />
        <FaShoppingCart
          className="cursor-pointer w-5 h-5"
          onClick={() => router.push('/cart')}
          aria-label="Cart"
        />

        {/* ✅ ปุ่ม 3 ขีด เหมือน Navbar หลัก */}
        <button
          ref={barsBtnRef}
          className="w-5 h-5 flex items-center justify-center focus:outline-none"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open menu"
        >
          <FaBars className="w-5 h-5" />
        </button>

        {/* ✅ Dropdown เมนู */}
        <div
          className={`
            absolute right-0 top-full mt-2 w-48 rounded-md bg-white text-black shadow-lg ring-1 ring-black/5
            origin-top-right transition
            ${open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'}
          `}
          role="menu"
        >
          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            onClick={() => { router.push('/Order-admin'); setOpen(false); }}
            role="menuitem"
          >
            📦 Order Admin
          </button>

          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            onClick={() => { router.push('/stock-admin'); setOpen(false); }}
            role="menuitem"
          >
            📊 Stock
          </button>

          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            onClick={() => { router.push('/Add-product-admin'); setOpen(false); }}
            role="menuitem"
          >
            ➕ Add Product
          </button>

          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            onClick={async () => {
              await fetch('/api/logout', { method: 'POST' });
              localStorage.removeItem('userId');
              window.location.href = '/login';
            }}
            role="menuitem"
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
