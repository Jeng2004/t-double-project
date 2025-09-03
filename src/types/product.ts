// src/types/product.ts
export type SizeKey = 'S' | 'M' | 'L' | 'XL';

export type Product = {
  id: string;
  name: string;
  description?: string;
  imageUrls: string[];
  stock?: Partial<Record<SizeKey, number>>;
  // ✅ ฝั่ง frontend เราจะมอง price เป็นรายไซส์
  price: Partial<Record<SizeKey, number>> | number; // เผื่อข้อมูลเก่าเป็นเลขเดี่ยว
};

export type UIProduct = Product;

