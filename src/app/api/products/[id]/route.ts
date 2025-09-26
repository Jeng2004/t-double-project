// /api/products/[id]/route.ts

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

// 📦 GET: สินค้าตาม id
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
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

// ✏️ PUT: อัปเดตสินค้า
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    verifyToken(req);
    const { id } = await context.params;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { fields, files } = await parseFormData(req);
    const updateData: any = {};

    if (fields.name) updateData.name = String(fields.name);
    if (fields.description) updateData.description = String(fields.description);
    if (fields.category) updateData.category = String(fields.category);

    const oldStock: Stock = (existingProduct.stock as Stock) || { S: 0, M: 0, L: 0, XL: 0 };
    if (fields.stock_S || fields.stock_M || fields.stock_L || fields.stock_XL) {
      updateData.stock = {
        S: parseInt(String(fields.stock_S || oldStock.S)),
        M: parseInt(String(fields.stock_M || oldStock.M)),
        L: parseInt(String(fields.stock_L || oldStock.L)),
        XL: parseInt(String(fields.stock_XL || oldStock.XL)),
      };
    }

    const oldPrice: Price = (existingProduct.price as Price) || { S: 0, M: 0, L: 0, XL: 0 };
    if (fields.price_S || fields.price_M || fields.price_L || fields.price_XL) {
      updateData.price = {
        S: parseFloat(String(fields.price_S || oldPrice.S)),
        M: parseFloat(String(fields.price_M || oldPrice.M)),
        L: parseFloat(String(fields.price_L || oldPrice.L)),
        XL: parseFloat(String(fields.price_XL || oldPrice.XL)),
      };
    }

    const imageFiles = Array.isArray(files.image) ? files.image : files.image ? [files.image] : [];
    if (imageFiles.length > 0) {
      updateData.imageUrls = imageFiles.map((file) => `/uploads/${path.basename(file.filepath)}`);
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ message: 'Product updated', product: updatedProduct }, { status: 200 });
  } catch (err: any) {
    console.error('❌ PUT error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update product' }, { status: 500 });
  }
}

// ✨ PATCH: อัปเดตบาง field
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    verifyToken(req);
    const { id } = await context.params;

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { fields, files } = await parseFormData(req);
    const updateData: any = {};

    if (fields.name) updateData.name = String(fields.name);
    if (fields.description) updateData.description = String(fields.description);
    if (fields.category) updateData.category = String(fields.category);

    if (fields.price) updateData.price = parseFloat(String(fields.price));

    const oldStock: Stock = (existingProduct.stock as Stock) || { S: 0, M: 0, L: 0, XL: 0 };
    if (fields.stock_S || fields.stock_M || fields.stock_L || fields.stock_XL) {
      updateData.stock = {
        S: parseInt(String(fields.stock_S || oldStock.S)),
        M: parseInt(String(fields.stock_M || oldStock.M)),
        L: parseInt(String(fields.stock_L || oldStock.L)),
        XL: parseInt(String(fields.stock_XL || oldStock.XL)),
      };
    }

    const imageFiles = Array.isArray(files.image) ? files.image : files.image ? [files.image] : [];
    if (imageFiles.length > 0) {
      updateData.imageUrls = imageFiles.map((file) => `/uploads/${path.basename(file.filepath)}`);
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ message: 'Product partially updated', product: updatedProduct }, { status: 200 });
  } catch (err: any) {
    console.error('❌ PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Failed to patch product' }, { status: 500 });
  }
}

// 🗑️ DELETE: ลบสินค้า
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    verifyToken(_req);
    const { id } = await context.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    product.imageUrls.forEach((url) => {
      const filePath = path.join(process.cwd(), 'public', url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await prisma.product.delete({ where: { id } });

    return NextResponse.json({ message: 'Product deleted' }, { status: 200 });
  } catch (err: any) {
    console.error('❌ DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete product' }, { status: 500 });
  }
}
