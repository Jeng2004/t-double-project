// src/types/product.ts

export type SizeKey = 'S' | 'M' | 'L' | 'XL';

/** ราคาต่อไซส์ (UI ใช้เป็น number ชัดเจน) */
export type PriceBySize = Partial<Record<SizeKey, number>>;

/** สต็อกต่อไซส์ (UI ใช้เป็น number ชัดเจน) */
export type StockBySize = Partial<Record<SizeKey, number>>;

/**
 * ✅ แบบที่มักได้มาจาก Prisma (price/stock เป็น JSON/unknown)
 * ใช้เวลารับจาก /api/products ตรง ๆ
 */
export type DBProduct = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrls?: string[];
  price?: unknown;              // Prisma Json
  stock?: unknown;              // Prisma Json
  createdAt?: string;
};

/**
 * ✅ แบบที่ใช้บน UI (แปลงแล้วเป็น number)
 * ใช้กับ component ส่วนใหญ่, ฟอร์มแก้ไข ฯลฯ
 */
export type UIProduct = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrls: string[];
  price: PriceBySize;
  stock: StockBySize;
};

/**
 * ✅ คง type เดิมไว้เพื่อไม่ให้โค้ดเก่าพัง
 * เพิ่ม category เข้าไปให้ใช้งานได้กับหน้า stock-admin
 * และเผื่อกรณี price ยังเป็นเลขเดี่ยว (ข้อมูลเก่า)
 */
export type Product = {
  id: string;
  name: string;
  description?: string | null;
  imageUrls: string[];
  category?: string | null;     // ← เพิ่มหมวดหมู่
  stock?: StockBySize;
  price: PriceBySize | number;  // เผื่อข้อมูลเก่าเป็นเลขเดี่ยว
};
