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

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/products/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: unknown = await res.json();

        const picked: ProductDTO | null = Array.isArray(data)
          ? (data.find((p: ProductDTO) => String((p as ProductDTO)?.id) === String(id)) ?? null)
          : (data as ProductDTO);

        if (!picked) throw new Error('ไม่พบสินค้าที่ต้องการ');
        setItem(picked);
        setIdx(0);

        const order: SizeKey[] = ['S', 'M', 'L', 'XL'];
        for (const s of order) {
          if (toInt(picked.stock?.[s]) > 0) {
            setSelectedSize(s);
            break;
          }
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'โหลดสินค้าล้มเหลว');
      } finally {
        setLoading(false);
      }
    };
    load();
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
      if (!res.ok) throw new Error(await res.text());
      alert('เพิ่มสินค้าลงตะกร้าเรียบร้อย');
      setQty(1);
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

            {/* ปุ่มไซส์ (ไม่มีตัวเลือกสี) */}
            {/* ปุ่มไซส์ (ไม่มีตัวเลือกสี) */}
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
                      {/* ✅ แสดงเฉพาะไซซ์ */}
                      {sz}
                    </button>
                  );
                })}
              </div>

              {/* ✅ บรรทัดราคาใต้ไซซ์ (ตามไซซ์ที่เลือก) */}
              <p className={styles.selectedPrice}>
                ราคา: {
                  selectedSize
                    ? (getPriceForSize(item.price, selectedSize) != null
                        ? `฿${formatTHB(getPriceForSize(item.price, selectedSize)!)}`
                        : '-')
                    : (startPrice != null ? `฿${formatTHB(startPrice)}` : '-')
                }
              </p>
            </div>


            {/* จำนวน */}
            <div className={styles.qtyRow}>
              <span>จำนวน:</span>
              <div className={styles.quantityBox}>
                <button type="button" onClick={decQty} disabled={!selectedSize || selectedAvailable <= 0 || qty <= 1}>−</button>
                <span>{qty}</span>
                <button type="button" onClick={incQty} disabled={!selectedSize || selectedAvailable <= 0 || qty >= selectedAvailable}>+</button>
              </div>
              {selectedSize && (
                <span className={styles.qtyHint}>คงเหลือ {selectedAvailable} ชิ้น (ไซส์ {selectedSize})</span>
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

              {/* ✅ ย้ายรูปมาไว้ข้างล่างแทน */}
              <Image
                src="/size-guide.png"
                alt="Size guide"
                width={520}
                height={360}
                className={styles.sizeGuideBottom}
                priority
              />
            </Accordion>



            <div className={styles.actions}>
              <button className={styles.primary} disabled={!selectedSize || selectedAvailable <= 0 || submitting || isOutAll}>
                ซื้อเลย
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
