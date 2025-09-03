'use client';

import { useRouter } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const barsBtnRef = useRef<HTMLButtonElement>(null);

  // ปิดเมนูเมื่อคลิกข้างนอก
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ปิดเมนูเมื่อกด ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <nav className="w-full h-16 bg-black text-white flex items-center justify-between px-6">
      {/* ซ้าย: โลโก้ + เมนู */}
      <div className="flex items-center space-x-8">
        <div className="cursor-pointer select-none" onClick={() => router.push('/')}>
          <Image src="/logo.png" alt="T Double Logo" width={120} height={40} priority />
        </div>

        <div className="hidden md:flex space-x-6 text-sm">
          <button onClick={() => router.push('/')} className="hover:underline focus:outline-none">HOME</button>
          <button onClick={() => router.push('/tee')} className="hover:underline focus:outline-none">TEE</button>
          <button onClick={() => router.push('/sweats')} className="hover:underline focus:outline-none">SWEATS</button>
          <button onClick={() => router.push('/HOW-TO-CARE')} className="hover:underline focus:outline-none">HOW TO CARE</button>
        </div>
      </div>

      {/* ขวา: ไอคอน + เมนู (คงที่ ไม่เลื่อน) */}
      <div ref={ref} className="relative flex items-center gap-6">
        {/* ล็อกขนาดไอคอนให้คงที่ ป้องกัน layout shift */}
        <button
          className="w-5 h-5 flex items-center justify-center focus:outline-none"
          onClick={() => router.push('/profile')}
          aria-label="Profile"
        >
          <FaUserCircle className="w-5 h-5" />
        </button>

        <button
          className="w-5 h-5 flex items-center justify-center focus:outline-none"
          onClick={() => router.push('/cart')}
          aria-label="Cart"
        >
          <FaShoppingCart className="w-5 h-5" />
        </button>

        {/* ปุ่ม 3 ขีด */}
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

        {/* Dropdown: วางแบบ absolute นอก flow => ไอคอนไม่ขยับ */}
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
            onClick={() => { router.push('/Special-Size'); setOpen(false); }}
            role="menuitem"
          >
            SPECIAL SIZE
          </button>

          <button
            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            onClick={() => { router.push('/HOW-TO-CARE'); setOpen(false); }}
            role="menuitem"
          >
            HOW TO CARE
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
            LOGOUT
          </button>
        </div>
      </div>
    </nav>
  );
}
