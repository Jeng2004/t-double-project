import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

// ฟังก์ชันแปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ฟังก์ชันส่งอีเมล
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

// ✅ API PATCH
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { status, adminNote } = await req.json();

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }

    // ✅ ดึง ReturnRequest + Order + User
    const request = await prisma.returnRequest.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: {
            orderItem: { include: { product: true } },
          },
        },
        order: { include: { user: true } },
      },
    });

    if (!request) {
      return NextResponse.json(
        { error: "ไม่พบคำขอคืนสินค้า" },
        { status: 404 }
      );
    }

    // ✅ Transaction
    await prisma.$transaction(async (tx) => {
      // 1) ลบ ReturnItem
      await tx.returnItem.deleteMany({
        where: { returnRequestId: params.id },
      });

      // 2) ลบ ReturnRequest
      await tx.returnRequest.delete({
        where: { id: params.id },
      });

      // 3) อัปเดตสถานะ Order → "รอดำเนินการ"
      await tx.order.update({
        where: { id: request.orderId },
        data: { status: "รอดำเนินการ" },
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

    // ✅ ส่งอีเมลแจ้งลูกค้า
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
        message: `✅ คำขอถูก ${status} และอัปเดต Order เป็น 'รอดำเนินการ' เรียบร้อย`,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error processing return request:", err);
    return NextResponse.json(
      { error: "ไม่สามารถดำเนินการได้" },
      { status: 500 }
    );
  }
}
