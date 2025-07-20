export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

// ✉️ สร้าง Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // จาก .env
        pass: process.env.EMAIL_PASS, // ใช้ App Password
    },
});

// 🚀 สมัครสมาชิก (ส่ง OTP พร้อม Countdown)
export async function POST(req: NextRequest) {
    const { username, name, email, password, status, dept, role } = await req.json();

    if (!username || !email || !password) {
        return NextResponse.json(
            { error: 'Username, email, and password are required' },
            { status: 400 }
        );
    }

    const userStatus = status || 'active';
    const validRoles = ['admin', 'user'];
    const userRole = validRoles.includes(role) ? role : 'user';

    if (
        userRole === 'user' &&
        (/admin/i.test(username) || /admin/i.test(email))
    ) {
        return NextResponse.json(
            { error: 'ชื่อผู้ใช้หรืออีเมลไม่สามารถมีคำว่า "admin" ได้' },
            { status: 400 }
        );
    }

    try {
        // 🔥 ตรวจสอบ username ซ้ำ
        const existingUsername = await prisma.user.findUnique({ where: { username } });
        if (existingUsername) {
            return NextResponse.json(
                { error: 'Username นี้ถูกใช้แล้ว' },
                { status: 409 }
            );
        }

        // 🔥 ตรวจสอบ email ซ้ำ
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
            return NextResponse.json(
                { error: 'อีเมลนี้ถูกใช้ลงทะเบียนแล้ว' },
                { status: 409 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 1 * 60 * 1000); // 🕐 1 นาที

        const newUser = await prisma.user.create({
            data: {
                username, // ✅ username สำหรับ login
                name: name || username, // ✅ name แสดงบนโปรไฟล์ ถ้าไม่ได้ส่ง name ใช้ username แทน
                email,
                password: hashedPassword,
                status: userStatus,
                dept,
                role: userRole,
                active: false,
                otp,
                otpExpiry,
            },
        });

        // 🕒 HTML Email พร้อม Countdown Timer
        const emailHTML = `
            <h2>สวัสดี ${newUser.name} 👋</h2>
            <p>รหัส OTP ของคุณคือ:</p>
            <div style="font-size: 24px; font-weight: bold; color: hsla(114, 83%, 49%, 1.00);">${otp}</div>
            <p style="margin-top: 10px;">⏳ รหัสนี้จะหมดอายุใน <span id="timer" style="font-weight:bold;">01:00</span></p>
            <script>
                let timeLeft = 60;
                const timer = document.getElementById('timer');
                const interval = setInterval(() => {
                    let minutes = Math.floor(timeLeft / 60);
                    let seconds = timeLeft % 60;
                    timer.textContent =
                        (minutes < 10 ? '0' : '') + minutes + ':' +
                        (seconds < 10 ? '0' : '') + seconds;
                    timeLeft--;
                    if (timeLeft < 0) {
                        clearInterval(interval);
                        timer.textContent = 'หมดอายุแล้ว';
                    }
                }, 1000);
            </script>
            <p>หากหมดเวลา คุณสามารถขอ OTP ใหม่ได้จากหน้าเว็บไซต์</p>
        `;

        await transporter.sendMail({
            from: `"T-Double" <${process.env.EMAIL_USER}>`,
            to: newUser.email,
            subject: 'OTP สำหรับยืนยันอีเมลของคุณ',
            html: emailHTML,
        });

        return NextResponse.json(
            {
                message: '✅ ส่ง OTP ไปยังอีเมลแล้ว กรุณากรอก OTP เพื่อยืนยันบัญชี',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    name: newUser.name,
                    email: newUser.email,
                    status: newUser.status,
                    dept: newUser.dept,
                    role: newUser.role,
                    createdAt: newUser.createdAt,
                    otpExpiry: newUser.otpExpiry, // ⏱ ส่งเวลาหมดอายุไป Frontend
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('❌ POST user error:', error);
        return NextResponse.json({ error: 'ไม่สามารถสร้างผู้ใช้ได้' }, { status: 500 });
    }
}

// 🔥 ยืนยัน OTP (เปิดใช้งานบัญชี)
export async function PATCH(req: NextRequest) {
    const { email, otp } = await req.json();

    if (!email || !otp) {
        return NextResponse.json(
            { error: 'ต้องระบุอีเมลและ OTP' },
            { status: 400 }
        );
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (
            !user ||
            user.otp !== otp ||
            !user.otpExpiry ||
            user.otpExpiry < new Date()
        ) {
            return NextResponse.json(
                { error: 'OTP ไม่ถูกต้องหรือหมดอายุแล้ว' },
                { status: 400 }
            );
        }

        await prisma.user.update({
            where: { email },
            data: {
                active: true,
                otp: null,
                otpExpiry: null,
            },
        });

        return NextResponse.json(
            { message: '🎉 ยืนยันอีเมลเรียบร้อยแล้ว! คุณสามารถเข้าสู่ระบบได้แล้ว' },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PATCH verify OTP error:', error);
        return NextResponse.json({ error: 'ไม่สามารถยืนยัน OTP ได้' }, { status: 500 });
    }
}

// 🔄 รีเซ็นด์ OTP (ส่ง OTP ใหม่)
export async function PUT(req: NextRequest) {
    const { email } = await req.json();

    if (!email) {
        return NextResponse.json(
            { error: 'ต้องระบุอีเมลสำหรับส่ง OTP ใหม่' },
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

        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtpExpiry = new Date(Date.now() + 1 * 60 * 1000);

        const resendHTML = `
            <h2>สวัสดีคุณ ${user.name} 👋</h2>
            <p>รหัส OTP ใหม่ของคุณคือ:</p>
            <div style="font-size: 24px; font-weight: bold; color: #21f600ff;">${newOtp}</div>
            <p style="margin-top: 10px;">⏳ รหัสนี้จะหมดอายุใน <span id="timer" style="font-weight:bold;">01:00</span></p>
            <script>
                let timeLeft = 60;
                const timer = document.getElementById('timer');
                const interval = setInterval(() => {
                    let minutes = Math.floor(timeLeft / 60);
                    let seconds = timeLeft % 60;
                    timer.textContent =
                        (minutes < 10 ? '0' : '') + minutes + ':' +
                        (seconds < 10 ? '0' : '') + seconds;
                    timeLeft--;
                    if (timeLeft < 0) {
                        clearInterval(interval);
                        timer.textContent = 'หมดอายุแล้ว';
                    }
                }, 1000);
            </script>
        `;

        await prisma.user.update({
            where: { email },
            data: {
                otp: newOtp,
                otpExpiry: newOtpExpiry,
            },
        });

        await transporter.sendMail({
            from: `"T-Double" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'OTP ใหม่สำหรับยืนยันอีเมลของคุณ',
            html: resendHTML,
        });

        return NextResponse.json(
            {
                message: '✅ ส่ง OTP ใหม่ไปยังอีเมลแล้ว',
                otpExpiry: newOtpExpiry, // ⏱ ส่งเวลาหมดอายุไป Frontend
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PUT resend OTP error:', error);
        return NextResponse.json({ error: 'ไม่สามารถส่ง OTP ใหม่ได้' }, { status: 500 });
    }
}
