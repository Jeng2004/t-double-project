export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

// 🟢 GET Profile
export async function GET(req: NextRequest) {
    const userId = req.nextUrl.searchParams.get('userId'); // 🟢 ใช้ userId จาก query param

    if (!userId) {
        return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                email: true,
                phone: true,
                address: true,
                profileImage: true,
                createdAt: true
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
        }

        return NextResponse.json({ user }, { status: 200 });
    } catch (err) {
        console.error('❌ GET profile error:', err);
        return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้' }, { status: 500 });
    }
}

// 🟡 PATCH Profile (แก้ไข name, phone, address, รูปโปรไฟล์ และลบได้)
export async function PATCH(req: NextRequest) {
    const formData = await req.formData();
    const userId = formData.get('userId')?.toString();
    const name = formData.get('name')?.toString();
    const phone = formData.get('phone')?.toString();
    const address = formData.get('address')?.toString();
    const removeProfileImage = formData.get('removeProfileImage') === 'true';
    const file = formData.get('profileImage') as File | null;

    if (!userId) {
        return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return NextResponse.json({ error: 'ไม่พบผู้ใช้นี้' }, { status: 404 });
        }

        let profileImageUrl = user.profileImage;

        // 🗑 ลบรูปโปรไฟล์เดิมถ้า removeProfileImage เป็น true
        if (removeProfileImage && profileImageUrl) {
            const oldImagePath = path.join(process.cwd(), 'public', profileImageUrl);
            try {
                await fs.unlink(oldImagePath);
                console.log('🗑 ลบไฟล์รูปโปรไฟล์แล้ว:', oldImagePath);
            } catch (err) {
                console.warn('⚠️ ไม่พบไฟล์รูปโปรไฟล์เดิมให้ลบ:', oldImagePath);
            }
            profileImageUrl = null;
        }

        // 📸 อัปโหลดรูปใหม่ถ้ามี
        if (file && file.size > 0) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            await fs.mkdir(uploadsDir, { recursive: true });

            const fileName = `${user.username}-${Date.now()}${path.extname(file.name)}`;
            const filePath = path.join(uploadsDir, fileName);

            await fs.writeFile(filePath, buffer);

            profileImageUrl = `/uploads/${fileName}`;
        }

        // ✅ อัปเดตข้อมูลใน DB
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                name: name === '' ? null : name || undefined,
                phone: phone === '' ? null : phone || undefined,
                address: address === '' ? null : address || undefined,
                profileImage: profileImageUrl
            },
            select: {
                name: true,
                email: true,
                phone: true,
                address: true,
                profileImage: true,
                createdAt: true
            }
        });

        return NextResponse.json(
            { message: '✅ อัปเดตโปรไฟล์เรียบร้อยแล้ว', user: updatedUser },
            { status: 200 }
        );
    } catch (err) {
        console.error('❌ PATCH profile error:', err);
        return NextResponse.json({ error: 'ไม่สามารถอัปเดตโปรไฟล์ได้' }, { status: 500 });
    }
}

// 🔴 DELETE Profile Image (ลบเฉพาะรูปโปรไฟล์)
export async function DELETE(req: NextRequest) {
    const userId = req.nextUrl.searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return NextResponse.json({ error: 'ไม่พบผู้ใช้นี้' }, { status: 404 });
        }

        if (user.profileImage) {
            const oldImagePath = path.join(process.cwd(), 'public', user.profileImage);
            try {
                await fs.unlink(oldImagePath);
                console.log('🗑 ลบไฟล์รูปโปรไฟล์แล้ว:', oldImagePath);
            } catch (err) {
                console.warn('⚠️ ไม่พบไฟล์รูปโปรไฟล์ให้ลบ:', oldImagePath);
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { profileImage: null },
            select: {
                name: true,
                email: true,
                phone: true,
                address: true,
                profileImage: true,
                createdAt: true
            }
        });

        return NextResponse.json(
            { message: '🗑 ลบรูปโปรไฟล์เรียบร้อยแล้ว', user: updatedUser },
            { status: 200 }
        );
    } catch (err) {
        console.error('❌ DELETE profile image error:', err);
        return NextResponse.json({ error: 'ไม่สามารถลบรูปโปรไฟล์ได้' }, { status: 500 });
    }
}
