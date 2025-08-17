export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
    try {
        await prisma.$connect();

        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                role: true,
                status: true,
                dept: true,
                createdAt: true
            }
        });

        // 🟢 ใส่ค่า default ถ้า field หาย
        const usersWithDefaults = users.map(user => ({
            ...user,
            username: user.username || "unknown",
            status: user.status || "active"
        }));

        return NextResponse.json(usersWithDefaults, { status: 200 });
    } catch (error: any) {
        console.error('❌ GET users error:', error.message, error.stack);
        return NextResponse.json(
            { error: `Failed to fetch users: ${error.message}` },
            { status: 500 }
        );
    } finally {
        await prisma.$disconnect();
    }
}