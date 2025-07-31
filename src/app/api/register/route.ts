export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ใช้เก็บ session ผู้สมัคร (OTP, ข้อมูล)
const pendingUsers = new Map<string, {
    username: string;
    name: string;
    email: string;
    password: string;
    status: string;
    dept?: string;
    role: string;
    otp: string;
    otpExpiry: Date;
}>();

// ✉️ สร้าง Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 🚀 สมัครสมาชิก (ส่ง OTP)
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

    if (userRole === 'user' && (/admin/i.test(username) || /admin/i.test(email))) {
        return NextResponse.json(
            { error: 'ชื่อผู้ใช้หรืออีเมลไม่สามารถมีคำว่า "admin" ได้' },
            { status: 400 }
        );
    }

    try {
        const existingUsername = await prisma.user.findUnique({ where: { username } });
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingUsername || existingEmail) {
            return NextResponse.json({ error: 'Username หรือ Email ถูกใช้งานแล้ว' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 1 * 60 * 1000);
        const token = crypto.randomUUID();

        pendingUsers.set(token, {
            username,
            name: name || username,
            email,
            password: hashedPassword,
            status: userStatus,
            dept,
            role: userRole,
            otp,
            otpExpiry
        });

        const emailHTML = `
            <h2>สวัสดี ${name || username} 👋</h2>
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
            to: email,
            subject: 'OTP สำหรับยืนยันอีเมลของคุณ',
            html: emailHTML,
        });

        return NextResponse.json({
            message: '✅ ส่ง OTP ไปยังอีเมลแล้ว กรุณากรอก OTP เพื่อยืนยันบัญชี',
            otpToken: token,
            otpExpiry,
        }, { status: 200 });

    } catch (error) {
        console.error('❌ POST user error:', error);
        return NextResponse.json({ error: 'ไม่สามารถส่ง OTP ได้' }, { status: 500 });
    }
}

// ✅ ยืนยัน OTP และสร้างผู้ใช้จริง
export async function PATCH(req: NextRequest) {
    const { otpToken, otp } = await req.json();

    if (!otpToken || !otp) {
        return NextResponse.json(
            { error: 'ต้องระบุ token และ OTP' },
            { status: 400 }
        );
    }

    const pending = pendingUsers.get(otpToken);

    if (
        !pending ||
        pending.otp !== otp ||
        !pending.otpExpiry ||
        pending.otpExpiry < new Date()
    ) {
        return NextResponse.json(
            { error: 'OTP ไม่ถูกต้องหรือหมดอายุแล้ว' },
            { status: 400 }
        );
    }

    try {
        const newUser = await prisma.user.create({
            data: {
                username: pending.username,
                name: pending.name,
                email: pending.email,
                password: pending.password,
                status: pending.status,
                dept: pending.dept,
                role: pending.role,
                active: true,
            }
        });

        pendingUsers.delete(otpToken);

        return NextResponse.json(
            { message: '🎉 ยืนยันอีเมลเรียบร้อยแล้ว!', user: newUser },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PATCH verify OTP error:', error);
        return NextResponse.json({ error: 'ไม่สามารถสร้างบัญชีได้' }, { status: 500 });
    }
}

// 🔄 รีเซ็นด์ OTP
export async function PUT(req: NextRequest) {
    const { otpToken } = await req.json();

    if (!otpToken || !pendingUsers.has(otpToken)) {
        return NextResponse.json({ error: 'ไม่พบ session สำหรับ OTP นี้' }, { status: 400 });
    }

    const session = pendingUsers.get(otpToken)!;

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const newOtpExpiry = new Date(Date.now() + 1 * 60 * 1000);
    session.otp = newOtp;
    session.otpExpiry = newOtpExpiry;

    const resendHTML = `
        <h2>สวัสดีคุณ ${session.name} 👋</h2>
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

    try {
        await transporter.sendMail({
            from: `"T-Double" <${process.env.EMAIL_USER}>`,
            to: session.email,
            subject: 'OTP ใหม่สำหรับยืนยันอีเมลของคุณ',
            html: resendHTML,
        });

        return NextResponse.json(
            { message: '✅ ส่ง OTP ใหม่แล้ว', otpExpiry: newOtpExpiry },
            { status: 200 }
        );
    } catch (error) {
        console.error('❌ PUT resend OTP error:', error);
        return NextResponse.json({ error: 'ไม่สามารถส่ง OTP ใหม่ได้' }, { status: 500 });
    }
}