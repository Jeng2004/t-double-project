'use client';

import { useState } from 'react';
import NavbarAdmin from '../components/NavbarAdmin';
import Stock from '../components/stock';
import EditStock from '../components/editstock';
import type { UIProduct, SizeKey } from '@/types/product';

export default function StockAdminPage() {
  const [showEditStock, setShowEditStock] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<UIProduct | null>(null);

  const openEdit = (product: UIProduct) => {
    setSelectedProduct(product);
    setShowEditStock(true);
  };

  // ✅ เซฟ: ใช้ PUT + ส่งราคาแยกไซส์ (price_S/M/L/XL) เท่านั้น
  const handleSave = async (updated: {
    id: string;
    name: string;
    priceBySize: Record<SizeKey, number>;
    stock: Record<SizeKey, number>;
  }) => {
    try {
      const fd = new FormData();
      fd.append('name', updated.name);

      // อย่าส่ง 'price' เดี่ยว — ส่งรายไซส์เท่านั้น
      fd.append('price_S', String(updated.priceBySize.S ?? 0));
      fd.append('price_M', String(updated.priceBySize.M ?? 0));
      fd.append('price_L', String(updated.priceBySize.L ?? 0));
      fd.append('price_XL', String(updated.priceBySize.XL ?? 0));

      // สต็อก
      fd.append('stock_S', String(updated.stock.S ?? 0));
      fd.append('stock_M', String(updated.stock.M ?? 0));
      fd.append('stock_L', String(updated.stock.L ?? 0));
      fd.append('stock_XL', String(updated.stock.XL ?? 0));

      const res = await fetch(`/api/products/${updated.id}`, {
        method: 'PUT',           // ← ใช้ PUT เสมอ
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PUT ${res.status}: ${t}`);
      }

      // ปิด modal; ถ้าต้องการ refresh list อัตโนมัติ
      // อาจย้ายการ fetch products มาไว้ที่หน้านี้แล้วส่งลง Stock เป็น props
      setShowEditStock(false);
      console.log('✅ แก้ไขสำเร็จ');
    } catch (e) {
      console.error('❌ แก้ไขล้มเหลว', e);
      alert('แก้ไขไม่สำเร็จ: ' + (e as Error).message);
    }
  };

  const handleDeleteDone = (id: string) => {
    if (selectedProduct?.id === id) setShowEditStock(false);
  };

  return (
    <>
      <NavbarAdmin />
      <Stock onEditClick={openEdit} onDeleted={handleDeleteDone} />
      {showEditStock && selectedProduct && (
        <EditStock
          product={selectedProduct}
          onClose={() => setShowEditStock(false)}
          onSave={handleSave}   // ← ตอนนี้ EditStock จะส่ง priceBySize มาให้
        />
      )}
    </>
  );
}
