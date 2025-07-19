export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    const { username, name, email, password, status, dept, role } = await req.json();

    // ✅ Validate field ที่จำเป็น
    if (!name || !email || !password) {
        return NextResponse.json(
            { error: 'Name, email, and password are required' },
            { status: 400 }
        );
    }

    // ✅ กำหนดค่า default
    const generatedUsername = username || `${name.replace(/\s+/g, '').toLowerCase()}-${Date.now()}`;
    const userStatus = status || 'active';
    const validRoles = ['admin', 'user'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // 🚫 ถ้า role=user ห้ามมี admin ใน name/email
    if (
        userRole === 'user' &&
        (/admin/i.test(name) || /admin/i.test(email))
    ) {
        return NextResponse.json(
            { error: 'ชื่อหรืออีเมลไม่สามารถมีคำว่า "admin" ได้' },
            { status: 400 }
        );
    }

    try {
        // 🔥 ตรวจสอบ email ซ้ำ
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json(
                { error: 'อีเมลนี้ถูกใช้ลงทะเบียนแล้ว' },
                { status: 409 }
            );
        }

        // ✅ Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // ✅ สร้าง user ใหม่
        const newUser = await prisma.user.create({
            data: {
                username: generatedUsername,
                name,
                email,
                password: hashedPassword,
                status: userStatus,
                dept,
                role: userRole
            }
        });

        return NextResponse.json(
            {
                message: 'สร้างผู้ใช้สำเร็จแล้ว',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    name: newUser.name,
                    email: newUser.email,
                    status: newUser.status,
                    dept: newUser.dept,
                    role: newUser.role,
                    createdAt: newUser.createdAt
                }
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('❌ POST user error:', error);
        return NextResponse.json({ error: 'ไม่สามารถสร้างผู้ใช้ได้' }, { status: 500 });
    }
}
