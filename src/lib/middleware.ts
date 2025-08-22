// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// เส้นทางที่ต้องล็อกอินก่อนถึงจะเข้าได้
const PROTECTED_PATHS = ["/dashboard", "/admin"];

// เส้นทางที่เฉพาะแอดมินเท่านั้นเข้าได้
const ADMIN_PATHS = ["/admin", "/api/orders/return"];

function matchPath(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("authToken")?.value;

  // เช็คเฉพาะเส้นทางที่ต้องการป้องกัน
  if (matchPath(pathname, [...PROTECTED_PATHS, ...ADMIN_PATHS])) {
    if (!token) {
      // ถ้าไม่มี token
      if (pathname.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role?: string;
      };

      // ถ้าเส้นทางต้องการ role=admin
      if (matchPath(pathname, ADMIN_PATHS) && decoded.role !== "admin") {
        if (pathname.startsWith("/api/")) {
          return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        return NextResponse.redirect(new URL("/auth/login", req.url));
      }

      // ✅ แนบ user info ไปที่ request header (ใช้ใน API route ต่อได้)
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
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  return NextResponse.next();
}

// ✅ ระบุว่า middleware ใช้กับ path ไหนบ้าง
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/orders/return/:path*",
  ],
};
