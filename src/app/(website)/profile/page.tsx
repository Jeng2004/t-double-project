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
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const userId = getUserIdForFrontend();
    if (!userId) {
      console.error('❌ ไม่พบ userId');
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/profile?userId=${userId}`, { cache: 'no-store' });
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
      setIsSaving(true);
      const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
      if (!res.ok) throw new Error('อัปเดตที่อยู่ไม่สำเร็จ');
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error('❌ Update address failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const isSaveDisabled =
    isSaving ||
    !address.trim() ||
    address.trim() === (user?.address || '').trim();

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
              <span className={styles.edit} onClick={() => setShowEditProfile(true)} title="แก้ไขโปรไฟล์">
                ✎
              </span>
            </div>
          </div>

          {/* การ์ดที่อยู่ */}
          <div className={styles.addressBox}>
            <div className={styles.addressHeader}>
              <h4>ที่อยู่จัดส่ง</h4>
              {user?.createdAt && (
                <span className={styles.addressHint}>
                  อัปเดตข้อมูลล่าสุด: {new Date(user.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className={styles.addressField}>
              <label htmlFor="address" className={styles.inputLabel}>
                รายละเอียดที่อยู่
              </label>
              <textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="บ้านเลขที่, หมู่, อาคาร, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์ และเบอร์ติดต่อ"
                className={styles.addressInput}
                rows={5}
              />
              <div className={styles.inputHint}>กรอกให้ครบถ้วนเพื่อจัดส่งได้รวดเร็ว</div>
            </div>

            <div className={styles.addressActions}>
              <button
                className={styles.saveAddress}
                onClick={handleUpdateAddress}
                disabled={isSaveDisabled}
              >
                {isSaving ? (
                  <>
                    <span className={styles.spinner} aria-hidden />
                    กำลังบันทึก…
                  </>
                ) : (
                  'บันทึกที่อยู่'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* คำสั่งซื้อฝั่งขวา */}
        <div className={styles.right}>
          <div className={styles.ordersWrapper}>
            <h4 className={styles.ordersTitle}>ติดตามการสั่งซื้อ</h4>
            <div className={styles.ordersScroll}>
              <TrackOrders />
            </div>
          </div>
        </div>
      </div>

      {showEditProfile && <EditProfile onClose={() => setShowEditProfile(false)} />}
    </>
  );
}
