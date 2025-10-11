// src/app/(website)/components/Navbar.tsx
'use client';

import { useRouter } from 'next/navigation';
import { FaUserCircle, FaShoppingCart, FaBars } from 'react-icons/fa';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type ApiCartItem = { productId: string; size: string; quantity: number };

export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [pop, setPop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ------- utils --------
  const fetchCartCount = async () => {
    try {
      const userId = getUserIdForFrontend();
      if (!userId) { setCartCount(0); return; }
      const res = await fetch(`/api/cart?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('load cart fail');
      const items = (await res.json()) as ApiCartItem[];
      const total = Array.isArray(items) ? items.reduce((s, it) => s + (it.quantity ?? 0), 0) : 0;
      setCartCount(total);
    } catch { /* ignore */ }
  };

  // simple pop animation (ใช้ Tailwind transition + scale)
  const triggerPop = () => {
    setPop(true);
    setTimeout(() => setPop(false), 250);
  };

  // outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // initial + light polling
  useEffect(() => {
    fetchCartCount();
    const t = setInterval(fetchCartCount, 20000);
    return () => clearInterval(t);
  }, []);

  // cross-tab via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cart:lastUpdate') fetchCartCount();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ให้หน้าอื่นยิง event นี้ได้เพื่อเด้งแบบทันทีในแท็บเดียวกัน
  useEffect(() => {
    const onInc = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { delta?: number } | undefined;
      const add = Math.max(1, Number(detail?.delta ?? 1));
      setCartCount((c) => c + add);
      triggerPop();
      try { localStorage.setItem('cart:lastUpdate', String(Date.now())); } catch {}
    };
    window.addEventListener('cart:inc', onInc as EventListener);
    return () => window.removeEventListener('cart:inc', onInc as EventListener);
  }, []);

  // search
  const submitSearch = () => {
    const q = term.trim();
    if (!q) return;
    router.push(`/Search-product?q=${encodeURIComponent(q)}&page=1`);
    setOpen(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submitSearch(); };

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
          <button onClick={submitSearch} className="ml-2 text-xs bg-white text-black rounded px-2 py-1 font-bold">
            Search
          </button>
        </div>

        {/* โปรไฟล์ */}
        <button
          className="relative w-5 h-5 flex items-center justify-center focus:outline-none"
          onClick={() => router.push('/profile')}
          aria-label="Profile"
        >
          <FaUserCircle className="w-5 h-5" />
        </button>

        {/* ตะกร้า + badge + pop animation (transition+scale) */}
        <button
          className={`relative w-5 h-5 flex items-center justify-center focus:outline-none transform transition-transform duration-200 ${pop ? 'scale-125' : 'scale-100'}`}
          onClick={() => router.push('/cart')}
          aria-label="Cart"
        >
          <FaShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span
              aria-label={`Items in cart: ${cartCount}`}
              className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center select-none shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>

        {/* ปุ่ม 3 ขีด */}
        <button
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
          {/* ช่องค้นหา (มือถือ) */}
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
              try { localStorage.removeItem('userId'); } catch {}
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
