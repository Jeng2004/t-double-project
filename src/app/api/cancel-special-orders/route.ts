import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

/** เวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false });
}

/** ฟังก์ชันส่งอีเมล */
async function sendEmail(to: string | string[], subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ EMAIL_USER/EMAIL_PASS not set. Skipping email send.");
    return;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({ from: `"T-Double" <${process.env.EMAIL_USER}>`, to, subject, html });
}

/** ---------------- PATCH: ยกเลิก Special Order ---------------- */
export async function PATCH(req: NextRequest) {
  try {
    const { id, cancelReason } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ต้องระบุรหัสคำสั่งซื้อ (id)" }, { status: 400 });
    }

    // ดึง order เดิม
    const order = await prisma.specialOrder.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }
    if (order.status === "ยกเลิก") {
      return NextResponse.json({ message: "ออเดอร์นี้ถูกยกเลิกไปแล้ว", order }, { status: 409 });
    }

    // ✅ ยกเลิกออเดอร์
    const canceled = await prisma.specialOrder.update({
      where: { id },
      data: { status: "ยกเลิก", cancelReason: cancelReason || null },
      include: { user: true },
    });

    const whenThai = formatToThaiTime(new Date());

    // 📧 ส่งอีเมลถึงลูกค้า
    try {
      if (canceled.email) {
        await sendEmail(
          canceled.email,
          `T-Double: คำสั่งซื้อ #${canceled.id} ถูกยกเลิก`,
          `
            <h2>❌ คำสั่งซื้อถูกยกเลิก</h2>
            <p>เรียนคุณ <b>${canceled.firstName} ${canceled.lastName}</b></p>
            <p>คำสั่งซื้อของคุณถูกยกเลิกแล้ว</p>
            <p><b>เหตุผล:</b> ${canceled.cancelReason ?? "-"}</p>
            <p><b>เวลา:</b> ${whenThai}</p>
          `
        );
      }
    } catch (e) {
      console.error("❌ ส่งเมลลูกค้าล้มเหลว:", e);
    }

    return NextResponse.json({ message: "ออเดอร์ถูกยกเลิกเรียบร้อย", order: canceled }, { status: 200 });
  } catch (err) {
    console.error("❌ Cancel Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถยกเลิกคำสั่งซื้อได้" }, { status: 500 });
  }
}

/** ---------------- DELETE: ลบ Special Order ออกจากระบบ ---------------- */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ต้องระบุรหัสคำสั่งซื้อ (id)" }, { status: 400 });
    }

    // ตรวจสอบก่อนว่ามี order จริงหรือไม่
    const order = await prisma.specialOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // ลบออเดอร์
    await prisma.specialOrder.delete({ where: { id } });

    return NextResponse.json({ message: "ลบคำสั่งซื้อเรียบร้อย", id }, { status: 200 });
  } catch (err) {
    console.error("❌ DELETE Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบคำสั่งซื้อได้" }, { status: 500 });
  }
}
