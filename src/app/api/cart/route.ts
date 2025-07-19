import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// 📦 GET - ดูตะกร้าของ user
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
      include: { product: true },
    });
    return NextResponse.json(cartItems, { status: 200 });
  } catch (err) {
    console.error("❌ GET cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลตะกร้าได้" }, { status: 500 });
  }
}

// ➕ POST - เพิ่มสินค้าเข้าตะกร้า
export async function POST(req: NextRequest) {
  const { userId, productId, quantity } = await req.json();

  if (!userId || !productId || quantity <= 0) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    // ✅ ตรวจสอบว่า productId มีอยู่จริง
    const productExists = await prisma.product.findUnique({ where: { id: productId } });
    if (!productExists) {
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }

    const existingItem = await prisma.cartItem.findFirst({
      where: { userId, productId },
    });

    let result;
    if (existingItem) {
      result = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity },
      });
    } else {
      result = await prisma.cartItem.create({
        data: { userId, productId, quantity },
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("❌ POST cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถเพิ่มสินค้าได้" }, { status: 500 });
  }
}

// 🔄 PATCH - อัปเดตจำนวนสินค้า
export async function PATCH(req: NextRequest) {
  const { userId, productId, quantity } = await req.json();

  if (!userId || !productId || quantity < 0) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบหรือ quantity ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    if (quantity === 0) {
      await prisma.cartItem.deleteMany({ where: { userId, productId } });
      return NextResponse.json({ message: "ลบสินค้าเรียบร้อย" }, { status: 200 });
    }

    const updated = await prisma.cartItem.updateMany({
      where: { userId, productId },
      data: { quantity },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 404 });
    }

    return NextResponse.json({ message: "อัปเดตจำนวนเรียบร้อย" }, { status: 200 });
  } catch (err) {
    console.error("❌ PATCH cart error:", err);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตสินค้าได้" }, { status: 500 });
  }
}

// 🗑 DELETE - ลบสินค้าออกจากตะกร้า
export async function DELETE(req: NextRequest) {
  const { userId, productId } = await req.json();

  if (!userId || !productId) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบ" },
      { status: 400 }
    );
  }

  try {
    const deleted = await prisma.cartItem.deleteMany({
      where: { userId, productId },
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
