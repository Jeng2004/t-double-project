// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// เส้นทางที่ "ต้องล็อกอิน"
function requiresAuth(pathname: string) {
  if (pathname === "/") return true; // โฮม
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ไฟล์สาธารณะ/asset ต่าง ๆ → ปล่อยผ่าน
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|txt|webp|woff2?)$/);

  // หน้า/เส้นทางสาธารณะ → ปล่อยผ่าน
  const isPublicPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/login"); // api login ก็ควรสาธารณะ

  if (isPublicAsset || isPublicPage) {
    return NextResponse.next();
  }

  const token = req.cookies.get("authToken")?.value;

  // ถ้าเส้นทางนี้ต้องล็อกอิน
  if (requiresAuth(pathname)) {
    if (!token) {
      // ถ้าเป็น API → 401, ถ้าเป็นหน้าเว็บ → ส่งไป /login
      if (pathname.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role?: string;
      };

      // ตัวอย่าง: ถ้าเป็น /admin ต้องการ role=admin
      if (pathname.startsWith("/admin") && decoded.role !== "admin") {
        if (pathname.startsWith("/api/")) {
          return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }

      // แนบ header ต่อไปยัง API ภายใน
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-user-id", decoded.id);
      requestHeaders.set("x-user-email", decoded.email);
      if (decoded.role) requestHeaders.set("x-user-role", decoded.role);

      return NextResponse.next({ request: { headers: requestHeaders } });
    } catch (err) {
      console.error("❌ Invalid token:", err);
      if (pathname.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // เส้นทางอื่นที่ไม่ได้บังคับล็อกอิน → ผ่าน
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",               // โฮม
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/:path*",     // ถ้ามี API ที่ต้องการ auth ด้วย
  ],
};
