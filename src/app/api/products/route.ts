export const runtime = 'nodejs';
export const config = { api: { bodyParser: false } };

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import formidable from 'formidable';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function verifyToken(req: NextRequest) {
    const token = req.cookies.get('authToken')?.value;
    if (!token) throw new Error('No token');
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        throw new Error('Invalid or expired token');
    }
}

function nextRequestToNodeRequest(req: NextRequest): any {
    const readable = Readable.fromWeb(req.body as any);
    return Object.assign(readable, {
        headers: Object.fromEntries(req.headers),
        method: req.method
    });
}

function ensureUploadDir() {
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
}

async function parseFormData(req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
    ensureUploadDir();
    const nodeReq = nextRequestToNodeRequest(req);
    const form = formidable({
        multiples: true,
        uploadDir: './public/uploads',
        keepExtensions: true,
        maxFiles: 11
    });
    return new Promise((resolve, reject) => {
        form.parse(nodeReq, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}

// 📦 GET: ดึงสินค้าทั้งหมด
export async function GET() {
    try {
        const products = await prisma.product.findMany();
        return NextResponse.json(products, { status: 200 });
    } catch (err) {
        console.error('❌ GET error:', err);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}

// ➕ POST: เพิ่มสินค้า
export async function POST(req: NextRequest) {
    try {
        verifyToken(req);

        const { fields, files } = await parseFormData(req);
        const { name, description, price } = fields;
        const stock = {
            S: parseInt(String(fields.stock_S || '0')),
            M: parseInt(String(fields.stock_M || '0')),
            L: parseInt(String(fields.stock_L || '0')),
            XL: parseInt(String(fields.stock_XL || '0'))
        };

        const imageFiles = Array.isArray(files.image)
            ? files.image
            : files.image
            ? [files.image]
            : [];

        if (imageFiles.length < 1) {
            return NextResponse.json({ error: 'ต้องอัพโหลดอย่างน้อย 1 รูป' }, { status: 400 });
        }
        if (imageFiles.length > 11) {
            return NextResponse.json({ error: 'อัพโหลดได้ไม่เกิน 11 รูป' }, { status: 400 });
        }

        const imageUrls: string[] = imageFiles.map((file) =>
            `/uploads/${path.basename(file.filepath)}`
        );

        const product = await prisma.product.create({
            data: {
                name: String(name),
                description: String(description || ''),
                price: parseFloat(String(price)),
                stock,
                imageUrls
            }
        });

        return NextResponse.json({ message: 'Shirt added', product }, { status: 201 });
    } catch (err: any) {
        console.error('❌ POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
