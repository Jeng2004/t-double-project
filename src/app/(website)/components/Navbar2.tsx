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
          <p>
            CONTACT:{' '}
            <a
              href="https://www.facebook.com/profile.php?id=100084642483976"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              LINK
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
