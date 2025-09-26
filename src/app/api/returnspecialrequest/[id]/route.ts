// src/app/api/returnspecialrequest/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* -----------------------------------
   📦 GET: ดึง ReturnSpecialRequest ตาม id
----------------------------------- */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log(`🔎 GET ReturnSpecialRequest id=${id}`);

    const request = await prisma.returnSpecialRequest.findUnique({
      where: { id },
    });

    if (!request) {
      console.warn(`⚠️ ไม่พบ ReturnSpecialRequest id=${id}`);
      return NextResponse.json(
        { error: "ไม่พบคำขอคืนสินค้า" },
        { status: 404 }
      );
    }

    return NextResponse.json(request, { status: 200 });
  } catch (err) {
    console.error("❌ GET ReturnSpecialRequest error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลได้" },
      { status: 500 }
    );
  }
}
