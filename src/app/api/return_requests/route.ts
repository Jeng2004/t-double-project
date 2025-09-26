import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🕒 ฟังก์ชันแปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/* -----------------------------------
   📦 GET: ดึงคำขอคืนสินค้าทั้งหมด (เวลาไทย)
----------------------------------- */
export async function GET(_req: NextRequest) {
  try {
    const requests = await prisma.returnRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { orderItem: { include: { product: true } } },
        },
        order: { include: { user: true } },
      },
    });

    // 🔄 map เพื่อเปลี่ยนเวลาเป็นไทย และกันค่า null
    const formattedRequests = requests.map((r) => ({
      ...r,
      category: r.category ?? "",
      createdAt: formatToThaiTime(r.createdAt),
      updatedAt: formatToThaiTime(r.updatedAt),
    }));

    return NextResponse.json(formattedRequests, { status: 200 });
  } catch (err) {
    console.error("❌ GET ReturnRequests error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลได้" },
      { status: 500 }
    );
  }
}