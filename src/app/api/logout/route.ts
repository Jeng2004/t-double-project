export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

// ✅ POST: Logout user
export async function POST(req: NextRequest) {
    try {
        // ✅ ลบ cookie ที่เก็บ token (ถ้าใช้ JWT)
        const response = NextResponse.json(
            { message: 'Logout successful' },
            { status: 200 }
        );

        // 🔥 เคลียร์ cookie (เช่น authToken)
        response.cookies.set('authToken', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: new Date(0) // หมดอายุทันที
        });

        return response;
    } catch (error) {
        console.error('❌ Logout error:', error);
        return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
    }
}
