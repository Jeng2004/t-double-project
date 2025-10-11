// src/app/(website)/product/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import Navbar2 from '../../components/Navbar2';
import styles from './product.module.css';
import { useParams, useRouter } from 'next/navigation';
import { getUserIdForFrontend } from '@/lib/get-user-id';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

type ProductDTO = {
  id: string | number;
  name: string;
  price?: number | Partial<Record<SizeKey, number | string>>;
  imageUrls?: string[];
  description?: string;
  stock?: Partial<Record<SizeKey, number | string>>;
  category?: string | null;
};

const toInt = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const getDisplayPrice = (price: ProductDTO['price']): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (price && typeof price === 'object') {
    const keys: SizeKey[] = ['S', 'M', 'L', 'XL'];
    const nums = keys
      .map((k) => toFiniteNumber((price as Record<string, unknown>)[k]))
      .filter((v): v is number => v !== null);
    if (nums.length) return Math.min(...nums);
  }
  return null;
};
const getPriceForSize = (price: ProductDTO['price'], size: SizeKey): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (price && typeof price === 'object') {
    const n = toFiniteNumber((price as Record<string, unknown>)[size]);
    return n;
  }
  return null;
};
const formatTHB = (n: number): string => {
  try { return new Intl.NumberFormat('th-TH').format(n); } catch { return n.toLocaleString(); }
};

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${styles.accordion} ${open ? styles.open : ''}`}>
      <button
        type="button"
        className={styles.accordionHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className={styles.accordionCaret} aria-hidden>▾</span>
      </button>
      <div className={styles.accordionContent}>
        <div className={styles.accordionInner}>{children}</div>
      </div>
    </div>
  );
}

// ✅ เลือกแสดง size guide ตามหมวดหมู่
function pickGuides(category?: string | null): { showGuide1: boolean; showGuide2: boolean } {
  const c = (category ?? '').toLowerCase().trim();
  const isTee = c.includes('เสื้อยืด') || c.includes('t-shirt') || c.includes('tshirt') || c.includes('tee');
  const isLong = c.includes('เสื้อแขนยาว') || c.includes('long sleeve') || c.includes('long-sleeve');

  if (isTee && !isLong) return { showGuide1: true, showGuide2: false };
  if (isLong && !isTee) return { showGuide1: false, showGuide2: true };
  return { showGuide1: true, showGuide2: true };
}

export default function ProductDetailsPage() {
  const router = useRouter();

  // 🔧 FIX: อ่าน params แบบปลอดภัย (กัน null)
  const params = useParams();
  const id: string | null = (params as { id?: string } | null)?.id ?? null;

  const [item, setItem] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // ---------------- Local-stock adjustments (sessionStorage) ----------------
  const LOCAL_STOCK_KEY = 'localStockAdjustments_v1'; // { [productId]: { S: number, M: number, ... } }

  function readLocalStockAdjustments(): Record<string, Partial<Record<SizeKey, number>>> {
    try {
      const raw = sessionStorage.getItem(LOCAL_STOCK_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function writeLocalStockAdjustments(obj: Record<string, Partial<Record<SizeKey, number>>>) {
    try {
      sessionStorage.setItem(LOCAL_STOCK_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  // delta is positive number of items consumed (we subtract consumed from server stock)
  function addLocalStockDelta(productId: string, size: SizeKey, delta: number) {
    try {
      const store = readLocalStockAdjustments();
      const prev = store[productId] ?? {};
      const prevVal = Number.isFinite(Number(prev[size])) ? Number(prev[size]) : 0;
      prev[size] = prevVal + delta;
      store[productId] = prev;
      writeLocalStockAdjustments(store);
    } catch {
      // ignore
    }
  }

  function applyAdjustmentsToStock(productId: string, stock?: Partial<Record<SizeKey, number | string>>) {
    const base: Record<SizeKey, number> = {
      S: toInt(stock?.S),
      M: toInt(stock?.M),
      L: toInt(stock?.L),
      XL: toInt(stock?.XL),
    };
    const store = readLocalStockAdjustments();
    const delta = store[productId] ?? {};
    (['S','M','L','XL'] as SizeKey[]).forEach((sz) => {
      const consumed = Number.isFinite(Number(delta[sz])) ? Number(delta[sz]) : 0;
      base[sz] = Math.max(0, (base[sz] || 0) - consumed);
    });
    return base;
  }

  function applyLocalAdjustmentsToItem(productId: string) {
    setItem((prev) => {
      if (!prev || String(prev.id) !== String(productId)) return prev;
      const newStock = applyAdjustmentsToStock(String(productId), prev.stock);
      return { ...prev, stock: newStock };
    });
  }

  function pickNextAvailableSizeFromStock(stock?: Partial<Record<SizeKey, number | string>>): SizeKey | null {
    const order: SizeKey[] = ['S', 'M', 'L', 'XL'];
    if (!stock) return null;
    for (const s of order) {
      if (toInt(stock[s]) > 0) return s;
    }
    return null;
  }
  // -------------------------------------------------------------------------

  useEffect(() => {
    const pid = id;               // ← ผูกตัวแปรในสโคป effect
    if (!pid) {                   // ถ้าไม่มี id ก็หยุด
      setLoading(false);
      setErr('ไม่พบรหัสสินค้าใน URL');
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/products/${pid}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: unknown = await res.json();

        const picked: ProductDTO | null = Array.isArray(data)
          ? (data.find((p: ProductDTO) => String((p as ProductDTO)?.id) === String(pid)) ?? null)
          : (data as ProductDTO);

        if (!picked) throw new Error('ไม่พบสินค้าที่ต้องการ');

        // นำ local adjustments มาปรับ stock ก่อนตั้ง state เพื่อให้การเลือกไซส์อัตโนมัติใช้ค่า adjusted
        const adjustedStock = applyAdjustmentsToStock(String(picked.id), picked.stock);
        const pickedWithAdjustedStock: ProductDTO = { ...picked, stock: adjustedStock };

        setItem(pickedWithAdjustedStock);
        setIdx(0);

        // auto เลือกไซส์แรกที่มีสต๊อก (จาก adjustedStock)
        const order: SizeKey[] = ['S', 'M', 'L', 'XL'];
        for (const s of order) {
          if (toInt(adjustedStock[s]) > 0) {
            setSelectedSize(s);
            break;
          }
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const prev = (len: number) => setIdx((i) => (i - 1 + len) % len);
  const next = (len: number) => setIdx((i) => (i + 1) % len);

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!item) return;
    const len = item.imageUrls?.length ?? 0;
    if (len <= 1) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    const midX = bounds ? bounds.left + bounds.width / 2 : e.currentTarget.clientWidth / 2;
    const clickX = e.clientX;
    if (clickX < midX) prev(len);
    else next(len);
  };
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!item) return;
    const len = item.imageUrls?.length ?? 0;
    if (len <= 1) return;
    if (e.key === 'ArrowLeft') prev(len);
    if (e.key === 'ArrowRight') next(len);
    if (e.key === 'Enter' || e.key === ' ') next(len);
  };

  const startPrice = getDisplayPrice(item?.price);
  const selectedPrice = selectedSize ? getPriceForSize(item?.price, selectedSize) : null;
  const selectedAvailable = selectedSize ? toInt(item?.stock?.[selectedSize]) : 0;
  const isOutAll =
    toInt(item?.stock?.S) + toInt(item?.stock?.M) + toInt(item?.stock?.L) + toInt(item?.stock?.XL) <= 0;

  const decQty = () => setQty((q) => Math.max(1, q - 1));
  const incQty = () => setQty((q) => Math.min(selectedAvailable || 1, q + 1));

  const routerToPayment = useRouter();

  const handleBuyNow = async () => {
    if (!item || !selectedSize) return alert('กรุณาเลือกขนาดก่อน');
    const available = selectedAvailable;
    if (available <= 0) return alert('สินค้าหมดในไซส์นี้');
    if (qty < 1) return alert('จำนวนอย่างน้อย 1 ชิ้น');
    if (qty > available) return alert(`คงเหลือ ${available} ชิ้นในไซส์ ${selectedSize}`);

    const unit = getPriceForSize(item.price, selectedSize);
    if (unit == null || !Number.isFinite(unit)) {
      return alert(`ไม่พบราคาไซส์ ${selectedSize}`);
    }
    const unitPrice = Number(unit);
    const totalPrice = unitPrice * qty;

    try {
      setSubmitting(true);
      const userId = getUserIdForFrontend();
      if (!userId) {
        alert('กรุณาเข้าสู่ระบบก่อนซื้อสินค้า');
        return;
      }

      const payload = [
        {
          productId: String(item.id),
          size: selectedSize,
          quantity: qty,
          price: unitPrice,
          unitPrice,
          totalPrice,
          productName: item.name,
          image: (item.imageUrls && item.imageUrls[0]) || '/placeholder.png',
        },
      ];
      sessionStorage.setItem('buy-now-items', JSON.stringify(payload));

      routerToPayment.push('/payment?mode=buy-now');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดระหว่าง “ซื้อเลย”');
    } finally {
      setSubmitting(false);
    }
  };

  // แทนที่ handleAddToCart เดิมทั้งก้อนด้วยอันนี้
  const handleAddToCart = async () => {
    if (!item || !selectedSize) return alert('กรุณาเลือกขนาดก่อน');
    const available = selectedAvailable;
    if (available <= 0) return alert('สินค้าหมดในไซส์นี้');
    if (qty < 1) return alert('จำนวนอย่างน้อย 1 ชิ้น');
    if (qty > available) return alert(`คงเหลือ ${available} ชิ้นในไซส์ ${selectedSize}`);

    const unit = getPriceForSize(item.price, selectedSize);
    if (unit == null) return alert(`ไม่พบราคาไซส์ ${selectedSize}`);

    try {
      setSubmitting(true);
      const userId = getUserIdForFrontend();
      if (!userId) {
        alert('กรุณาเข้าสู่ระบบก่อนซื้อสินค้า');
        return;
      }

      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          productId: String(item.id),
          quantity: qty,
          size: selectedSize,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'ไม่สามารถเพิ่มลงตะกร้าได้');
      }

      // แจ้ง Navbar ให้เด้ง badge และ sync ข้ามแท็บ
      window.dispatchEvent(new CustomEvent('cart:inc', { detail: { delta: qty } }));
      try { localStorage.setItem('cart:lastUpdate', String(Date.now())); } catch {}

      alert('เพิ่มสินค้าลงตะกร้าเรียบร้อย');

      // รีหน้าแรง ๆ ให้สต็อก/หน้าปัจจุบันโหลดใหม่ทั้งหมด
      window.location.reload();

      // (ถ้าอยากรีเฟรชแบบเบา ๆ แทน hard reload ใช้ router.refresh() ได้ แต่หน้า client-only อาจไม่ refetch)
      // router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ไม่สามารถเพิ่มลงตะกร้าได้');
    } finally {
      setSubmitting(false);
    }
  };


  if (loading) {
    return (
      <>
        <Navbar />
        <div className={styles.container}>กำลังโหลดสินค้า...</div>
      </>
    );
  }
  if (err || !item) {
    return (
      <>
        <Navbar />
        <div className={styles.container}>
          <div style={{ color: '#c00', marginBottom: 12 }}>❌ {err ?? 'ไม่พบสินค้า'}</div>
          <button className="px-4 py-2 bg-black text-white rounded" onClick={() => router.push('/')}>
            กลับหน้าหลัก
          </button>
        </div>
      </>
    );
  }

  const imgs = item.imageUrls?.length ? item.imageUrls : ['/placeholder.png'];
  const { showGuide1, showGuide2 } = pickGuides(item.category);

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.main}>
          {/* ช่องรูป */}
          <div
            className={`${styles.imageColumn} ${styles.imageStage}`}
            ref={stageRef}
            onClick={handleStageClick}
            onKeyDown={handleKey}
            role="button"
            tabIndex={0}
            aria-label="สลับรูปสินค้า คลิกซ้าย/ขวาหรือใช้ลูกศรซ้ายขวา"
            title={imgs.length > 1 ? 'คลิกซ้าย=รูปก่อนหน้า / คลิกขวา=รูปถัดไป' : 'มีเพียงรูปเดียว'}
          >
            <Image
              key={idx}
              src={imgs[idx]!}
              alt={item.name || 'product image'}
              width={400}
              height={400}
              draggable={false}
              className={styles.stageImage}
            />
            {imgs.length > 1 && (
              <>
                <div className={`${styles.hit} ${styles.hitLeft}`} aria-hidden />
                <div className={`${styles.hit} ${styles.hitRight}`} aria-hidden />
              </>
            )}
          </div>

          {/* รายละเอียด */}
          <div className={styles.detailColumn}>
            <h2 className={styles.title}>{item.name}</h2>

            {/* ปุ่มไซส์ */}
            <div className={styles.sizeSection}>
              <p>ขนาด</p>
              <div className={styles.options}>
                {(['S', 'M', 'L', 'XL'] as SizeKey[]).map((sz) => {
                  const qtyLeft = toInt(item.stock?.[sz]);
                  const price = getPriceForSize(item.price, sz);
                  const disabled = qtyLeft <= 0 || price == null;
                  const active = selectedSize === sz;

                  return (
                    <button
                      key={sz}
                      type="button"
                      className={`${styles.sizeBtn} ${active ? styles.sizeBtnActive : ''}`}
                      disabled={disabled}
                      onClick={() => { setSelectedSize(sz); setQty(1); }}
                      title={disabled ? 'หมดหรือไม่มีราคา' : `ไซซ์ ${sz}`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>

              {/* ราคาใต้ไซส์ */}
              <p className={styles.selectedPrice}>
                ราคา:{' '}
                {selectedSize
                  ? (getPriceForSize(item.price, selectedSize) != null
                      ? `฿${formatTHB(getPriceForSize(item.price, selectedSize)!)}`
                      : '-')
                  : (getDisplayPrice(item.price) != null ? `฿${formatTHB(getDisplayPrice(item.price)!)}` : '-')}
              </p>
            </div>

            {/* จำนวน */}
            <div className={styles.qtyRow}>
              <span>จำนวน:</span>
              <div className={styles.quantityBox}>
                <button
                  type="button"
                  onClick={decQty}
                  disabled={!selectedSize || selectedAvailable <= 0 || qty <= 1}
                >
                  −
                </button>
                <span>{qty}</span>
                <button
                  type="button"
                  onClick={incQty}
                  disabled={!selectedSize || selectedAvailable <= 0 || qty >= selectedAvailable}
                >
                  +
                </button>
              </div>
              {selectedSize && (
                <span className={styles.qtyHint}>
                  คงเหลือ {selectedAvailable} ชิ้น (ไซส์ {selectedSize})
                </span>
              )}
            </div>

            {/* Accordion: รายละเอียดสินค้า */}
            <Accordion title="รายละเอียดสินค้า" defaultOpen>
              <div className={styles.productDetailText}>
                {item.description && item.description.trim().length > 0
                  ? item.description
                  : 'ไม่มีรายละเอียดสินค้า'}
              </div>
            </Accordion>

            {/* Accordion: รายละเอียดขนาด (นิ้ว) */}
            <Accordion title="รายละเอียดขนาด (นิ้ว)">
              <div className={styles.sizeTable}>
                <table>
                  <thead>
                    <tr>
                      <th>SIZE</th><th>S</th><th>M</th><th>L</th><th>XL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>รอบอก</td><td>20</td><td>22</td><td>24</td><td>26</td></tr>
                    <tr><td>ความยาว</td><td>25</td><td>27</td><td>29</td><td>30</td></tr>
                  </tbody>
                </table>
              </div>

              {/* ✅ แสดง size guide ตามหมวดหมู่ */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                {pickGuides(item.category).showGuide1 && (
                  <Image
                    src="/size-guide.png"
                    alt="Size guide (เสื้อยืด)"
                    width={520}
                    height={360}
                    className={styles.sizeGuideBottom}
                    priority
                  />
                )}
                {pickGuides(item.category).showGuide2 && (
                  <Image
                    src="/size-guide2.png"
                    alt="Size guide (เสื้อแขนยาว)"
                    width={520}
                    height={360}
                    className={styles.sizeGuideBottom}
                    priority
                  />
                )}
              </div>
            </Accordion>

            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={!selectedSize || selectedAvailable <= 0 || submitting || isOutAll}
                onClick={handleBuyNow}
              >
                {isOutAll ? 'สินค้าหมด' : submitting ? 'กำลังไปหน้าเลือกชำระเงิน…' : 'ซื้อเลย'}
              </button>
              <button
                className={styles.secondary}
                disabled={!selectedSize || selectedAvailable <= 0 || submitting || isOutAll}
                onClick={handleAddToCart}
              >
                {isOutAll ? 'สินค้าหมด' : submitting ? 'กำลังเพิ่ม…' : 'เพิ่มลงในตะกร้า'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <Navbar2 />
    </>
  );
}
