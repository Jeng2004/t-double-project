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

// ====== Logging Helpers ======
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function genRequestId() {
  // lightweight unique id per request
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function ts() {
  return new Date().toISOString();
}
function log(level: LogLevel, reqId: string, msg: string, meta?: Record<string, unknown>) {
  const base = `[${ts()}] [${reqId}] [${level.toUpperCase()}] ${msg}`;
  if (meta) {
    // Avoid logging very large or sensitive payloads
    try {
      // Trim strings in meta if too long
      const safe = JSON.parse(
        JSON.stringify(meta, (k, v) => {
          if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '…';
          return v;
        })
      );
      // eslint-disable-next-line no-console
      console.log(base, safe);
    } catch {
      // eslint-disable-next-line no-console
      console.log(base);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
}
function startTimer() {
  const start = process.hrtime.bigint();
  return () => Number((process.hrtime.bigint() - start) / BigInt(1_000_000)); // ms
}
function summarizeFields(fields: formidable.Fields) {
  const keys = Object.keys(fields || {});
  const preview: Record<string, unknown> = {};
  for (const k of keys) {
    const val = (fields as any)[k];
    // show primitive / length only
    if (Array.isArray(val)) {
      preview[k] = val.map((x) => (typeof x === 'string' ? (x.length > 120 ? x.slice(0, 120) + '…' : x) : typeof x));
    } else if (typeof val === 'string') {
      preview[k] = val.length > 120 ? val.slice(0, 120) + '…' : val;
    } else {
      preview[k] = typeof val;
    }
  }
  return { keys, preview };
}
function summarizeFiles(files: formidable.Files) {
  const result: Array<{ field: string; filepath?: string; originalFilename?: string; mimetype?: string; size?: number }> =
    [];
  for (const field of Object.keys(files || {})) {
    const value = (files as any)[field];
    const arr = Array.isArray(value) ? value : value ? [value] : [];
    for (const f of arr) {
      result.push({
        field,
        filepath: (f as any).filepath ? path.basename((f as any).filepath) : undefined,
        originalFilename: (f as any).originalFilename,
        mimetype: (f as any).mimetype,
        size: (f as any).size,
      });
    }
  }
  return result;
}

// ====== Types ======
type Stock = { S: number; M: number; L: number; XL: number };
type Price = { S: number; M: number; L: number; XL: number };

// ====== Auth / Request helpers ======
function verifyToken(req: NextRequest, reqId: string) {
  const token = req.cookies.get('authToken')?.value;
  if (!token) {
    log('warn', reqId, 'Missing auth token');
    throw new Error('No token');
  }
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    log('debug', reqId, 'Token verified');
    return verified;
  } catch (e) {
    log('warn', reqId, 'Invalid or expired token');
    throw new Error('Invalid or expired token');
  }
}

function nextRequestToNodeRequest(req: NextRequest): any {
  const readable = Readable.fromWeb(req.body as any);
  return Object.assign(readable, {
    headers: Object.fromEntries(req.headers),
    method: req.method,
  });
}

function ensureUploadDir(reqId: string) {
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    log('info', reqId, 'Created upload directory', { uploadDir });
  } else {
    log('debug', reqId, 'Upload directory exists', { uploadDir });
  }
}

async function parseFormData(
  req: NextRequest,
  reqId: string
): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  ensureUploadDir(reqId);
  const nodeReq = nextRequestToNodeRequest(req);
  const form = formidable({
    multiples: true,
    uploadDir: './public/uploads',
    keepExtensions: true,
    maxFiles: 11,
  });

  const stop = startTimer();
  log('info', reqId, 'Parsing multipart/form-data start');

  form.on('fileBegin', (name, file) => {
    log('debug', reqId, 'fileBegin', {
      field: name,
      originalFilename: (file as any).originalFilename,
      mimetype: (file as any).mimetype,
    });
  });
  form.on('file', (name, file) => {
    log('info', reqId, 'file saved', {
      field: name,
      filepath: (file as any).filepath ? path.basename((file as any).filepath) : undefined,
      size: (file as any).size,
    });
  });
  form.on('error', (err) => {
    log('error', reqId, 'Formidable error', { message: (err as Error).message });
  });

  return new Promise((resolve, reject) => {
    form.parse(nodeReq, (err, fields, files) => {
      const ms = stop();
      if (err) {
        log('error', reqId, 'Parsing multipart/form-data failed', { ms, error: (err as Error).message });
        reject(err);
      } else {
        const fieldInfo = summarizeFields(fields);
        const fileInfo = summarizeFiles(files);
        log('info', reqId, 'Parsing multipart/form-data done', {
          ms,
          fieldKeys: fieldInfo.keys,
          fieldsPreview: fieldInfo.preview,
          files: fileInfo,
        });
        resolve({ fields, files });
      }
    });
  });
}

// 📦 GET: สินค้าตาม id
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  log('info', reqId, 'GET /api/products/[id] start');

  try {
    const stop = startTimer();
    const { id } = await context.params;
    log('debug', reqId, 'Fetching product by id', { id });

    const product = await prisma.product.findUnique({ where: { id } });
    const ms = stop();
    log('info', reqId, 'DB findUnique completed', { ms, found: !!product });

    if (!product) {
      log('warn', reqId, 'Product not found', { id });
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    log('info', reqId, 'GET success', { id });
    return NextResponse.json(product, { status: 200 });
  } catch (err) {
    log('error', reqId, 'GET by ID error', { error: (err as Error).message });
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// ✏️ PUT: อัปเดตสินค้า
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  log('info', reqId, 'PUT /api/products/[id] start');

  try {
    verifyToken(req, reqId);

    const { id } = await context.params;
    log('debug', reqId, 'PUT target id', { id });

    let stop = startTimer();
    const existingProduct = await prisma.product.findUnique({ where: { id } });
    log('info', reqId, 'DB findUnique (pre-update) completed', { ms: stop(), found: !!existingProduct });

    if (!existingProduct) {
      log('warn', reqId, 'Product not found (PUT)', { id });
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { fields, files } = await parseFormData(req, reqId);
    const updateData: any = {};

    // 🔒 ตรวจสอบ “ห้ามเปลี่ยนชื่อให้ซ้ำกับสินค้ารายอื่น” (case-insensitive)
    if (fields.name) {
      const newNameRaw = Array.isArray(fields.name) ? String(fields.name[0]) : String(fields.name);
      const newName = newNameRaw.trim();
      log('debug', reqId, 'Requested new name', { newName });

      if (!newName) {
        log('warn', reqId, 'Empty product name');
        return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 });
      }

      stop = startTimer();
      const dup = await prisma.product.findFirst({
        where: {
          AND: [{ name: { equals: newName, mode: 'insensitive' } }, { NOT: { id } }],
        },
        select: { id: true },
      });
      log('info', reqId, 'DB findFirst (dup check) completed', { ms: stop(), dup: !!dup });

      if (dup) {
        log('warn', reqId, 'Duplicate product name', { newName });
        return NextResponse.json(
          { error: 'Duplicate product name: another product already uses this name' },
          { status: 409 }
        );
      }

      updateData.name = newName;
    }

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
      log('debug', reqId, 'Stock update prepared', { stock: updateData.stock });
    }

    const oldPrice: Price = (existingProduct.price as Price) || { S: 0, M: 0, L: 0, XL: 0 };
    if (fields.price_S || fields.price_M || fields.price_L || fields.price_XL) {
      updateData.price = {
        S: parseFloat(String(fields.price_S || oldPrice.S)),
        M: parseFloat(String(fields.price_M || oldPrice.M)),
        L: parseFloat(String(fields.price_L || oldPrice.L)),
        XL: parseFloat(String(fields.price_XL || oldPrice.XL)),
      };
      log('debug', reqId, 'Price update prepared', { price: updateData.price });
    }

    const imageFiles = Array.isArray((files as any).image)
      ? (files as any).image
      : (files as any).image
      ? [(files as any).image]
      : [];
    if (imageFiles.length > 0) {
      updateData.imageUrls = imageFiles.map((file: any) => `/uploads/${path.basename(file.filepath)}`);
      log('info', reqId, 'Image URLs prepared', { count: imageFiles.length, imageUrls: updateData.imageUrls });
    }

    stop = startTimer();
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });
    log('info', reqId, 'DB update completed', { ms: stop(), updatedFields: Object.keys(updateData) });

    log('info', reqId, 'PUT success', { id });
    return NextResponse.json({ message: 'Product updated', product: updatedProduct }, { status: 200 });
  } catch (err: any) {
    log('error', reqId, 'PUT error', { error: err.message });
    return NextResponse.json({ error: err.message || 'Failed to update product' }, { status: 500 });
  }
}

// ✨ PATCH: อัปเดตบาง field
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  log('info', reqId, 'PATCH /api/products/[id] start');

  try {
    verifyToken(req, reqId);

    const { id } = await context.params;
    log('debug', reqId, 'PATCH target id', { id });

    let stop = startTimer();
    const existingProduct = await prisma.product.findUnique({ where: { id } });
    log('info', reqId, 'DB findUnique (pre-patch) completed', { ms: stop(), found: !!existingProduct });

    if (!existingProduct) {
      log('warn', reqId, 'Product not found (PATCH)', { id });
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { fields, files } = await parseFormData(req, reqId);
    const updateData: any = {};

    // 🔒 ตรวจสอบ “ห้ามเปลี่ยนชื่อให้ซ้ำกับสินค้ารายอื่น” (case-insensitive)
    if (fields.name) {
      const newNameRaw = Array.isArray(fields.name) ? String(fields.name[0]) : String(fields.name);
      const newName = newNameRaw.trim();
      log('debug', reqId, 'Requested new name (PATCH)', { newName });

      if (!newName) {
        log('warn', reqId, 'Empty product name (PATCH)');
        return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 });
      }

      stop = startTimer();
      const dup = await prisma.product.findFirst({
        where: {
          AND: [{ name: { equals: newName, mode: 'insensitive' } }, { NOT: { id } }],
        },
        select: { id: true },
      });
      log('info', reqId, 'DB findFirst (dup check, PATCH) completed', { ms: stop(), dup: !!dup });

      if (dup) {
        log('warn', reqId, 'Duplicate product name (PATCH)', { newName });
        return NextResponse.json(
          { error: 'Duplicate product name: another product already uses this name' },
          { status: 409 }
        );
      }

      updateData.name = newName;
    }

    if (fields.description) updateData.description = String(fields.description);
    if (fields.category) updateData.category = String(fields.category);

    if (fields.price) {
      updateData.price = parseFloat(String(fields.price));
      log('debug', reqId, 'Price (flat) update prepared', { price: updateData.price });
    }

    const oldStock: Stock = (existingProduct.stock as Stock) || { S: 0, M: 0, L: 0, XL: 0 };
    if (fields.stock_S || fields.stock_M || fields.stock_L || fields.stock_XL) {
      updateData.stock = {
        S: parseInt(String(fields.stock_S || oldStock.S)),
        M: parseInt(String(fields.stock_M || oldStock.M)),
        L: parseInt(String(fields.stock_L || oldStock.L)),
        XL: parseInt(String(fields.stock_XL || oldStock.XL)),
      };
      log('debug', reqId, 'Stock (PATCH) update prepared', { stock: updateData.stock });
    }

    const imageFiles = Array.isArray((files as any).image)
      ? (files as any).image
      : (files as any).image
      ? [(files as any).image]
      : [];
    if (imageFiles.length > 0) {
      updateData.imageUrls = imageFiles.map((file: any) => `/uploads/${path.basename(file.filepath)}`);
      log('info', reqId, 'Image URLs (PATCH) prepared', { count: imageFiles.length, imageUrls: updateData.imageUrls });
    }

    stop = startTimer();
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
    });
    log('info', reqId, 'DB update (PATCH) completed', { ms: stop(), updatedFields: Object.keys(updateData) });

    log('info', reqId, 'PATCH success', { id });
    return NextResponse.json({ message: 'Product partially updated', product: updatedProduct }, { status: 200 });
  } catch (err: any) {
    log('error', reqId, 'PATCH error', { error: err.message });
    return NextResponse.json({ error: err.message || 'Failed to patch product' }, { status: 500 });
  }
}

// 🗑️ DELETE: ลบสินค้า
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  log('info', reqId, 'DELETE /api/products/[id] start');

  try {
    verifyToken(_req, reqId);

    const { id } = await context.params;
    log('debug', reqId, 'DELETE target id', { id });

    let stop = startTimer();
    const product = await prisma.product.findUnique({ where: { id } });
    log('info', reqId, 'DB findUnique (pre-delete) completed', { ms: stop(), found: !!product });

    if (!product) {
      log('warn', reqId, 'Product not found (DELETE)', { id });
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Remove related files if exist
    (product.imageUrls || []).forEach((url) => {
      const filePath = path.join(process.cwd(), 'public', url);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          log('info', reqId, 'Deleted image file', { filePath });
        } else {
          log('debug', reqId, 'Image file not found on disk', { filePath });
        }
      } catch (e: any) {
        log('warn', reqId, 'Failed to delete image file', { filePath, error: e.message });
      }
    });

    stop = startTimer();
    await prisma.product.delete({ where: { id } });
    log('info', reqId, 'DB delete completed', { ms: stop() });

    log('info', reqId, 'DELETE success', { id });
    return NextResponse.json({ message: 'Product deleted' }, { status: 200 });
  } catch (err: any) {
    log('error', reqId, 'DELETE error', { error: err.message });
    return NextResponse.json({ error: err.message || 'Failed to delete product' }, { status: 500 });
  }
}
