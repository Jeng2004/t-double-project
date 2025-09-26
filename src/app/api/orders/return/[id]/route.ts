// /api/orders/return/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

// 🕒 ฟังก์ชันแปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// 📧 ฟังก์ชันส่งอีเมล
async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"ร้านค้าออนไลน์" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/* -----------------------------------
   📦 GET: ดึงคำขอคืนสินค้าตาม id
----------------------------------- */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: { orderItem: { include: { product: true } } },
        },
        order: { include: { user: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }

    return NextResponse.json(request, { status: 200 });
  } catch (err) {
    console.error("❌ GET ReturnRequest error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลได้" }, { status: 500 });
  }
}

/* -----------------------------------
   ✏️ PATCH: อนุมัติ/ปฏิเสธ คำขอคืน
----------------------------------- */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { status, adminNote } = await req.json();

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }

    // ✅ ดึง ReturnRequest + Order + User
    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: { orderItem: { include: { product: true } } },
        },
        order: { include: { user: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }

    // ✅ Transaction
    await prisma.$transaction(async (tx) => {
      // 1) ลบ ReturnItem
      await tx.returnItem.deleteMany({ where: { returnRequestId: id } });

      // 2) ลบ ReturnRequest
      await tx.returnRequest.delete({ where: { id } });

      // 3) อัปเดตสถานะ Order
      await tx.order.update({
        where: { id: request.orderId },
        data: { status: "กำลังจัดส่งคืนสินค้า" },
      });

      // 4) ถ้าอนุมัติ → คืน stock
      if (status === "approved") {
        for (const item of request.items) {
          const product = item.orderItem?.product;
          if (product) {
            const stock: Record<string, number> = product.stock as any;
            stock[item.orderItem.size] += item.quantity;

            await tx.product.update({
              where: { id: product.id },
              data: { stock },
            });
          }
        }
      }
    });

    // 📧 ส่งอีเมลแจ้งลูกค้า
    try {
      await sendEmail(
        request.order.user.email,
        `T-Double คำขอคืนสินค้า #${request.order.trackingId}`,
        `
          <h2>📢 ผลการตรวจสอบคำขอคืนสินค้า</h2>
          <p>สถานะ: <b>${status === "approved" ? "อนุมัติ" : "ปฏิเสธ"}</b></p>
          <p>คำสั่งซื้อ: ${request.order.id}</p>
          <p>Tracking: ${request.order.trackingId}</p>
          ${adminNote ? `<p>📌 หมายเหตุจากแอดมิน: ${adminNote}</p>` : ""}
          <p>เวลาดำเนินการ: ${formatToThaiTime(new Date())}</p>
        `
      );
    } catch (err) {
      console.error("❌ ส่งอีเมลล้มเหลว:", err);
    }

    return NextResponse.json(
      {
        message: `✅ คำขอถูก ${status} และอัปเดต Order เป็น 'กำลังจัดส่งคืนสินค้า' เรียบร้อย`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ PATCH error:", err);
    return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
  }
}

/* -----------------------------------
   🗑️ DELETE: ยกเลิก/ลบคำขอคืน
----------------------------------- */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const request = await prisma.returnRequest.findUnique({ where: { id } });
    if (!request) {
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }

    // ลบ ReturnItem + ReturnRequest
    await prisma.$transaction([
      prisma.returnItem.deleteMany({ where: { returnRequestId: id } }),
      prisma.returnRequest.delete({ where: { id } }),
    ]);

    return NextResponse.json({ message: "✅ ลบคำขอคืนสินค้าเรียบร้อย" }, { status: 200 });
  } catch (err) {
    console.error("❌ DELETE error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบคำขอคืนสินค้าได้" }, { status: 500 });
  }
}