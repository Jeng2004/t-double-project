'use client';

import { useState } from 'react';
import NavbarAdmin from '../components/NavbarAdmin';
import Stock from '../components/stock';
import EditStock from '../components/editstock';

export default function StockAdminPage() {
  const [showEditStock, setShowEditStock] = useState(false);

  return (
    <>
      <NavbarAdmin />
      <Stock onEditClick={() => setShowEditStock(true)} />
      {showEditStock && <EditStock onClose={() => setShowEditStock(false)} />}
    </>
  );
}
