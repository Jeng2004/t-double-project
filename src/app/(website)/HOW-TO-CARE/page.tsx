'use client';

import Image from 'next/image';
import Navbar from '../components/Navbar';
import Navbar2 from '../components/Navbar2';

export default function HowToCarePage() {
  return (
    <>
      <Navbar />

      {/* Banner เต็มจอ */}
      <div className="w-full">
        <Image
          src="/HOW TO CARE.jpg"
          alt="How to Care"
          width={1920}
          height={1080}
          className="w-full h-auto object-cover"
          priority
        />
      </div>

      <Navbar2 />
    </>
  );
}
