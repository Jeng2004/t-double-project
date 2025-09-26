// src/app/api/return-special-orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

/** Helper: เวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** Helper: ส่งอีเมล */
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ EMAIL_USER/EMAIL_PASS not set. Skipping email send.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/** ---------------- POST: ลูกค้าส่งคำขอคืนสินค้า ---------------- */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const orderId = formData.get("orderId") as string | null;
    const reason = formData.get("reason") as string | null;
    const files = formData.getAll("images") as File[];

    if (!orderId) {
      return NextResponse.json(
        { error: "ต้องระบุรหัสคำสั่งซื้อ (orderId)" },
        { status: 400 }
      );
    }

    if (!files || files.length < 1 || files.length > 5) {
      return NextResponse.json(
        { error: "ต้องแนบรูปอย่างน้อย 1 และไม่เกิน 5 รูป" },
        { status: 400 }
      );
    }

    // 🔎 หา SpecialOrder
    const order = await prisma.specialOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // ✅ เงื่อนไข: ต้องชำระเงินแล้ว + สถานะ = "จัดส่งสินค้าสำเร็จเเล้ว"
    if (!order.isApproved || order.status !== "จัดส่งสินค้าสำเร็จเเล้ว") {
      return NextResponse.json(
        { error: "สามารถคืนสินค้าได้เฉพาะคำสั่งซื้อที่จัดส่งสำเร็จแล้วเท่านั้น" },
        { status: 400 }
      );
    }

    // ✅ ตรวจสอบเวลาที่จัดส่งเสร็จ (ใช้ updatedAt ถ้ามี ไม่งั้นใช้ createdAt)
    const deliveredDate = order.updatedAt
      ? new Date(order.updatedAt)
      : new Date(order.createdAt);

    const now = new Date();
    const diffDays =
      (now.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 3) {
      return NextResponse.json(
        { error: "ไม่สามารถคืนสินค้าได้ เนื่องจากเกิน 3 วันหลังจัดส่งสำเร็จ" },
        { status: 400 }
      );
    }

    // ✅ เก็บไฟล์ลง public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const savedPaths: string[] = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, bytes);
      savedPaths.push(`/uploads/${fileName}`);
    }

    // ✅ บันทึกคำขอคืนสินค้า
    const returnRequest = await prisma.returnSpecialRequest.create({
      data: {
        specialOrderId: orderId,
        reason: reason || "ไม่ระบุเหตุผล",
        images: savedPaths,
        status: "pending",
      },
      include: { specialOrder: true },
    });

    const whenThai = formatToThaiTime(new Date());

    // 📧 แจ้งลูกค้า
    try {
      if (order.email) {
        await sendEmail(
          order.email,
          `T-Double: ส่งคำขอคืนสินค้า #${order.trackingId}`,
          `
            <h2>📦 คำขอคืนสินค้า</h2>
            <p>เรียนคุณ <b>${order.firstName} ${order.lastName}</b></p>
            <p>คำสั่งซื้อของคุณได้ส่งคำขอคืนสินค้าเรียบร้อยแล้ว</p>
            <p><b>เหตุผล:</b> ${reason}</p>
            <p><b>เวลา:</b> ${whenThai}</p>
            <p>แนบรูปจำนวน: ${savedPaths.length} รูป</p>
            <p>⏳ ทีมงานจะตรวจสอบและติดต่อกลับภายใน 3–5 วันทำการ</p>
          `
        );
      }
    } catch (e) {
      console.error("❌ ส่งเมลแจ้งลูกค้าล้มเหลว:", e);
    }

    return NextResponse.json(
      {
        message: "✅ ส่งคำขอคืนสินค้าเรียบร้อย",
        request: returnRequest,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Return Special Order error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถส่งคำขอคืนสินค้าได้" },
      { status: 500 }
    );
  }
}
