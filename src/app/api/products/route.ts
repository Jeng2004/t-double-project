// /api/products/route.ts

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

type Stock = { S: number; M: number; L: number; XL: number };
type Price = { S: number; M: number; L: number; XL: number };

// ✅ ตรวจสอบ JWT Token
function verifyToken(req: NextRequest) {
  const token = req.cookies.get('authToken')?.value;
  if (!token) throw new Error('No token');
  return jwt.verify(token, JWT_SECRET);
}

// ✅ แปลง NextRequest เป็น Node.js Request
function nextRequestToNodeRequest(req: NextRequest): any {
  const readable = Readable.fromWeb(req.body as any);
  return Object.assign(readable, {
    headers: Object.fromEntries(req.headers),
    method: req.method
  });
}

// ✅ สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
function ensureUploadDir() {
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

// ✅ แปลง multipart/form-data
async function parseFormData(req: NextRequest) {
  ensureUploadDir();
  const nodeReq = nextRequestToNodeRequest(req);
  const form = formidable({
    multiples: true,
    uploadDir: './public/uploads',
    keepExtensions: true
  });
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(nodeReq, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// ✨ POST: เพิ่มสินค้าใหม่
export async function POST(req: NextRequest) {
  try {
    verifyToken(req); // 🔐 ตรวจสอบ JWT

    const { fields, files } = await parseFormData(req);

    const name = String(fields.name || '');
    const category = String(fields.category || 'Uncategorized'); // ✅ เพิ่มหมวดหมู่

    if (!name) {
      return NextResponse.json({ error: 'Missing product name' }, { status: 400 });
    }

    const description = Array.isArray(fields.description)
      ? fields.description[0]
      : String(fields.description || '');

    // ✅ แปลง Stock อย่างปลอดภัย
    const stock: Stock = {
      S: parseInt(Array.isArray(fields.stock_S) ? fields.stock_S[0] : String(fields.stock_S || '0')),
      M: parseInt(Array.isArray(fields.stock_M) ? fields.stock_M[0] : String(fields.stock_M || '0')),
      L: parseInt(Array.isArray(fields.stock_L) ? fields.stock_L[0] : String(fields.stock_L || '0')),
      XL: parseInt(Array.isArray(fields.stock_XL) ? fields.stock_XL[0] : String(fields.stock_XL || '0'))
    };

    // ✅ แปลง Price อย่างปลอดภัย
    const price: Price = {
      S: parseFloat(Array.isArray(fields.price_S) ? fields.price_S[0] : String(fields.price_S || '0')),
      M: parseFloat(Array.isArray(fields.price_M) ? fields.price_M[0] : String(fields.price_M || '0')),
      L: parseFloat(Array.isArray(fields.price_L) ? fields.price_L[0] : String(fields.price_L || '0')),
      XL: parseFloat(Array.isArray(fields.price_XL) ? fields.price_XL[0] : String(fields.price_XL || '0'))
    };

    // ✅ จัดการไฟล์รูปภาพ
    const imageFiles = Array.isArray(files.image)
      ? files.image
      : files.image
        ? [files.image]
        : [];

    const imageUrls: string[] = imageFiles.map((file) =>
      `/uploads/${path.basename(file.filepath)}`
    );

    // ✅ บันทึกสินค้าลงฐานข้อมูล
    const product = await prisma.product.create({
      data: {
        name,
        description,
        category, // ✅ บันทึก category ลง DB
        stock,
        price,
        imageUrls
      }
    });

    return NextResponse.json({ message: 'Shirt added', product }, { status: 201 });
  } catch (err: any) {
    console.error('❌ POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to add product' }, { status: 500 });
  }
}

// 📦 GET: ดึงสินค้าทั้งหมด
export async function GET() {
  try {
    const products = await prisma.product.findMany(); // ดึงข้อมูลทั้งหมดจาก DB
    return NextResponse.json(products, { status: 200 });
  } catch (err: any) {
    console.error('❌ GET error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch products' }, { status: 500 });
  }
}