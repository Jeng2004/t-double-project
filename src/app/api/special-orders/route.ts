// src/app/api/special-orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

/** ตรวจว่าเป็น ObjectId */
function looksLikeObjectId(id: unknown) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

/** แปลงเวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** Helper แปลงเลข */
function toInt(v: unknown, field: string) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) throw new Error(`ฟิลด์ ${field} ต้องเป็นตัวเลข`);
  return n;
}
function toFloat(v: unknown, field: string) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (Number.isNaN(n)) throw new Error(`ฟิลด์ ${field} ต้องเป็นตัวเลข`);
  return n;
}

/** ฟังก์ชันส่งเมล์ */
async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // 📌 ต้องเซ็ตค่าใน .env
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

/** ------------------ POST ------------------ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      email,
      firstName,
      lastName,
      phone,
      address,
      productType,
      model,
      quantity,
      sizeLabel,
      chest,
      length,
      notes,
      status,
    } = body ?? {};

    // ✅ ตรวจสอบผู้ใช้
    let user = null as Awaited<ReturnType<typeof prisma.user.findUnique>>;
    if (userId) {
      if (!looksLikeObjectId(userId)) {
        return NextResponse.json({ error: "userId ไม่ถูกต้อง" }, { status: 400 });
      }
      user = await prisma.user.findUnique({ where: { id: userId } });
    } else if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    } else {
      return NextResponse.json({ error: "ต้องระบุ userId หรือ email" }, { status: 400 });
    }

    if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
    if (user.status !== "active") return NextResponse.json({ error: "บัญชีนี้ไม่ active" }, { status: 403 });
    if (user.active === false) return NextResponse.json({ error: "บัญชีนี้ถูกปิดการใช้งาน" }, { status: 403 });

    // ✅ ตรวจฟิลด์
    if (!firstName || !lastName || !phone || !address || !productType || !model || !sizeLabel) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    // ✅ แปลงเลข
    const qty = toInt(quantity, "quantity");
    const chestNum = toFloat(chest, "chest");
    const lengthNum = toFloat(length, "length");
    if (qty < 10) {
      return NextResponse.json({ error: "ขั้นต่ำ 10 ตัวขึ้นไปสำหรับไซส์พิเศษ" }, { status: 400 });
    }

    const now = new Date();
    const thaiTime = formatToThaiTime(now);

    // ✅ สร้างออเดอร์
    const created = await prisma.specialOrder.create({
      data: {
        firstName,
        lastName,
        phone,
        email: email ?? user.email,
        address,
        productType,
        model,
        quantity: qty,
        sizeLabel,
        chest: chestNum,
        length: lengthNum,
        notes: notes ?? null,
        status: status || "pending",
        userId: user.id,
        createdAtThai: thaiTime,
      },
      include: { user: true },
    });

    // ✅ ส่งอีเมลแจ้งเตือน
    try {
      await sendEmail(
        created.email,
        "T-Double: ยืนยันคำสั่งทำเสื้อไซส์พิเศษ",
        `
          <h2>✅ สั่งซื้อสำเร็จ</h2>
          <p>เรียนคุณ <b>${created.firstName} ${created.lastName}</b></p>
          <p>คำสั่งซื้อของคุณถูกบันทึกแล้ว</p>
          <ul>
            <li><b>สินค้า:</b> ${created.productType} (${created.model})</li>
            <li><b>จำนวน:</b> ${created.quantity} ตัว</li>
            <li><b>ไซส์พิเศษ:</b> ${created.sizeLabel} (อก ${created.chest} นิ้ว, ยาว ${created.length} นิ้ว)</li>
          </ul>
          <p><b>วันที่สั่งซื้อ:</b> ${created.createdAtThai}</p>
          <hr/>
          <p>ขอบคุณที่สั่งซื้อกับเรา 🙏</p>
        `
      );
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    return NextResponse.json({ message: "ส่งคำสั่งซื้อเรียบร้อย + แจ้งเตือนทางเมล", order: created }, { status: 201 });
  } catch (err: any) {
    console.error("❌ POST /special-orders error:", err);
    return NextResponse.json({ error: err.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
