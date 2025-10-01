'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
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

  const submitSearch = () => {
    const q = term.trim();
    if (!q) return;
    router.push(`/Search-product?q=${encodeURIComponent(q)}&page=1`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitSearch();
  };

  return (
    <nav className="w-full h-16 bg-black text-white flex items-center justify-between px-6">
      {/* ซ้าย: โลโก้ + เมนู */}
      <div className="flex items-center space-x-8">
        <div className="cursor-pointer select-none" onClick={() => router.push('/')}>
          <Image src="/logo.png" alt="T Double Logo" width={120} height={40} priority />
        </div>

        <div className="hidden md:flex space-x-6 text-sm">
          <button onClick={() => router.push('/')} className="hover:underline focus:outline-none">HOME</button>
          <button onClick={() => router.push('/Special')} className="hover:underline focus:outline-none"></button>
          <button onClick={() => router.push('/T-shirt')} className="hover:underline focus:outline-none">T-shirt</button>
          <button onClick={() => router.push('/sweater')} className="hover:underline focus:outline-none">sweater</button>
        </div>
      </div>

      {/* ขวา: ช่องค้นหา + ไอคอน + เมนู */}
      <div ref={ref} className="relative flex items-center gap-4">
        {/* ช่องค้นหา */}
        <div className="hidden sm:flex items-center bg-white/10 rounded-md px-2 py-1">
          <input
            aria-label="Search products"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search product…"
            className="bg-transparent outline-none text-sm placeholder-white/60 w-44 md:w-60"
          />
          <button
            onClick={submitSearch}
            className="ml-2 text-xs bg-white text-black rounded px-2 py-1 font-bold"
          >
            Search
          </button>
        </div>

        {/* ไอคอนคงที่ */}
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

        {/* Dropdown */}
        <div
          className={`
            absolute right-0 top-full mt-2 w-48 rounded-md bg-white text-black shadow-lg ring-1 ring-black/5
            origin-top-right transition
            ${open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'}
          `}
          role="menu"
        >
          {/* ช่องค้นหา (เวอร์ชันมือถือในเมนู) */}
          <div className="sm:hidden p-2 border-b">
            <input
              aria-label="Search products"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search product…"
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <button
              onClick={submitSearch}
              className="mt-2 w-full text-sm bg-black text-white rounded px-2 py-2 font-bold"
            >
              Search
            </button>
          </div>

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
