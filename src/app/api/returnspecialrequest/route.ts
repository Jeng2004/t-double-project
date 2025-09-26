// src/app/api/returnspecialrequest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* -----------------------------------
   📦 GET: ดึง ReturnSpecialRequest ทั้งหมด
----------------------------------- */
export async function GET(_req: NextRequest) {
  try {
    console.log("🔎 GET ReturnSpecialRequest All");

    const requests = await prisma.returnSpecialRequest.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests, { status: 200 });
  } catch (err) {
    console.error("❌ GET all ReturnSpecialRequest error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลได้" },
      { status: 500 }
    );
  }
}
