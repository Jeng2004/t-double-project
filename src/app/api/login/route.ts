export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key'; // ⭐ เพิ่มใน .env
const JWT_EXPIRES_IN = '7d'; // Token อายุ 7 วัน

// ✅ ฟังก์ชันสร้าง JWT
function generateToken(user: { id: string; email: string }) {
    return jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// ✅ POST: Login user
export async function POST(req: NextRequest) {
    const { email, password } = await req.json();

    if (!email || !password) {
        return NextResponse.json(
            { error: 'Email and password are required' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return NextResponse.json(
                { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
                { status: 401 }
            );
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
                { status: 401 }
            );
        }

        // ✅ ลบ password ก่อนส่งกลับ
        const { password: _, ...userWithoutPassword } = user;

        // ✅ สร้าง JWT Token
        const token = generateToken({ id: user.id, email: user.email });

        // ✅ Set JWT ใน HttpOnly Cookie
        const response = NextResponse.json(
            {
                message: 'เข้าสู่ระบบสำเร็จ',
                user: userWithoutPassword
            },
            { status: 200 }
        );

        response.cookies.set('authToken', token, {
            httpOnly: true,                         // 🔥 ป้องกัน XSS
            secure: process.env.NODE_ENV === 'production', // ✅ ใช้ HTTPS ใน production
            sameSite: 'strict',                     // 🔥 ป้องกัน CSRF
            maxAge: 60 * 60 * 24 * 7,                // ✅ 7 วัน
            path: '/'
        });

        return response;
    } catch (error) {
        console.error('❌ Login error:', error);
        return NextResponse.json({ error: 'ไม่สามารถเข้าสู่ระบบได้' }, { status: 500 });
    }
}