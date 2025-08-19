import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 📦 GET - ดูตะกร้าของ user พร้อมราคา
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
      include: { product: true }, // ดึงข้อมูลสินค้า (รวม price object)
    });

    const enrichedItems = cartItems.map((item) => {
      const size = item.size as keyof typeof item.product.price;
      const unitPrice = item.product?.price?.[size] ?? 0;
      const totalPrice = item.unitPrice * item.quantity; // ใช้ unitPrice ที่เก็บในฐานข้อมูล

      return {
        ...item,
        unitPrice,
        totalPrice,
      };
    });

    return NextResponse.json(enrichedItems, { status: 200 });
  } catch (err) {
    console.error("❌ GET cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลตะกร้าได้" }, { status: 500 });
  }
}

// ➕ POST - เพิ่มสินค้าเข้าตะกร้า พร้อม unitPrice และ totalPrice
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

    const sizeKey = size as keyof typeof product.price;
    const unitPrice = product.price?.[sizeKey] ?? 0;
    const totalPrice = unitPrice * quantity;

    // ตรวจสอบว่ามีสินค้าในตะกร้าอยู่แล้วหรือไม่
    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId, size },
    });

    let result;
    if (existingItem) {
      result = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
          unitPrice,
          totalPrice, // อัปเดต unitPrice และ totalPrice
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
          totalPrice, // เก็บ unitPrice และ totalPrice ตอนที่สร้าง
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

// 🔄 PATCH - อัปเดตจำนวนสินค้าในตะกร้า
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

    if (quantity === 0) {
      await prisma.cartItem.deleteMany({ where: { userId, productId, size } });
      return NextResponse.json({ message: "ลบสินค้าเรียบร้อย" }, { status: 200 });
    }

    const updated = await prisma.cartItem.updateMany({
      where: { userId, productId, size },
      data: { quantity },
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

// 🗑 DELETE - ลบสินค้าออกจากตะกร้า
export async function DELETE(req: NextRequest) {
  const { userId, productId, size } = await req.json();

  if (!userId || !productId || !size) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบ (userId, productId, size)" },
      { status: 400 }
    );
  }

  try {
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId, size },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    return NextResponse.json({ message: "ลบสินค้าเรียบร้อย" }, { status: 200 });
  } catch (err) {
    console.error("❌ DELETE cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบสินค้าได้" }, { status: 500 });
  }
}
