// src/app/(website)/product/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import styles from './product.module.css';
import { useParams, useRouter } from 'next/navigation';

type SizeKey = 'S' | 'M' | 'L' | 'XL';

// ใช้ DTO ให้ตรงกับ API (รองรับ price เป็น number หรือ object รายไซส์)
type ProductDTO = {
  id: string | number;
  name: string;
  price?: number | Partial<Record<SizeKey, number | string>>;
  imageUrls?: string[];
  description?: string;
  stock?: Partial<Record<SizeKey, number | string>>;
};

const toInt = (v: unknown) => {
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

// ราคาเริ่ม (min จากทุกไซส์) หรือ number เดียว
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

// ราคาเฉพาะไซส์
const getPriceForSize = (price: ProductDTO['price'], size: SizeKey): number | null => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (price && typeof price === 'object') {
    const n = toFiniteNumber((price as Record<string, unknown>)[size]);
    return n;
  }
  return null;
};

const formatTHB = (n: number) => {
  try {
    return new Intl.NumberFormat('th-TH').format(n);
  } catch {
    return n.toLocaleString();
  }
};

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // รูปเดียวเลื่อนซ้าย/ขวา
  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/products/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data: unknown = await res.json();

        const picked: ProductDTO | null = Array.isArray(data)
          ? (data.find((p: ProductDTO) => String(p?.id) === String(id)) ?? null)
          : (data as ProductDTO);

        if (!picked) throw new Error('ไม่พบสินค้าที่ต้องการ');
        setItem(picked);
        setIdx(0);
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
          <div className="text-red-600 mb-4">❌ {err ?? 'ไม่พบสินค้า'} </div>
          <button className="px-4 py-2 bg-black text-white rounded" onClick={() => router.push('/')}>
            กลับหน้าหลัก
          </button>
        </div>
      </>
    );
  }

  const imgs = item.imageUrls?.length ? item.imageUrls : ['/placeholder.png'];
  const totalStock =
    toInt(item.stock?.S) + toInt(item.stock?.M) + toInt(item.stock?.L) + toInt(item.stock?.XL);
  const isOut = totalStock <= 0;

  const startPrice = getDisplayPrice(item.price);

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.main}>
          {/* ช่องรูปเดียว (คลิกซ้าย/ขวา เพื่อเปลี่ยนรูป) */}
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

          {/* รายละเอียดสินค้า */}
          <div className={styles.detailColumn}>
            <h2 className={styles.title}>{item.name}</h2>

            {/* ราคาเริ่มต้น (min จากทุกไซส์) */}
            <p className={styles.price}>
              ราคาเริ่ม: {startPrice !== null ? `฿${formatTHB(startPrice)}` : '-'}
            </p>

            {/* แสดงราคา/คงเหลือ ของแต่ละไซส์ */}
            <div className={styles.sizeSection}>
              <p>ขนาด</p>
              <div className={styles.options}>
                {(['S', 'M', 'L', 'XL'] as SizeKey[]).map((sz) => {
                  const qty = toInt(item.stock?.[sz]);
                  const p = getPriceForSize(item.price, sz);
                  const disabled = qty <= 0;
                  return (
                    <span key={sz} className={disabled ? styles.disabled : ''}>
                      {sz} ({qty}){p !== null ? `  ฿${formatTHB(p)}` : ' – -'}
                    </span>
                  );
                })}
              </div>
            </div>

            {item.description && <p>{item.description}</p>}

            {/* ตารางรายละเอียดขนาด (นิ้ว) */}
            <div className={styles.sizeTable}>
              <p>รายละเอียดขนาด (นิ้ว)</p>
              <table>
                <thead>
                  <tr>
                    <th>SIZE</th><th>S</th><th>M</th><th>L</th><th>XL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>รอบอก</td><td>20</td><td>22</td><td>24</td><td>26</td>
                  </tr>
                  <tr>
                    <td>ความยาว</td><td>25</td><td>27</td><td>29</td><td>30</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* รูป size guide */}
            <Image src="/size-guide.png" alt="Size guide" width={320} height={220} className={styles.sizeGuide} />

            <div className={styles.actions}>
              <button className={styles.primary} disabled={isOut}>
                {isOut ? 'สินค้าหมด' : 'ซื้อเลย'}
              </button>
              <button className={styles.secondary} disabled={isOut}>
                เพิ่มลงในตะกร้า
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
