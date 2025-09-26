'use client';

export default function Navbar2() {
  return (
    <footer className="w-full bg-black text-white py-6 px-10">
      <div className="flex flex-col md:flex-row justify-between items-center text-sm">
        {/* ซ้าย */}
        <div className="text-center md:text-left mb-4 md:mb-0">
          <p>Double Flow Co., Ltd.</p>
          <p>tdouble@gmail.com</p>
        </div>

        {/* ขวา */}
        <div className="text-center md:text-right">
          <p>© 2025 T Double</p>
        </div>
      </div>
    </footer>
  );
}
