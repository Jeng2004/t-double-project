export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken'; // ✅ เพิ่ม JWT

const prisma = new PrismaClient();

// ✉️ Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 🚀 POST: ส่งลิงก์รีเซ็ตรหัสผ่าน
export async function POST(req: NextRequest) {
    const { email } = await req.json();

    if (!email) {
        return NextResponse.json(
            { error: 'กรุณาระบุอีเมล' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return NextResponse.json(
                { error: 'ไม่พบผู้ใช้งานนี้' },
                { status: 404 }
            );
        }

        // 🗝 สร้าง Token ด้วย crypto
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 5 * 60 * 1000); // ⏳ 5 นาที

        // ✅ สร้าง JWT token สำหรับลิงก์
        const jwtToken = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET as string, // 👉 เพิ่ม JWT_SECRET ใน .env
            { expiresIn: '5m' }
        );

        // 🔥 บันทึก token (raw) ใน DB
        await prisma.user.update({
            where: { email },
            data: {
                otp: rawToken,
                otpExpiry: tokenExpiry,
            },
        });

        // 🌐 ลิงก์รีเซ็ตรหัสผ่าน
        const resetLink = `${process.env.APP_URL}/reset-password?token=${jwtToken}`;

        // ✉️ ส่งอีเมล
        const emailHTML = `
            <h2>สวัสดี ${user.name} 👋</h2>
            <p>คุณได้ร้องขอรีเซ็ตรหัสผ่าน</p>
            <p>คลิกที่ลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่านของคุณ:</p>
            <a href="${resetLink}" style="
                display:inline-block;
                background-color:#ec4899;
                color:white;
                padding:10px 20px;
                border-radius:5px;
                text-decoration:none;
            ">รีเซ็ตรหัสผ่าน</a>
            <p>⏳ ลิงก์นี้จะหมดอายุใน 5 นาที</p>
            <p>หากคุณไม่ได้ร้องขอการเปลี่ยนรหัสผ่าน กรุณาเมินอีเมลนี้</p>
        `;

        await transporter.sendMail({
            from: `"T-Double" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'รีเซ็ตรหัสผ่านของคุณ',
            html: emailHTML,
        });

        return NextResponse.json(
            { message: '✅ ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลเรียบร้อยแล้ว' },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ POST forgot-password error:', error);
        return NextResponse.json(
            { error: 'ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้' },
            { status: 500 }
        );
    }
}

// 🔥 PATCH: ตั้งรหัสผ่านใหม่จากลิงก์
export async function PATCH(req: NextRequest) {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
        return NextResponse.json(
            { error: 'ต้องระบุ Token และรหัสผ่านใหม่' },
            { status: 400 }
        );
    }

    try {
        // ✅ ตรวจสอบ JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
                userId: string;
                email: string;
            };
        } catch (err) {
            return NextResponse.json(
                { error: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
        });

        if (!user || !user.otpExpiry || user.otpExpiry < new Date()) {
            return NextResponse.json(
                { error: 'ลิงก์หมดอายุแล้ว กรุณาขอใหม่' },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                otp: null,
                otpExpiry: null,
            },
        });

        return NextResponse.json(
            { message: '🎉 รีเซ็ตรหัสผ่านสำเร็จแล้ว! คุณสามารถเข้าสู่ระบบด้วยรหัสใหม่' },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PATCH reset-password error:', error);
        return NextResponse.json(
            { error: 'ไม่สามารถรีเซ็ตรหัสผ่านได้' },
            { status: 500 }
        );
    }
}
