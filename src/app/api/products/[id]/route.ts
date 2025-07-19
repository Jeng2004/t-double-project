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

type Stock = {
    S: number;
    M: number;
    L: number;
    XL: number;
};

// ✅ ตรวจสอบ JWT Token
function verifyToken(req: NextRequest) {
    const token = req.cookies.get('authToken')?.value;
    if (!token) throw new Error('No token');
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        throw new Error('Invalid or expired token');
    }
}

// ✅ แปลง NextRequest เป็น Node.js Request
function nextRequestToNodeRequest(req: NextRequest): any {
    const readable = Readable.fromWeb(req.body as any);
    return Object.assign(readable, {
        headers: Object.fromEntries(req.headers),
        method: req.method
    });
}

// ✅ สร้างโฟลเดอร์อัพโหลดถ้าไม่มี
function ensureUploadDir() {
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
}

// ✅ Parse multipart/form-data
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

// 📦 GET: สินค้าตาม id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const id = params?.id || req.nextUrl.pathname.split('/').pop();
        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }
        return NextResponse.json(product, { status: 200 });
    } catch (err) {
        console.error('❌ GET by ID error:', err);
        return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
    }
}

// ✏️ PUT: อัปเดตสินค้า (Full Replace)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        verifyToken(req);
        const id = params?.id || req.nextUrl.pathname.split('/').pop();

        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const { fields, files } = await parseFormData(req);

        const imageFiles = Array.isArray(files.image)
            ? files.image
            : files.image
            ? [files.image]
            : [];

        const imageUrls: string[] = imageFiles.map((file) =>
            `/uploads/${path.basename(file.filepath)}`
        );

        // ✅ Type-safe: แปลง stock เป็น Stock หรือ Default
        const oldStock: Stock = (existingProduct.stock as Stock) || { S: 0, M: 0, L: 0, XL: 0 };

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: {
                name: String(fields.name || existingProduct.name),
                description: String(fields.description || existingProduct.description),
                price: parseFloat(String(fields.price || existingProduct.price)),
                stock: {
                    S: parseInt(String(fields.stock_S || oldStock.S)),
                    M: parseInt(String(fields.stock_M || oldStock.M)),
                    L: parseInt(String(fields.stock_L || oldStock.L)),
                    XL: parseInt(String(fields.stock_XL || oldStock.XL))
                },
                ...(imageUrls.length > 0 && { imageUrls })
            }
        });

        return NextResponse.json({ message: 'Product updated (full)', product: updatedProduct }, { status: 200 });
    } catch (err: any) {
        console.error('❌ PUT error:', err);
        return NextResponse.json({ error: err.message || 'Failed to update product' }, { status: 500 });
    }
}

// ✨ PATCH: อัปเดตบาง field
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        verifyToken(req);
        const id = params?.id || req.nextUrl.pathname.split('/').pop();

        const existingProduct = await prisma.product.findUnique({ where: { id } });
        if (!existingProduct) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const { fields, files } = await parseFormData(req);
        const updateData: any = {};

        if (fields.name) updateData.name = String(fields.name);
        if (fields.description) updateData.description = String(fields.description);
        if (fields.price) updateData.price = parseFloat(String(fields.price));

        // ✅ Type-safe: แปลง stock เป็น Stock หรือ Default
        const oldStock: Stock = (existingProduct.stock as Stock) || { S: 0, M: 0, L: 0, XL: 0 };

        if (fields.stock_S || fields.stock_M || fields.stock_L || fields.stock_XL) {
            updateData.stock = {
                S: parseInt(String(fields.stock_S || oldStock.S)),
                M: parseInt(String(fields.stock_M || oldStock.M)),
                L: parseInt(String(fields.stock_L || oldStock.L)),
                XL: parseInt(String(fields.stock_XL || oldStock.XL))
            };
        }

        const imageFiles = Array.isArray(files.image)
            ? files.image
            : files.image
            ? [files.image]
            : [];

        if (imageFiles.length > 0) {
            const imageUrls: string[] = imageFiles.map((file) =>
                `/uploads/${path.basename(file.filepath)}`
            );
            updateData.imageUrls = imageUrls;
        }

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ message: 'Product partially updated', product: updatedProduct }, { status: 200 });
    } catch (err: any) {
        console.error('❌ PATCH error:', err);
        return NextResponse.json({ error: err.message || 'Failed to patch product' }, { status: 500 });
    }
}

// 🗑️ DELETE: ลบสินค้า
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        verifyToken(req);
        const id = params?.id || req.nextUrl.pathname.split('/').pop();

        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // ลบไฟล์รูปใน uploads
        product.imageUrls.forEach((url) => {
            const filePath = path.join(process.cwd(), 'public', url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        await prisma.product.delete({ where: { id } });

        return NextResponse.json({ message: 'Product deleted' }, { status: 200 });
    } catch (err: any) {
        console.error('❌ DELETE error:', err);
        return NextResponse.json({ error: err.message || 'Failed to delete product' }, { status: 500 });
    }
}
