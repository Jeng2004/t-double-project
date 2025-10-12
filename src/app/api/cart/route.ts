// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 📝 Logger helpers
const logPrefix = "🧺 CartAPI";
const log = (...args: any[]) => console.log(logPrefix, ...args);
const info = (...args: any[]) => console.info(logPrefix, ...args);
const warn = (...args: any[]) => console.warn(logPrefix, ...args);

// ---------- GET - ดูตะกร้าของ user พร้อมราคา + stock ปัจจุบัน (ไม่ลบ item อัตโนมัติ) ----------
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  info("GET /api/cart", { userId });

  if (!userId) {
    warn("GET missing userId");
    return NextResponse.json(
      { error: "กรุณาระบุ userId ใน query string" },
      { status: 400 }
    );
  }

  try {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: { product: true }, // ดึงข้อมูลสินค้า (รวม price และ stock object)
    });
    info("GET cartItems count:", cartItems.length);

    const enrichedItems = cartItems.map((item) => {
      const size = item.size as keyof typeof item.product.price;
      const unitPrice = (item.product?.price as any)?.[size] ?? 0;
      const totalPrice = unitPrice * item.quantity;

      // ดึง stock ปัจจุบันของ size นี้
      const stockBySize = (item.product?.stock || {}) as Record<string, number>;
      const availableStock = stockBySize?.[size as string] ?? 0;

      log("GET item", {
        cartItemId: item.id,
        productId: item.productId,
        size,
        qty: item.quantity,
        unitPrice,
        availableStock,
      });

      return {
        ...item,
        unitPrice,
        totalPrice,
        availableStock,               // อาจเป็น 0 ได้
        outOfStock: availableStock === 0, // เผื่อ UI ใช้
      };
    });

    // ✅ ไม่ลบรายการออกแม้ availableStock = 0
    return NextResponse.json(enrichedItems, { status: 200 });
  } catch (err) {
    console.error("❌ GET cart error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลตะกร้าได้" },
      { status: 500 }
    );
  }
}

// ---------- POST - เพิ่มสินค้าเข้าตะกร้า (ไม่ลบ cart item เดิมเมื่อสต็อกหมด) ----------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, productId, quantity, size } = body;
  info("POST /api/cart", { userId, productId, quantity, size });

  if (!userId || !productId || !size || Number(quantity) <= 0) {
    warn("POST invalid payload", body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    // 1) ดึงสินค้า (fresh)
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      warn("POST product not found", { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const stockBySize = (product.stock || {}) as Record<string, number>;
    const availableStock = Number.isFinite(Number(stockBySize?.[size])) ? Number(stockBySize[size]) : 0;
    info("POST stock check", { productId, size, availableStock });

    if (availableStock === 0) {
      // ✅ ไม่ลบ cart item เดิมแล้ว แค่แจ้งว่าหมด
      return NextResponse.json(
        { error: "สินค้าหมดสต็อกในไซส์นี้" },
        { status: 410 }
      );
    }

    // 2) หา cart item เดิมของ user สำหรับ product+size
    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });

    const requestedQtyTotal = existingItem ? existingItem.quantity + Number(quantity) : Number(quantity);
    if (requestedQtyTotal > availableStock) {
      warn("POST insufficient stock", { requestedQtyTotal, availableStock });
      return NextResponse.json(
        { error: `สินค้าในสต็อกไม่เพียงพอ (คงเหลือ ${availableStock})` },
        { status: 409 }
      );
    }

    // 3) สร้าง/อัปเดต cartItem
    const sizeKey = size as keyof typeof product.price;
    const unitPrice = (product.price as any)?.[sizeKey] ?? 0;

    let cartResult;
    if (existingItem) {
      const newQty = existingItem.quantity + Number(quantity);
      const newTotalPrice = Number(unitPrice) * newQty;
      cartResult = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty, unitPrice, totalPrice: newTotalPrice },
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
    }

    // 4) อัปเดต stock ใน product (ลดจำนวนที่เพิ่มเข้าตะกร้า)
    const freshProduct = await prisma.product.findUnique({ where: { id: productId } });
    const freshStock = (freshProduct?.stock || {}) as Record<string, number>;
    const prevVal = Number.isFinite(Number(freshStock[size])) ? Number(freshStock[size]) : 0;
    const newVal = Math.max(0, prevVal - Number(quantity));
    const newStockObj = { ...(freshStock || {}) };
    newStockObj[size] = newVal;

    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStockObj },
    });

    info("POST updated stock for product", { productId, size, prevVal, newVal });

    // 5) ตอบกลับ
    return NextResponse.json(
      {
        ...cartResult,
        unitPrice,
        totalPrice: unitPrice * (existingItem ? existingItem.quantity + Number(quantity) : Number(quantity)),
        message: "เพิ่มสินค้าลงตะกร้าเรียบร้อย",
        productStock: newStockObj,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ POST cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มสินค้าได้" }, { status: 500 });
  }
}

// ---------- PATCH - อัปเดตจำนวนสินค้าในตะกร้า พร้อมปรับ stock ใน DB ----------
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { userId, productId, quantity, size } = body;
  info("PATCH /api/cart", { userId, productId, quantity, size });

  if (!userId || !productId || !size || typeof quantity !== "number" || quantity < 0) {
    warn("PATCH invalid payload", body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });
    if (!existingCartItem) {
      warn("PATCH cartItem not found", { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      warn("PATCH product not found", { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const stockBySize = (product.stock || {}) as Record<string, number>;
    const availableStock = Number.isFinite(Number(stockBySize?.[size])) ? Number(stockBySize[size]) : 0;
    info("PATCH stock check", { productId, size, availableStock });

    // diff = newQuantity - oldQuantity
    const diff = Number(quantity) - existingCartItem.quantity;

    if (diff > 0) {
      // ต้องการเพิ่มจำนวนในตะกร้า -> ตรวจสอบสต็อกให้พอ (ต้องเหลือ >= diff)
      if (diff > availableStock) {
        warn("PATCH insufficient stock", { diff, availableStock });
        return NextResponse.json({ error: "สินค้าในสต็อกไม่เพียงพอ" }, { status: 409 });
      }
    }

    // อัปเดต cart item
    if (quantity === 0) {
      // หากส่ง 0 -> ลบรายการ
      await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
    } else {
      await prisma.cartItem.updateMany({
        where: { userId, productId, size },
        data: {
          quantity,
          unitPrice: (product.price as any)?.[size] ?? 0,
          totalPrice: ((product.price as any)?.[size] ?? 0) * quantity,
        },
      });
    }

    // อัปเดต stock ใน product ตาม diff (ถ้า diff>0 ลด stock; ถ้า diff<0 คืน stock)
    const freshProduct = await prisma.product.findUnique({ where: { id: productId } });
    const freshStock = (freshProduct?.stock || {}) as Record<string, number>;
    const prevVal = Number.isFinite(Number(freshStock[size])) ? Number(freshStock[size]) : 0;
    const updatedStockForSize = Math.max(0, prevVal - Math.max(0, diff)); // ถ้า diff>0 ลด by diff; ถ้า diff<=0 ไม่ลด
    // หาก diff < 0 (ลดจำนวนในตะกร้า) ให้คืน stockแทน:
    const finalStockVal = diff < 0 ? prevVal + Math.abs(diff) : updatedStockForSize;
    const newStockObj = { ...(freshStock || {}) };
    newStockObj[size] = finalStockVal;

    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStockObj },
    });

    info("PATCH updated stock for product", { productId, size, prevVal, finalStockVal });

    return NextResponse.json(
      { message: "อัปเดตจำนวนเรียบร้อย", size, quantity, productStock: newStockObj },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ PATCH cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตสินค้าได้" }, { status: 500 });
  }
}

// ---------- DELETE - ลบสินค้าออกจากตะกร้า + คืน stock ปัจจุบัน ----------
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { userId, productId, size } = body;
  info("DELETE /api/cart", { userId, productId, size });

  if (!userId || !productId || !size) {
    warn("DELETE invalid payload", body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบ (userId, productId, size)" },
      { status: 400 }
    );
  }

  try {
    // หา cart item ก่อนลบ เพื่อดึงจำนวนที่จะคืนสต็อก
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });

    if (!existingCartItem) {
      warn("DELETE cartItem not found", { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    const restoreQty = existingCartItem.quantity;

    // ลบ item ออกจากตะกร้า
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId, size },
    });
    info("DELETE deleteMany result:", deleted);

    // คืน stock ให้ product ตามจำนวนที่อยู่ใน cart
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const freshStock = (product?.stock || {}) as Record<string, number>;
    const prevVal = Number.isFinite(Number(freshStock[size])) ? Number(freshStock[size]) : 0;
    const newVal = prevVal + restoreQty;
    const newStockObj = { ...(freshStock || {}) };
    newStockObj[size] = newVal;

    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStockObj },
    });

    info("DELETE restored stock for product", { productId, size, prevVal, newVal });

    return NextResponse.json(
      {
        message: "ลบสินค้าเรียบร้อย และคืนสต็อกแล้ว",
        productId,
        size,
        availableStock: newVal,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ DELETE cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบสินค้าได้" }, { status: 500 });
  }
}
