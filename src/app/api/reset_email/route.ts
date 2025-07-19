export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ✉️ Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 🚀 POST: ส่งลิงก์ยืนยันไปยังอีเมลเดิม
export async function POST(req: NextRequest) {
    const { currentEmail, newEmail } = await req.json();

    if (!currentEmail || !newEmail) {
        return NextResponse.json(
            { error: 'ต้องระบุอีเมลปัจจุบันและอีเมลใหม่' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: currentEmail } });

        if (!user) {
            return NextResponse.json(
                { error: 'ไม่พบผู้ใช้งานนี้' },
                { status: 404 }
            );
        }

        // 🗝 สร้าง Token สำหรับยืนยัน
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // ⏳ 10 นาที

        // 🔥 บันทึก token และอีเมลใหม่ (เก็บไว้ชั่วคราวใน dept)
        await prisma.user.update({
            where: { email: currentEmail },
            data: {
                otp: token,
                otpExpiry: tokenExpiry,
                dept: newEmail,
            },
        });

        // 🌐 ลิงก์ยืนยัน
        const confirmLink = `${process.env.APP_URL}/api/reset-email?token=${token}`;

        // ✉️ ส่งอีเมลไปยังอีเมลเดิม
        const emailHTML = `
            <h2>สวัสดี ${user.name} 👋</h2>
            <p>คุณได้ร้องขอเปลี่ยนอีเมลเป็น <b>${newEmail}</b></p>
            <p>คลิกที่ลิงก์ด้านล่างเพื่อยืนยันการเปลี่ยนอีเมล:</p>
            <a href="${confirmLink}" style="
                display:inline-block;
                background-color:#4f46e5;
                color:white;
                padding:10px 20px;
                border-radius:5px;
                text-decoration:none;
            ">ยืนยันการเปลี่ยนอีเมล</a>
            <p>⏳ ลิงก์นี้จะหมดอายุใน 10 นาที</p>
            <p>หากคุณไม่ได้ร้องขอการเปลี่ยนอีเมล กรุณาเมินอีเมลนี้</p>
        `;

        await transporter.sendMail({
            from: `"T-Double" <${process.env.EMAIL_USER}>`,
            to: currentEmail,
            subject: 'ยืนยันการเปลี่ยนอีเมลของคุณ',
            html: emailHTML,
        });

        return NextResponse.json(
            { message: '✅ ส่งลิงก์ยืนยันไปยังอีเมลเดิมเรียบร้อยแล้ว' },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ POST reset-email error:', error);
        return NextResponse.json(
            { error: 'ไม่สามารถส่งลิงก์ยืนยันอีเมลได้' },
            { status: 500 }
        );
    }
}

// 🔥 PATCH: ยืนยันการเปลี่ยนอีเมล
export async function PATCH(req: NextRequest) {
    const { token } = await req.json();

    if (!token) {
        return NextResponse.json(
            { error: 'ต้องระบุ Token' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findFirst({
            where: { otp: token, otpExpiry: { gt: new Date() } },
        });

        if (!user || !user.dept) {
            return NextResponse.json(
                { error: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' },
                { status: 400 }
            );
        }

        // ✅ อัปเดตอีเมลเป็นอีเมลใหม่
        await prisma.user.update({
            where: { id: user.id },
            data: {
                email: user.dept,
                dept: null,
                otp: null,
                otpExpiry: null,
            },
        });

        return NextResponse.json(
            { message: '🎉 เปลี่ยนอีเมลสำเร็จแล้ว' },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PATCH reset-email error:', error);
        return NextResponse.json(
            { error: 'ไม่สามารถยืนยันอีเมลได้' },
            { status: 500 }
        );
    }
}
