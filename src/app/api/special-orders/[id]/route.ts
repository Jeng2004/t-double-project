// src/app/api/special-orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

const allowedStatus = [
  "ยกเลิก",
  "รอดำเนินการ",
  "กำลังดำเนินการจัดเตรียมสินค้า",
  "กำลังดำเนินการจัดส่งสินค้า",
  "จัดส่งสินค้าสำเร็จเเล้ว",
] as const;
type OrderStatus = (typeof allowedStatus)[number];

/** ฟังก์ชันแปลงเวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** ฟังก์ชันส่งเมล */
async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  await transporter.sendMail({
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/** ------------------ PATCH: อัพเดทสถานะ + แจ้งเตือนเมล์ ------------------ */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log("📌 PATCH /special-orders id:", id);

    const body = await req.json();
    const { status } = body as { status: string };

    if (!status || !allowedStatus.includes(status as OrderStatus)) {
      return NextResponse.json(
        { error: `status ต้องเป็นหนึ่งใน: ${allowedStatus.join(", ")}` },
        { status: 400 }
      );
    }

    // ตรวจสอบว่ามี order จริงไหม
    const existing = await prisma.specialOrder.findUnique({ where: { id } });
    console.log("💡 Existing order:", existing);
    if (!existing) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // อัพเดทสถานะ
    const order = await prisma.specialOrder.update({
      where: { id },
      data: { status },
      include: { user: true },
    });

    // ส่งอีเมลแจ้งลูกค้า
    try {
      if (order.email) {
        await sendEmail(
          order.email,
          `T-Double: อัพเดทสถานะคำสั่งซื้อ #${order.id}`,
          `
            <h2>📢 แจ้งอัพเดทสถานะ</h2>
            <p>เรียนคุณ <b>${order.firstName} ${order.lastName}</b></p>
            <p>สถานะคำสั่งซื้อของคุณถูกอัพเดทเป็น: <b>${status}</b></p>
            <p><b>เวลาที่อัพเดท:</b> ${formatToThaiTime(new Date())}</p>
            <hr/>
            <p>ขอบคุณที่สั่งซื้อกับเรา 🙏</p>
          `
        );
      }
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    return NextResponse.json(
      { message: "อัพเดทสถานะเรียบร้อย + แจ้งเตือนเมล์", order },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("❌ PATCH error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถอัพเดทสถานะได้" },
      { status: 500 }
    );
  }
}

/** ------------------ GET: ดูรายละเอียดออเดอร์เดียว ------------------ */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log("📌 GET /special-orders id:", id);

    const order = await prisma.specialOrder.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    return NextResponse.json(order, { status: 200 });
  } catch (err: any) {
    console.error("❌ GET error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลได้" }, { status: 500 });
  }
}
