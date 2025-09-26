import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/** ฟังก์ชันแปลงเวลาเป็นเวลาไทย */
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** ฟังก์ชันสร้าง PDF สลิป */
async function generateSlip(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const fontPath = path.join(
        process.cwd(),
        "public",
        "fonts",
        "NotoSansThai-Regular.ttf"
      );

      if (!fs.existsSync(fontPath)) {
        throw new Error("❌ ไม่พบฟอนต์ NotoSansThai-Regular.ttf ที่ public/fonts/");
      }

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        autoFirstPage: false, // ปิดการสร้างหน้าแรกอัตโนมัติ
      });

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // ✅ โหลดฟอนต์ไทย
      doc.registerFont("NotoThai", fontPath);

      // ✅ addPage โดยใช้ฟอนต์ไทยทันที
      doc.addPage({ margin: 50 }).font("NotoThai");

      // Header
      doc.fontSize(20).text("ใบเสร็จรับเงิน / Payment Slip", { align: "center" });
      doc.moveDown();

      // Order Info
      doc.fontSize(12).text(`หมายเลขออเดอร์: ${order.id}`);
      doc.text(`Tracking ID: ${order.trackingId}`);
      doc.text(`ลูกค้า: ${order.user?.name ?? "-"}`);
      doc.text(`อีเมล: ${order.user?.email ?? "-"}`);
      doc.text(`วันที่: ${formatToThaiTime(order.createdAt)}`);
      doc.moveDown();

      // รายการสินค้า
      doc.fontSize(14).text("รายละเอียดสินค้า:");
      doc.moveDown();

      order.orderItems.forEach((item: any, index: number) => {
        doc.fontSize(12).text(
          `${index + 1}. ${item.product.name} (${item.size}) x ${item.quantity} - ${item.totalPrice.toLocaleString()} บาท`
        );
      });

      doc.moveDown();
      doc
        .fontSize(14)
        .text(`💰 ยอดรวมทั้งหมด: ${order.totalAmount.toLocaleString()} บาท`, {
          align: "right",
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** ฟังก์ชันส่ง Email พร้อมแนบสลิป */
async function sendSlipEmail(to: string, buffer: Buffer, orderId: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject: `สลิปการชำระเงินสำหรับ Order #${orderId}`,
    text: "กรุณาดูไฟล์สลิปที่แนบมา",
    attachments: [
      {
        filename: `slip-${orderId}.pdf`,
        content: buffer,
      },
    ],
  });
}

/** API POST: สร้าง + ส่งสลิป */
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }
    if (!order.isPaid) {
      return NextResponse.json(
        { error: "ออเดอร์นี้ยังไม่ได้ชำระเงิน" },
        { status: 400 }
      );
    }

    // ✅ Generate Slip
    const pdfBuffer = await generateSlip(order);

    // ✅ ส่งอีเมล
    if (order.user?.email) {
      await sendSlipEmail(order.user.email, pdfBuffer, order.id);
    }

    // ✅ ส่ง PDF กลับไปใน response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${order.id}.pdf`,
      },
    });
  } catch (err) {
    console.error("❌ Error generating slip:", err);
    return NextResponse.json(
      { error: "ไม่สามารถสร้างสลิปได้" },
      { status: 500 }
    );
  }
}
