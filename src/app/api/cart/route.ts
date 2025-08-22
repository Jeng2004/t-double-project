import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 📦 GET - ดูตะกร้าของ user พร้อมราคา + stock ปัจจุบัน
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");

  if (!userId) {
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

    const enrichedItems = cartItems.map((item) => {
      const size = item.size as keyof typeof item.product.price;
      const unitPrice = item.product?.price?.[size] ?? 0;
      const totalPrice = unitPrice * item.quantity;

      // ✅ ดึง stock ปัจจุบันของ size นี้
      const stockBySize = item.product?.stock as Record<string, number>;
      const availableStock = stockBySize?.[size] ?? 0;

      return {
        ...item,
        unitPrice,
        totalPrice,
        availableStock, // เพิ่ม field stock ปัจจุบัน
      };
    });

    return NextResponse.json(enrichedItems, { status: 200 });
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
  const { userId, productId, quantity, size } = await req.json();

  if (!userId || !productId || quantity <= 0 || !size) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    // ✅ ตรวจสอบ stock ของ size นั้น
    const stockBySize = product.stock as Record<string, number>; // สมมติว่ามี field product.stock เก็บจำนวนตามไซส์
    const availableStock = stockBySize?.[size] ?? 0;

    // หา item เดิมที่ user เคยใส่แล้ว
    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });

    const requestedQty = existingItem ? existingItem.quantity + quantity : quantity;

    if (requestedQty > availableStock) {
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
      result = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: requestedQty,
          unitPrice,
          totalPrice,
        },
      });
    } else {
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
  const { userId, productId, quantity, size } = await req.json();

  if (!userId || !productId || quantity < 0 || !size) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity/size ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const unitPrice = (product.price as Record<string, number>)[size];
    if (typeof unitPrice !== "number") {
      return NextResponse.json({ error: "ไม่พบราคาของไซส์นี้" }, { status: 400 });
    }

    // ✅ ตรวจสอบ stock ก่อนอัปเดต
    const stockBySize = product.stock as Record<string, number>; // สมมติว่าเก็บ stock แยกตาม size
    const availableStock = stockBySize?.[size] ?? 0;

    if (quantity > availableStock) {
      return NextResponse.json(
        { error: "สินค้าในสต็อกไม่เพียงพอ" },
        { status: 409 } // Conflict
      );
    }

    if (quantity === 0) {
      await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      return NextResponse.json({ message: "ลบสินค้าเรียบร้อย" }, { status: 200 });
    }

    const updated = await prisma.cartItem.updateMany({
      where: { userId, productId, size },
      data: {
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity, // อัปเดต totalPrice ด้วย
      },
    });

    if (updated.count === 0) {
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
  const { userId, productId, size } = await req.json();

  if (!userId || !productId || !size) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบ (userId, productId, size)" },
      { status: 400 }
    );
  }

  try {
    // ลบ item ออกจากตะกร้า
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId, size },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    // ✅ ดึง product มาหา stock ปัจจุบัน
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const stockBySize = product?.stock as Record<string, number>;
    const availableStock = stockBySize?.[size] ?? 0;

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