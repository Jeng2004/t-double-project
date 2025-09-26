import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

/** ส่งอีเมล */
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ ไม่มี EMAIL_USER/EMAIL_PASS — ข้ามการส่งอีเมล");
    return;
  }
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const orderId = formData.get("orderId") as string | null;
    const reason = formData.get("reason") as string | null;
    const files = formData.getAll("images") as File[];

    // ✅ ตรวจ items
    const itemsRaw = formData.get("items") as string | null;
    if (!itemsRaw) {
      return NextResponse.json({ error: "ต้องส่ง items เป็น JSON string" }, { status: 400 });
    }

    let items: { orderItemId: string; quantity: number }[];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return NextResponse.json({ error: "items ไม่ใช่ JSON ที่ถูกต้อง", raw: itemsRaw }, { status: 400 });
    }

    if (!orderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "ต้องระบุ orderId และ items" }, { status: 400 });
    }

    if (!files || files.length < 1 || files.length > 5) {
      return NextResponse.json({ error: "ต้องแนบรูปอย่างน้อย 1 และไม่เกิน 5 รูป" }, { status: 400 });
    }

    // ✅ หา order + user + orderItems
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, orderItems: true },
    });
    if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });

    // ✅ ต้องจัดส่งสำเร็จแล้ว
    if (order.status !== "จัดส่งสินค้าสำเร็จเเล้ว" && order.status !== "จัดส่งสินค้าสำเร็จแล้ว") {
      return NextResponse.json(
        { error: "ไม่สามารถส่งคำขอคืนสินค้าได้ เนื่องจากออเดอร์ยังไม่ได้จัดส่งสำเร็จ" },
        { status: 400 }
      );
    }

    // ✅ ภายใน 3 วันหลังจัดส่ง (ใช้ updatedAt เป็นเวลาจัดส่ง หากไม่มีให้ถอยไปใช้ createdAt)
    const deliveredAt = (order as any).updatedAt ?? order.createdAt;
    const now = new Date().getTime();
    const diffDays = (now - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 3) {
      return NextResponse.json(
        { error: "ไม่สามารถคืนสินค้าได้ เนื่องจากเกิน 3 วันหลังจัดส่ง" },
        { status: 400 }
      );
    }

    // ✅ ตรวจสินค้า/จำนวน + กันคืนซ้ำ
    for (const item of items) {
      const orderItem = order.orderItems.find((oi) => oi.id === item.orderItemId);
      if (!orderItem) {
        return NextResponse.json({ error: `ไม่พบสินค้าในคำสั่งซื้อ: ${item.orderItemId}` }, { status: 400 });
      }
      if (item.quantity <= 0 || item.quantity > orderItem.quantity) {
        return NextResponse.json(
          { error: `จำนวนคืน (${item.quantity}) ไม่ถูกต้อง (ต้องระหว่าง 1 ถึง ${orderItem.quantity})` },
          { status: 400 }
        );
      }
      const existingReturn = await prisma.returnItem.findUnique({ where: { orderItemId: item.orderItemId } });
      if (existingReturn) {
        return NextResponse.json(
          { error: `สินค้านี้ (orderItemId: ${item.orderItemId}) ได้ถูกส่งคำขอคืนไปแล้ว` },
          { status: 400 }
        );
      }
    }

    // ✅ อัปโหลดรูป
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const savedPaths: string[] = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const fileName = `${Date.now()}-${safeName}`;
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
        status: "pending", // ← ให้ตรงกับสคีมาฝั่ง main
        items: {
          create: items.map((it) => ({
            orderItemId: it.orderItemId,
            quantity: it.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // ✅ ส่งอีเมลยืนยัน
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

    return NextResponse.json({ message: "✅ ส่งคำขอคืนสินค้าเรียบร้อย", request }, { status: 201 });
  } catch (err) {
    console.error("❌ Error creating return request:", err);
    return NextResponse.json({ error: "ไม่สามารถส่งคำขอคืนสินค้าได้" }, { status: 500 });
  }
}
