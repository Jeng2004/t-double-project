import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// ✅ Path ที่ต้องการป้องกัน
const protectedPaths = ['/api/users', '/api/admin', '/api/profile'];

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // ✅ ตรวจสอบว่า path นี้อยู่ใน protectedPaths หรือไม่
    if (protectedPaths.some((path) => pathname.startsWith(path))) {
        const token = req.cookies.get('authToken')?.value;

        if (!token) {
            return NextResponse.json(
                { error: 'Unauthorized: No token provided' },
                { status: 401 }
            );
        }

        try {
            // ✅ ตรวจสอบความถูกต้องของ JWT
            jwt.verify(token, JWT_SECRET);
            return NextResponse.next(); // ✅ ให้ผ่าน
        } catch (err) {
            return NextResponse.json(
                { error: 'Unauthorized: Invalid or expired token' },
                { status: 401 }
            );
        }
    }

    // ✅ ถ้า path ไม่ใช่ protected API → ให้ผ่าน
    return NextResponse.next();
}

// ✅ ใช้กับ API ทุก path
export const config = {
    matcher: ['/api/:path*']
};