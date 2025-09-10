// src/app/api/products/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs"; // Prisma ใช้กับ Edge ไม่ได้

// ป้องกันสร้าง PrismaClient ซ้ำตอน dev/hot reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const VALID_SIZES = ["S", "M", "L", "XL"] as const;
type SizeKey = typeof VALID_SIZES[number];

function isValidObjectIdHex(s: string) {
  return /^[0-9a-fA-F]{24}$/.test(s);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const name = searchParams.get("name");
    const size = searchParams.get("size");

    const page  = Math.max(1, Number(searchParams.get("page")  ?? 1));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const skip  = (page - 1) * limit;

    // สร้าง where เฉพาะเงื่อนไขที่ Prisma รองรับได้โดยตรง
    const where: any = {};

    if (productId) {
      if (!isValidObjectIdHex(productId)) {
        return NextResponse.json({ message: "Product ID ไม่ถูกต้อง" }, { status: 400 });
      }
      // Mongo + Prisma: id เป็น String (ObjectId mapped)
      where.id = productId;
    }

    if (name) {
      // ค้นหาชื่อแบบ case-insensitive
      where.name = { contains: name, mode: "insensitive" };
    }

    // ดึงจาก DB ก่อน (กรอง size ทีหลังในเมมโมรี)
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    if (!products || products.length === 0) {
      return NextResponse.json({ message: "ไม่พบสินค้า", query: where, total }, { status: 404 });
    }

    // ถ้ามี filter size: คัดเฉพาะตัวที่มีราคาไซซ์นั้น และ “แบนราบ” output
    let sizeKey: SizeKey | null = null;
    if (size) {
      const s = size.toUpperCase();
      if (!VALID_SIZES.includes(s as SizeKey)) {
        return NextResponse.json({ message: "size ต้องเป็น S, M, L หรือ XL" }, { status: 400 });
      }
      sizeKey = s as SizeKey;
    }

    const filtered = sizeKey
      ? products.filter((p) => (p.price as any)?.[sizeKey!] !== undefined)
      : products;

    if (filtered.length === 0) {
      return NextResponse.json(
        { message: "ไม่พบสินค้า", query: { ...where, [`price.${sizeKey}`]: "exists" }, total: 0 },
        { status: 404 }
      );
    }

    const results = filtered.map((p) => {
      if (sizeKey) {
        const priceVal = (p.price as any)?.[sizeKey];
        const stockVal = (p.stock as any)?.[sizeKey];
        return {
          _id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          size: sizeKey,
          price: priceVal ?? null,
          stock: stockVal ?? null,
          imageUrls: p.imageUrls,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }
      return {
        _id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,   // object: { S,M,L,XL }
        stock: p.stock,   // object: { S,M,L,XL }
        imageUrls: p.imageUrls,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      total,                 // รวมก่อนกรอง size
      count: results.length, // จำนวนหลังกรอง size (ถ้ามี)
      results,
    });
  } catch (err: any) {
    console.error("GET /api/products/search (prisma) error:", err);
    return NextResponse.json({ message: err.message ?? "Internal Server Error" }, { status: 500 });
  }
}