import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// ---------------------- ฟังก์ชันแปลงเวลาไทย ----------------------
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ---------------------- ฟังก์ชันสร้างสลิป PDF ----------------------
async function generateSlip(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];

      // ใช้ฟอนต์ที่มีอยู่ในระบบ เช่น NotoSansThai-Regular.ttf
      const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf");

      if (!fs.existsSync(fontPath)) {
        throw new Error("ไม่พบฟอนต์ NotoSansThai-Regular.ttf");
      }

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        font: fontPath,
      });

      doc.registerFont("NotoThai", fontPath);
      doc.font("NotoThai");

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // Header
      doc.fontSize(20).text("ใบเสร็จรับเงิน / Payment Slip", { align: "center" });
      doc.moveDown(2); // เว้นระยะห่างจากหัวข้อ

      // Order Info
      doc.fontSize(12).text(`หมายเลขออเดอร์: ${order.id}`);
      doc.moveDown(0.5); // เว้นระยะห่างระหว่างบรรทัด
      doc.text(`Tracking ID: ${order.trackingId}`);
      doc.moveDown(0.5);
      doc.text(`ลูกค้า: ${order.user?.name ?? "-"}`);
      doc.moveDown(0.5);
      doc.text(`อีเมล: ${order.user?.email ?? "-"}`);
      doc.moveDown(0.5);
      doc.text(`วันที่: ${formatToThaiTime(order.createdAt)}`);
      doc.moveDown(1); // เว้นระยะห่างระหว่างส่วนข้อมูลออเดอร์กับรายการสินค้า

      // รายการสินค้า
      doc.fontSize(14).text("รายละเอียดสินค้า:");
      doc.moveDown(1); // เว้นระยะห่าง

      order.orderItems.forEach((item: any, index: number) => {
        doc.fontSize(12).text(
          `${index + 1}. ${item.product.name} (${item.size}) x ${item.quantity} - ${item.totalPrice.toLocaleString()} บาท`
        );
        doc.moveDown(0.5); // เว้นระยะห่างหลังแต่ละรายการ
      });

      doc.moveDown(1); // เว้นระยะห่างก่อนยอดรวม
      doc.fontSize(14).text(`💰 ยอดรวมทั้งหมด: ${order.totalAmount.toLocaleString()} บาท`, {
        align: "right",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------- API สำหรับสร้างสลิป ----------------------

// POST: สำหรับสร้างสลิป
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId: string = body?.orderId;

    if (!orderId) {
      return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
    }

    // ดึงข้อมูลออเดอร์จากฐานข้อมูล
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // สร้างสลิป PDF
    const pdfBuffer = await generateSlip(order);

    // บันทึกสลิปลงฐานข้อมูล
    const slip = await prisma.slip.create({
      data: {
        orderId: order.id,
        userId: order.user?.id ?? '',
        pdfData: pdfBuffer, // เก็บ PDF เป็น Buffer
      },
    });

    // ส่ง PDF กลับไปใน response
    return new NextResponse(Buffer.from(pdfBuffer), {  // แปลง Buffer เป็น Uint8Array
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${orderId}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("❌ Error generating slip:", err);
    return NextResponse.json({ error: "ไม่สามารถสร้างสลิปได้" }, { status: 500 });
  }
}

// ---------------------- API สำหรับดึงสลิป ----------------------

// GET: สำหรับดึงสลิป
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
    }

    // ค้นหาสลิปจากฐานข้อมูล โดยใช้ `orderId`
    const slip = await prisma.slip.findFirst({
      where: { orderId: orderId }, // ค้นหาจาก orderId
    });

    if (!slip) {
      return NextResponse.json({ error: "ไม่พบสลิป" }, { status: 404 });
    }

    // ส่ง PDF กลับไปใน response
    return new NextResponse(Buffer.from(slip.pdfData), {  // แปลง pdfData เป็น Uint8Array
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${orderId}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("❌ Error retrieving slip:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงสลิปได้" }, { status: 500 });
  }
}
