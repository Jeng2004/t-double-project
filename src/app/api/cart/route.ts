import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 📝 Logger helpers (ADD ONLY)
const logPrefix = "🧺 CartAPI";
const log = (...args: any[]) => console.log(logPrefix, ...args);
const info = (...args: any[]) => console.info(logPrefix, ...args);
const warn = (...args: any[]) => console.warn(logPrefix, ...args);

// 📦 GET - ดูตะกร้าของ user พร้อมราคา + stock ปัจจุบัน
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

    // 🔹 ADD: เคลียร์รายการที่สต็อก (size) หมดออกจากตะกร้าอัตโนมัติ
    const toRemoveIds: string[] = [];

    const enrichedItems = cartItems.map((item) => {
      const size = item.size as keyof typeof item.product.price;
      const unitPrice = item.product?.price?.[size] ?? 0;
      const totalPrice = unitPrice * item.quantity;

      // ✅ ดึง stock ปัจจุบันของ size นี้
      const stockBySize = item.product?.stock as Record<string, number>;
      const availableStock = stockBySize?.[size as string] ?? 0;

      log("GET item", {
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
      warn("GET removing out-of-stock cart items", { toRemoveIds });
      const delRes = await prisma.cartItem.deleteMany({
        where: { id: { in: toRemoveIds } },
      });
      info("GET deleteMany result:", delRes);
    }

    // ส่งกลับเฉพาะรายการที่ยังมีสต็อก
    const itemsAfterCleanup = enrichedItems.filter((i) => i.availableStock > 0);
    info("GET returning items after cleanup:", itemsAfterCleanup.length);

    return NextResponse.json(itemsAfterCleanup, { status: 200 });
  } catch (err) {
    console.error("❌ GET cart error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลตะกร้าได้" },
      { status: 500 }
    );
  }
}

// ➕ POST - เพิ่มสินค้าเข้าตะกร้า พร้อมตรวจสอบ stock
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, productId, quantity, size } = body;
  info("POST /api/cart", { userId, productId, quantity, size });

  if (!userId || !productId || quantity <= 0 || !size) {
    warn("POST invalid payload", body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      warn("POST product not found", { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    // ✅ ตรวจสอบ stock ของ size นั้น
    const stockBySize = product.stock as Record<string, number>; // สมมติว่ามี field product.stock เก็บจำนวนตามไซส์
    const availableStock = stockBySize?.[size] ?? 0;
    info("POST stock check", { productId, size, availableStock });

    // 🔹 ADD: ถ้าสต็อก size นี้หมด -> ลบ item เดิม (ถ้ามี) แล้วแจ้งเลย
    if (availableStock === 0) {
      warn("POST out of stock -> clearing existing cartItem", { userId, productId, size });
      const delRes = await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      info("POST deleteMany (out-of-stock) result:", delRes);
      return NextResponse.json(
        { error: "สินค้าหมดสต็อก และถูกนำออกจากตะกร้าแล้ว" },
        { status: 410 } // Gone
      );
    }

    // หา item เดิมที่ user เคยใส่แล้ว
    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });
    info("POST existingItem:", existingItem ? { id: existingItem.id, quantity: existingItem.quantity } : null);

    const requestedQty = existingItem ? existingItem.quantity + quantity : quantity;
    info("POST requestedQty vs available", { requestedQty, availableStock });

    if (requestedQty > availableStock) {
      warn("POST insufficient stock", { requestedQty, availableStock });
      return NextResponse.json(
        { error: "สินค้าในสต็อกไม่เพียงพอ" },
        { status: 409 } // Conflict
      );
    }

    const sizeKey = size as keyof typeof product.price;
    const unitPrice = product.price?.[sizeKey] ?? 0;
    const totalPrice = unitPrice * requestedQty;

    let result;
    if (existingItem) {
      info("POST updating existing cartItem", { id: existingItem.id, requestedQty, unitPrice, totalPrice });
      result = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: requestedQty,
          unitPrice,
          totalPrice,
        },
      });
    } else {
      info("POST creating new cartItem", { userId, productId, quantity, size, unitPrice, totalPrice });
      result = await prisma.cartItem.create({
        data: {
          userId,
          productId,
          quantity,
          size,
          unitPrice,
          totalPrice,
        },
      });
    }

    info("POST result cartItem id:", result.id);

    return NextResponse.json(
      {
        ...result,
        unitPrice,
        totalPrice,
        message: "เพิ่มสินค้าลงตะกร้าเรียบร้อย",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ POST cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มสินค้าได้" }, { status: 500 });
  }
}


// 🔄 PATCH - อัปเดตจำนวนสินค้าในตะกร้า พร้อมตรวจสอบ stock
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { userId, productId, quantity, size } = body;
  info("PATCH /api/cart", { userId, productId, quantity, size });

  if (!userId || !productId || quantity < 0 || !size) {
    warn("PATCH invalid payload", body);
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      warn("PATCH product not found", { productId });
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const unitPrice = (product.price as Record<string, number>)[size];
    if (typeof unitPrice !== "number") {
      warn("PATCH unitPrice missing for size", { size, productId });
      return NextResponse.json({ error: "ไม่พบราคาของไซส์นี้" }, { status: 400 });
    }

    // ✅ ตรวจสอบ stock ก่อนอัปเดต
    const stockBySize = product.stock as Record<string, number>; // สมมติว่าเก็บ stock แยกตาม size
    const availableStock = stockBySize?.[size] ?? 0;
    info("PATCH stock check", { productId, size, availableStock });

    // 🔹 ADD: สต็อก size นี้หมด -> ลบออกจากตะกร้าอัตโนมัติ
    if (availableStock === 0) {
      warn("PATCH out of stock -> deleting cartItem", { userId, productId, size });
      const delRes = await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      info("PATCH deleteMany (out-of-stock) result:", delRes);
      return NextResponse.json(
        { message: "สินค้าหมดสต็อก และถูกนำออกจากตะกร้าแล้ว" },
        { status: 200 }
      );
    }

    if (quantity > availableStock) {
      warn("PATCH insufficient stock", { quantity, availableStock });
      return NextResponse.json(
        { error: "สินค้าในสต็อกไม่เพียงพอ" },
        { status: 409 } // Conflict
      );
    }

    if (quantity === 0) {
      info("PATCH quantity=0 -> deleting cartItem", { userId, productId, size });
      const delRes = await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      info("PATCH deleteMany result:", delRes);
      return NextResponse.json({ message: "ลบสินค้าเรียบร้อย" }, { status: 200 });
    }

    info("PATCH updating cartItem", { userId, productId, size, quantity, unitPrice });
    const updated = await prisma.cartItem.updateMany({
      where: { userId, productId, size },
      data: {
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity, // อัปเดต totalPrice ด้วย
      },
    });
    info("PATCH updateMany result:", updated);

    if (updated.count === 0) {
      warn("PATCH cartItem not found to update", { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: "อัปเดตจำนวนเรียบร้อย",
        size,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ PATCH cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตสินค้าได้" }, { status: 500 });
  }
}


// 🗑 DELETE - ลบสินค้าออกจากตะกร้า + คืน stock ปัจจุบัน
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
    // ลบ item ออกจากตะกร้า
    info("DELETE deleting cartItem(s)", { userId, productId, size });
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId, size },
    });
    info("DELETE deleteMany result:", deleted);

    if (deleted.count === 0) {
      warn("DELETE cartItem not found", { userId, productId, size });
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    // ✅ ดึง product มาหา stock ปัจจุบัน
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const stockBySize = product?.stock as Record<string, number>;
    const availableStock = stockBySize?.[size] ?? 0;
    info("DELETE stock after removal", { productId, size, availableStock });

    return NextResponse.json(
      {
        message: "ลบสินค้าเรียบร้อย",
        productId,
        size,
        availableStock, // ส่ง stock ปัจจุบันกลับไปด้วย
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ DELETE cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบสินค้าได้" }, { status: 500 });
  }
}
