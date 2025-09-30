import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

// ฟังก์ชันแปลงเวลาเป็นเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ฟังก์ชันสร้าง PDF สลิปจากเทมเพลต
async function generateSlipFromTemplate(order: any): Promise<Buffer> {
  try {
    // โหลดเทมเพลต PDF
    const templatePath = path.join(process.cwd(), "public", "template", "ใบเสร็จ (1).pdf");
    const templateBytes = fs.readFileSync(templatePath);

    const pdfDoc = await PDFDocument.load(templateBytes);

    // Register fontkit เพื่อรองรับฟอนต์ custom
    pdfDoc.registerFontkit(fontkit);

    // เข้าถึงหน้าของ PDF
    const page = pdfDoc.getPages()[0];

    // กำหนดฟอนต์
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf");
    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);

    // เติมข้อมูลลงในตำแหน่งต่างๆ
    page.drawText(`หมายเลขออเดอร์: ${order.id}`, { x: 150, y: 720, font, size: 12 });
    page.drawText(`Tracking ID: ${order.trackingId}`, { x: 150, y: 705, font, size: 12 });
    page.drawText(`ลูกค้า: ${order.user?.name ?? "-"}`, { x: 150, y: 690, font, size: 12 });
    page.drawText(`อีเมล: ${order.user?.email ?? "-"}`, { x: 150, y: 675, font, size: 12 });
    page.drawText(`วันที่: ${formatToThaiTime(order.createdAt)}`, { x: 150, y: 660, font, size: 12 });

    // เติมข้อมูลรายการสินค้า
    let yPosition = 635;
    order.orderItems.forEach((item: any, index: number) => {
      page.drawText(
        `${index + 1}. ${item.product.name} (${item.size}) x ${item.quantity} - ${item.totalPrice.toLocaleString()} บาท`,
        { x: 150, y: yPosition, font, size: 12 }
      );
      yPosition -= 15;
    });

    // เติมยอดรวม
    page.drawText(`ยอดรวมทั้งหมด: ${order.totalAmount.toLocaleString()} บาท`, { x: 150, y: yPosition, font, size: 14 });

    // สร้าง Buffer ของ PDF ใหม่
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);

  } catch (error) {
    throw new Error(`เกิดข้อผิดพลาดในการสร้างสลิป: ${error instanceof Error ? error.message : 'ไม่ระบุข้อผิดพลาด'}`);
  }
}

// ฟังก์ชันที่รองรับ HTTP POST method
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json(); // ดึงข้อมูลจาก request body

    if (!orderId) {
      return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
    }

    // ดึงข้อมูลออเดอร์จากฐานข้อมูล
    const prisma = new PrismaClient();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // สร้างสลิป PDF จากเทมเพลต
    const pdfBuffer = await generateSlipFromTemplate(order);

    // ส่งสลิป PDF กลับใน response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${order.id}.pdf`,
      },
    });
  } catch (err) {
    console.error("❌ Error generating slip:", err);
    return NextResponse.json({ error: "ไม่สามารถสร้างสลิปได้" }, { status: 500 });
  }
}
