'use client';

import { useState } from 'react';
import styles from './profile.module.css';
import Navbar from '../components/Navbar';
import Image from 'next/image';
import TrackOrders from '../components/Track-orders';
import EditProfile from '../components/editprofile';

export default function ProfilePage() {
  const [showEditProfile, setShowEditProfile] = useState(false);

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        {/* โปรไฟล์ฝั่งซ้าย */}
        <div className={styles.left}>
          <div className={styles.profileHeader}>
            <Image src="/user-icon.png" alt="User" width={60} height={60} />
            <div className={styles.nameRow}>
              <span className={styles.name}>Patcharaphan Sringarm</span>
              <span
                className={styles.edit}
                onClick={() => setShowEditProfile(true)}
              >
                ✎
              </span>
            </div>
          </div>

          <div className={styles.addressBox}>
            <h4>ที่อยู่</h4>
            <div className={styles.addressImage}>
              <Image src="/address-pin.png" alt="Address" width={60} height={60} />
            </div>
          </div>
        </div>

        {/* ติดตามคำสั่งซื้อฝั่งขวา */}
        <div className={styles.right}>
          <TrackOrders />
        </div>
      </div>

      {/* Modal แก้ไขโปรไฟล์ */}
      {showEditProfile && <EditProfile onClose={() => setShowEditProfile(false)} />}
    </>
  );
}
