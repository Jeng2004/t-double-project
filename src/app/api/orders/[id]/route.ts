import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

const allowedStatus = ["ยกเลิก", "รอดำเนินการ", "กำลังดำเนินการจัดเตรียมสินค้า", "กำลังดำเนินการจัดส่งสินค้า", "จัดส่งสินค้าสำเร็จเเล้ว"] as const;
type OrderStatus = (typeof allowedStatus)[number];

// สร้าง transporter สำหรับส่งอีเมล
const transporter = nodemailer.createTransport({
  service: "gmail", // หรือ smtp อื่น ๆ
  auth: {
    user: process.env.EMAIL_USER, // อีเมลของคุณ
    pass: process.env.EMAIL_PASS, // App password (ไม่ใช่ password จริง)
  },
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const { status } = await req.json();

    if (!status || !allowedStatus.includes(status)) {
      return NextResponse.json(
        { error: `status ต้องเป็นหนึ่งใน: ${allowedStatus.join(", ")}` },
        { status: 400 }
      );
    }

    // หา order พร้อม user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true }, // ต้องมี relation order → user
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { user: true },
    });

    // ส่งอีเมลแจ้งเตือน
    if (updatedOrder.user?.email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: updatedOrder.user.email,
        subject: `อัปเดตสถานะคำสั่งซื้อ #${updatedOrder.id}`,
        text: `คำสั่งซื้อของคุณถูกอัปเดตเป็นสถานะ: ${status}`,
        html: `<p>คำสั่งซื้อของคุณถูกอัปเดตเป็นสถานะ: <b>${status}</b></p>`,
      });
    }

    return NextResponse.json(
      { message: "✅ อัปเดตสถานะสำเร็จ และส่งการเเจ้งเตือนไปที่อีเมลแล้ว", order: updatedOrder },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error updating order:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
