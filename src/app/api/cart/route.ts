// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 📝 Logger helpers
const logPrefix = "🧺 CartAPI";
const log = (...args: any[]) => console.log(logPrefix, ...args);
const info = (...args: any[]) => console.info(logPrefix, ...args);
const warn = (...args: any[]) => console.warn(logPrefix, ...args);
const error = (...args: any[]) => console.error(logPrefix, ...args);

// 🔎 เพิ่ม: requestId + timer utils
const genReqId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const since = (start: number) => `${(Date.now() - start)}ms`;

// ---------- GET - ดูตะกร้าของ user พร้อมราคา + stock ปัจจุบัน ----------
export async function GET(req: NextRequest) {
  const started = Date.now();
  const rid = genReqId();
  const userId = req.nextUrl.searchParams.get("userId");

  info(`[${rid}] GET /api/cart`, { userId });

  if (!userId) {
    warn(`[${rid}] GET missing userId`);
    return NextResponse.json(
      { error: "กรุณาระบุ userId ใน query string" },
      { status: 400 }
    );
  }

  try {
    const t1 = Date.now();
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: { product: true }, // ดึงข้อมูลสินค้า (รวม price และ stock object)
    });
    info(`[${rid}] GET cartItems fetched`, {
      count: cartItems.length,
      took: since(t1),
    });

    // เคลียร์รายการที่สต็อก (size) หมดออกจากตะกร้าอัตโนมัติ
    const toRemoveIds: string[] = [];

    const enrichedItems = cartItems.map((item) => {
      const size = item.size as keyof typeof item.product.price;
      const unitPrice = (item.product?.price as any)?.[size] ?? 0;
      const totalPrice = unitPrice * item.quantity;

      // ดึง stock ปัจจุบันของ size นี้
      const stockBySize = (item.product?.stock || {}) as Record<string, number>;
      const availableStock = stockBySize?.[size as string] ?? 0;

      log(`[${rid}] GET item`, {
        cartItemId: item.id,
        productId: item.productId,
        size,
        qty: item.quantity,
        unitPrice,
        availableStock,
      });

      if (availableStock === 0) {
        toRemoveIds.push(item.id);
      }

      return {
        ...item,
        unitPrice,
        totalPrice,
        availableStock, // เพิ่ม field stock ปัจจุบัน
      };
    });

    if (toRemoveIds.length > 0) {
      const t2 = Date.now();
      warn(`[${rid}] GET removing out-of-stock cart items`, { toRemoveIds });
      const delRes = await prisma.cartItem.deleteMany({
        where: { id: { in: toRemoveIds } },
      });
      info(`[${rid}] GET deleteMany result`, { ...delRes, took: since(t2) });
    }

    // ส่งกลับเฉพาะรายการที่ยังมีสต็อก
    const itemsAfterCleanup = enrichedItems.filter((i) => i.availableStock > 0);
    info(`[${rid}] GET return items`, {
      count: itemsAfterCleanup.length,
      took_total: since(started),
    });

    return NextResponse.json(itemsAfterCleanup, { status: 200 });
  } catch (err) {
    error(`[${rid}] ❌ GET cart error:`, err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลตะกร้าได้" },
      { status: 500 }
    );
  }
}

// ---------- POST - เพิ่มสินค้าเข้าตะกร้า (✅ ตรวจสต๊อก แต่ ❌ ไม่หักสต๊อกจนกว่าจะชำระเงิน) ----------
export async function POST(req: NextRequest) {
  const started = Date.now();
  const rid = genReqId();
  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    error(`[${rid}] POST body parse error`, e);
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const { userId, productId, quantity, size } = body;
  info(`[${rid}] POST /api/cart`, { userId, productId, quantity, size });

  if (!userId || !productId || !size || Number(quantity) <= 0) {
    warn(`[${rid}] POST invalid payload`, body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    // 1) ดึงสินค้า (fresh)
    const t1 = Date.now();
    const product = await prisma.product.findUnique({ where: { id: productId } });
    info(`[${rid}] POST product fetched`, {
      found: Boolean(product),
      productId,
      took: since(t1),
    });

    if (!product) {
      warn(`[${rid}] POST product not found`, { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const stockBySize = (product.stock || {}) as Record<string, number>;
    const availableStock = Number.isFinite(Number(stockBySize?.[size])) ? Number(stockBySize[size]) : 0;
    info(`[${rid}] POST stock check`, { productId, size, availableStock });

    if (availableStock === 0) {
      // ถ้าหมดจริง ๆ -> ลบ item เดิมในตะกร้าผู้ใช้ (เหมือนเดิม)
      const t1del = Date.now();
      warn(`[${rid}] POST out of stock -> clearing existing cartItem`, { userId, productId, size });
      const r = await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      info(`[${rid}] POST cleared cartItem`, { count: r.count, took: since(t1del) });
      return NextResponse.json(
        { error: "สินค้าหมดสต็อก และถูกนำออกจากตะกร้าแล้ว" },
        { status: 410 }
      );
    }

    // 2) หา cart item เดิมของ user สำหรับ product+size
    const t2 = Date.now();
    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });
    info(`[${rid}] POST existingItem fetched`, {
      found: Boolean(existingItem),
      took: since(t2),
    });

    const requestedQtyTotal = existingItem ? existingItem.quantity + Number(quantity) : Number(quantity);

    // ✅ ไม่ให้เกินสต๊อก “ทั้งหมด” (ไม่ใช่แค่ diff)
    if (requestedQtyTotal > availableStock) {
      warn(`[${rid}] POST insufficient stock`, { requestedQtyTotal, availableStock });
      return NextResponse.json(
        { error: `สินค้าในสต๊อกไม่เพียงพอ (คงเหลือ ${availableStock})` },
        { status: 409 }
      );
    }

    // 3) สร้าง/อัปเดต cartItem
    const sizeKey = size as keyof typeof product.price;
    const unitPrice = (product.price as any)?.[sizeKey] ?? 0;

    const t3 = Date.now();
    let cartResult;
    if (existingItem) {
      const newQty = existingItem.quantity + Number(quantity);
      const newTotalPrice = Number(unitPrice) * newQty;
      cartResult = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty, unitPrice, totalPrice: newTotalPrice },
      });
      info(`[${rid}] POST cartItem updated`, {
        cartItemId: existingItem.id,
        newQty,
        took: since(t3),
      });
    } else {
      const totalPrice = Number(unitPrice) * Number(quantity);
      cartResult = await prisma.cartItem.create({
        data: {
          userId,
          productId,
          quantity: Number(quantity),
          size,
          unitPrice,
          totalPrice,
        },
      });
      info(`[${rid}] POST cartItem created`, {
        cartItemId: cartResult.id,
        qty: Number(quantity),
        took: since(t3),
      });
    }

    // ✅ ไม่อัปเดตสต๊อกจริง — ส่งสต๊อกปัจจุบันกลับไปเพื่อแสดงผล
    const t4 = Date.now();
    const freshProductNow = await prisma.product.findUnique({ where: { id: productId } });
    const productStock = (freshProductNow?.stock || {}) as Record<string, number>;
    info(`[${rid}] POST fresh product stock re-read`, { took: since(t4) });

    info(`[${rid}] POST success`, { took_total: since(started) });
    return NextResponse.json(
      {
        ...cartResult,
        unitPrice,
        totalPrice: unitPrice * (existingItem ? existingItem.quantity + Number(quantity) : Number(quantity)),
        message: "เพิ่มสินค้าลงตะกร้าเรียบร้อย (ยังไม่ตัดสต๊อกจนกว่าจะชำระเงิน)",
        productStock,
      },
      { status: 201 }
    );
  } catch (err) {
    error(`[${rid}] ❌ POST cart error:`, err);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มสินค้าได้" }, { status: 500 });
  }
}

// ---------- PATCH - อัปเดตจำนวนสินค้าในตะกร้า (✅ ตรวจสต๊อก “จำนวนใหม่” ไม่เกินของจริง, ❌ ไม่แตะสต๊อกจริง) ----------
export async function PATCH(req: NextRequest) {
  const started = Date.now();
  const rid = genReqId();

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    error(`[${rid}] PATCH body parse error`, e);
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const { userId, productId, quantity, size } = body;
  info(`[${rid}] PATCH /api/cart`, { userId, productId, quantity, size });

  if (!userId || !productId || !size || typeof quantity !== "number" || quantity < 0) {
    warn(`[${rid}] PATCH invalid payload`, body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const t1 = Date.now();
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });
    info(`[${rid}] PATCH existingCartItem fetched`, {
      found: Boolean(existingCartItem),
      took: since(t1),
    });

    if (!existingCartItem) {
      warn(`[${rid}] PATCH cartItem not found`, { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    const t2 = Date.now();
    const product = await prisma.product.findUnique({ where: { id: productId } });
    info(`[${rid}] PATCH product fetched`, {
      found: Boolean(product),
      productId,
      took: since(t2),
    });

    if (!product) {
      warn(`[${rid}] PATCH product not found`, { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const stockBySize = (product.stock || {}) as Record<string, number>;
    const availableStock = Number.isFinite(Number(stockBySize?.[size])) ? Number(stockBySize[size]) : 0;
    info(`[${rid}] PATCH stock check`, { productId, size, availableStock });

    // ❗ FIX: ห้ามเกิน “จำนวนใหม่” > availableStock (เดิมเช็ค diff อาจพลาดกรณีรวม)
    const newQty = Number(quantity);
    const oldQty = existingCartItem.quantity;
    const diff = newQty - oldQty; // เก็บไว้ log เฉย ๆ
    log(`[${rid}] PATCH qty`, { oldQty, newQty, diff });

    if (newQty > availableStock) {
      warn(`[${rid}] PATCH reject over stock`, { newQty, availableStock });
      return NextResponse.json(
        { error: `ไม่สามารถตั้งจำนวนเกินสต๊อกได้ (คงเหลือ ${availableStock})` },
        { status: 409 }
      );
    }

    // อัปเดต cart item
    if (newQty === 0) {
      const t3 = Date.now();
      await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      info(`[${rid}] PATCH cartItem deleted`, { took: since(t3) });
    } else {
      const t3 = Date.now();
      const unitPrice = (product.price as any)?.[size] ?? 0;
      await prisma.cartItem.updateMany({
        where: { userId, productId, size },
        data: {
          quantity: newQty,
          unitPrice,
          totalPrice: unitPrice * newQty,
        },
      });
      info(`[${rid}] PATCH cartItem updated`, { quantity: newQty, took: since(t3) });
    }

    // 🚫 เดิม: อัปเดต stock จริงตาม diff — ปิดไว้จนกว่าจะชำระเงิน
    // ... (โค้ดเดิมของคุณถูกเก็บไว้เป็นคอมเมนต์)

    // ✅ ตอบกลับพร้อมสต๊อกปัจจุบัน (ไม่ได้เปลี่ยน)
    const t4 = Date.now();
    const freshProductNow = await prisma.product.findUnique({ where: { id: productId } });
    const productStock = (freshProductNow?.stock || {}) as Record<string, number>;
    info(`[${rid}] PATCH fresh product stock re-read`, { took: since(t4) });

    info(`[${rid}] PATCH success`, { took_total: since(started) });
    return NextResponse.json(
      { message: "อัปเดตจำนวนเรียบร้อย (ยังไม่ตัดสต๊อกจนกว่าจะชำระเงิน)", size, quantity: newQty, productStock },
      { status: 200 }
    );
  } catch (err) {
    error(`[${rid}] ❌ PATCH cart error:`, err);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตสินค้าได้" }, { status: 500 });
  }
}

// ---------- DELETE - ลบสินค้าออกจากตะกร้า (✅ ไม่คืนสต๊อกจริง) ----------
export async function DELETE(req: NextRequest) {
  const started = Date.now();
  const rid = genReqId();

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    error(`[${rid}] DELETE body parse error`, e);
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const { userId, productId, size } = body;
  info(`[${rid}] DELETE /api/cart`, { userId, productId, size });

  if (!userId || !productId || !size) {
    warn(`[${rid}] DELETE invalid payload`, body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบ (userId, productId, size)" },
      { status: 400 }
    );
  }

  try {
    // หา cart item ก่อนลบ เพื่อดึงจำนวน (เดิมใช้คืนสต๊อก—ตอนนี้ไม่คืน)
    const t1 = Date.now();
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });
    info(`[${rid}] DELETE existingCartItem fetched`, {
      found: Boolean(existingCartItem),
      took: since(t1),
    });

    if (!existingCartItem) {
      warn(`[${rid}] DELETE cartItem not found`, { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    // ลบ item ออกจากตะกร้า
    const t2 = Date.now();
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId, size },
    });
    info(`[${rid}] DELETE deleteMany result`, { ...deleted, took: since(t2) });

    // 🚫 เดิม: คืน stock ให้ product ตามจำนวนที่อยู่ใน cart — ปิดไว้
    // ... (โค้ดเดิมของคุณถูกเก็บไว้เป็นคอมเมนต์)

    info(`[${rid}] DELETE success`, { took_total: since(started) });
    // ✅ ใหม่: ไม่คืนสต๊อก—ตอบกลับสถานะทั่วไป
    return NextResponse.json(
      {
        message: "ลบสินค้าเรียบร้อย (ไม่ได้คืนสต๊อก—จะตัด/คืนที่ขั้นตอนชำระเงิน)",
        productId,
        size,
      },
      { status: 200 }
    );
  } catch (err) {
    error(`[${rid}] ❌ DELETE cart error:`, err);
    return NextResponse.json({ error: "ไม่สามารถลบสินค้าได้" }, { status: 500 });
  }
}
