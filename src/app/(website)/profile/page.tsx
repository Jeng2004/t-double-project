// src/app/(website)/profile/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import styles from './profile.module.css';
import Navbar from '../components/Navbar';
import Image from 'next/image';
import TrackOrders from '../components/Track-orders';
import EditProfile from '../components/editprofile';
import { getUserIdForFrontend } from '@/lib/get-user-id';

interface User {
  name: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  profileImage?: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [address, setAddress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const userId = getUserIdForFrontend();
    if (!userId) {
      console.error('❌ ไม่พบ userId');
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/profile?userId=${userId}`);
        if (!res.ok) throw new Error(`โหลดข้อมูลโปรไฟล์ล้มเหลว: ${res.status}`);
        const data = await res.json();
        setUser(data.user);
        setAddress(data.user.address || '');
      } catch (err) {
        console.error('❌ ดึงโปรไฟล์ล้มเหลว:', err);
      }
    };

    fetchUser();
  }, []);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const userId = getUserIdForFrontend();
    if (!userId) return;

    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('profileImage', file);

    try {
      const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
      if (!res.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ');
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error('❌ Upload failed:', err);
    }
  };

  const handleUpdateAddress = async () => {
    const userId = getUserIdForFrontend();
    if (!userId) return;

    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('address', address);

    try {
      const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
      if (!res.ok) throw new Error('อัปเดตที่อยู่ไม่สำเร็จ');
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error('❌ Update address failed:', err);
    }
  };

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        {/* โปรไฟล์ฝั่งซ้าย */}
        <div className={styles.left}>
          <div className={styles.profileHeader}>
            <Image
              src={user?.profileImage || '/man-profile.avif'}
              alt="Profile"
              width={80}
              height={80}
              className={styles.profileImage}
              onClick={handleImageClick}
            />
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageUpload}
            />

            <div className={styles.nameRow}>
              <span className={styles.name}>{user?.name || 'ไม่พบชื่อผู้ใช้'}</span>
              <span className={styles.edit} onClick={() => setShowEditProfile(true)}>
                ✎
              </span>
            </div>
          </div>

          <div className={styles.addressBox}>
            <h4>ที่อยู่</h4>
            <div className={styles.addressImage}>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="เพิ่มที่อยู่ของคุณ"
                className={styles.addressInput}
              />
            </div>
            <button className={styles.saveAddress} onClick={handleUpdateAddress}>
              บันทึกที่อยู่
            </button>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.ordersWrapper}>
            <h4 className={styles.ordersTitle}>ติดตามการสั่งซื้อ</h4>
            <div className={styles.ordersScroll}>
              <TrackOrders />
            </div>
          </div>
        </div>
      </div>


      <button
        className={styles.logoutButton}
        onClick={async () => {
          await fetch('/api/logout', { method: 'POST' });
          localStorage.removeItem('userId');
          window.location.href = '/login';
        }}
      >
        LOGOUT
      </button>

      {showEditProfile && <EditProfile onClose={() => setShowEditProfile(false)} />}
    </>
  );
}
