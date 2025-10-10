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

// 🔹 ADD: helper สำหรับ normalize path รูปภาพให้เทียบกันได้เสมอ
function normalizeImagePath(p: string): string {
  try {
    // ตัด query/fragment ออก ถ้าเป็น URL เต็ม
    const withoutQuery = p.split('?')[0].split('#')[0];
    // ตัดโดเมน/โปรโตคอลออก ถ้าใส่มาเป็น absolute URL
    const onlyPath = withoutQuery.replace(/^https?:\/\/[^/]+/i, '');
    // ใช้ basename และบังคับให้เป็น lower-case
    const base = path.basename(onlyPath);
    return base.toLowerCase();
  } catch {
    return path.basename(p || '').toLowerCase();
  }
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
    const imageFiles = Array.isArray((files as any).image)
      ? (files as any).image
      : (files as any).image
        ? [(files as any).image]
        : [];

    const imageUrls: string[] = imageFiles.map((file: any) =>
      `/uploads/${path.basename(file.filepath)}`
    );

    // 🔹 ADD: เช็กไฟล์รูปในคำขอเดียวกันว่าซ้ำกันเองหรือไม่
    const uniqueInRequest = Array.from(new Set(imageUrls));
    if (uniqueInRequest.length !== imageUrls.length) {
      return NextResponse.json(
        { error: 'รูปภาพที่อัปโหลดซ้ำกันภายในคำขอเดียวกัน' },
        { status: 400 }
      );
    }

    // 🔹 ADD: ทำชื่อแบบ lowercase เพื่อเช็กซ้ำแบบไม่สนตัวพิมพ์ และใช้เป็น unique key
    const nameLC = name.toLowerCase();

    // 🔹 ADD: เช็กชื่อสินค้าซ้ำด้วย nameLC (ต้องเพิ่มฟิลด์ nameLC @unique ใน schema ตามที่แจ้ง)
    const existingByName = await prisma.product.findUnique({
      where: { nameLC },            // ใช้ index unique ที่เสถียรบน MongoDB
      select: { id: true, name: true }
    }).catch(async () => {
      // fallback (กรณีเพิ่งเพิ่ม schema แต่ db ยังไม่ push): ใช้ findFirst insensitive ชั่วคราว
      return prisma.product.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true, name: true }
      });
    });

    if (existingByName) {
      return NextResponse.json(
        { error: 'ชื่อสินค้านี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น' },
        { status: 409 }
      );
    }

    // 🔹 ADD: เช็กรูปซ้ำกับสินค้าเดิมในฐานข้อมูล (ถ้ามีการอัปโหลดรูป)
    if (imageUrls.length > 0) {
      // 1) ดึงสินค้าที่ "มีภาพชุดนี้ซ้ำบางส่วน" ด้วย hasSome (เร็ว)
      const candidates = await prisma.product.findMany({
        where: { imageUrls: { hasSome: imageUrls } },
        select: { id: true, name: true, imageUrls: true }
      });

      if (candidates.length > 0) {
        // 2) ตรวจซ้ำแบบ normalize ชื่อไฟล์อีกชั้น (แม่นยำกว่า)
        const normalizedRequestImages = new Set(imageUrls.map(normalizeImagePath));

        // รวมทุกรายการที่มี overlap จริง ๆ
        const conflicts = candidates
          .map(p => {
            const overlap = p.imageUrls
              .map(normalizeImagePath)
              .filter(img => normalizedRequestImages.has(img));
            return { id: p.id, name: p.name, overlap };
          })
          .filter(x => x.overlap.length > 0);

        if (conflicts.length > 0) {
          return NextResponse.json(
            {
              error: 'พบรูปภาพซ้ำกับสินค้าที่มีอยู่แล้ว ไม่สามารถสร้างสินค้าได้',
              conflicts: conflicts.map(c => ({
                id: c.id,
                name: c.name,
                duplicateImages: c.overlap
              }))
            },
            { status: 409 }
          );
        }
      }
    }

    // ✅ บันทึกสินค้าลงฐานข้อมูล (🔹 ADD: nameLC)
    const product = await prisma.product.create({
      data: {
        name,
        nameLC,                 // ⬅️ บันทึกชื่อแบบ lowercase
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
