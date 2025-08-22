import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

/** ฟังก์ชันส่งอีเมล */
async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"ร้านค้าออนไลน์" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const orderId = formData.get("orderId") as string | null;
    const reason = formData.get("reason") as string | null;
    const files = formData.getAll("images") as File[];

    // ✅ ตรวจสอบ itemsRaw ก่อน parse
    const itemsRaw = formData.get("items") as string | null;
    if (!itemsRaw) {
      return NextResponse.json(
        { error: "ต้องส่ง items เป็น JSON string" },
        { status: 400 }
      );
    }

    let items: { orderItemId: string; quantity: number }[];
    try {
      items = JSON.parse(itemsRaw);
    } catch (e) {
      return NextResponse.json(
        { error: "items ไม่ใช่ JSON ที่ถูกต้อง", raw: itemsRaw },
        { status: 400 }
      );
    }

    if (!orderId || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "ต้องระบุ orderId และ items" },
        { status: 400 }
      );
    }

    if (!files || files.length < 1 || files.length > 5) {
      return NextResponse.json(
        { error: "ต้องแนบรูปอย่างน้อย 1 และไม่เกิน 5 รูป" },
        { status: 400 }
      );
    }

    // ✅ ค้นหา order + user + orderItems
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, orderItems: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // ✅ ตรวจสอบสินค้าและจำนวน
    for (const item of items) {
      const orderItem = order.orderItems.find((oi) => oi.id === item.orderItemId);
      if (!orderItem) {
        return NextResponse.json(
          { error: `ไม่พบสินค้าในคำสั่งซื้อ: ${item.orderItemId}` },
          { status: 400 }
        );
      }
      if (item.quantity > orderItem.quantity) {
        return NextResponse.json(
          {
            error: `จำนวนคืน (${item.quantity}) เกินกว่าที่ซื้อ (${orderItem.quantity})`,
          },
          { status: 400 }
        );
      }

      // ✅ กันไม่ให้คืนซ้ำ
      const existingReturn = await prisma.returnItem.findUnique({
        where: { orderItemId: item.orderItemId },
      });
      if (existingReturn) {
        return NextResponse.json(
          { error: `สินค้านี้ (orderItemId: ${item.orderItemId}) ได้ถูกส่งคำขอคืนไปแล้ว` },
          { status: 400 }
        );
      }
    }

    // ✅ เก็บรูปลง public/uploads
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

    // ✅ สร้าง ReturnRequest + ReturnItem
    const request = await prisma.returnRequest.create({
      data: {
        orderId,
        reason: reason ?? "",
        images: savedPaths,
        status: "รอดำเนินการ",
        items: {
          create: items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // ✅ ส่งอีเมลแจ้งลูกค้า
    try {
      await sendEmail(
        order.user.email,
        `คำขอคืนสินค้า #${order.trackingId}`,
        `
          <h2>📦 คำขอคืนสินค้าของคุณถูกส่งแล้ว</h2>
          <p>สวัสดีคุณ <b>${order.user.name ?? ""}</b></p>
          <p>หมายเลขคำสั่งซื้อ: ${order.id}</p>
          <p>Tracking ID: ${order.trackingId}</p>
          <p><b>เหตุผล:</b> ${reason ?? "ไม่ระบุ"}</p>
          <p>สถานะ: ${request.status}</p>
          <p>แนบรูปจำนวน: ${savedPaths.length} รูป</p>
          <hr />
          <p>ทีมงานจะตรวจสอบและแจ้งผลให้ทราบภายหลังค่ะ 🙏</p>
        `
      );
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    return NextResponse.json(
      { message: "✅ ส่งคำขอคืนสินค้าเรียบร้อย", request },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ Error creating return request:", err);
    return NextResponse.json({ error: "ไม่สามารถส่งคำขอคืนสินค้าได้" }, { status: 500 });
  }
}
