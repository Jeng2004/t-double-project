// /api/orders/return/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// แปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ส่งอีเมล
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ ไม่มีการตั้งค่า EMAIL_USER/EMAIL_PASS ข้ามการส่งอีเมล");
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
  console.log(`📧 ส่งอีเมลไปยัง ${to} สำเร็จ`);
}

/* GET ReturnRequest */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: { 
        items: { include: { orderItem: { include: { product: true } } } },
        order: { include: { user: true } },
      },
    });
    if (!request) return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    return NextResponse.json(request, { status: 200 });
  } catch (err) {
    console.error("❌ GET ReturnRequest error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลได้" }, { status: 500 });
  }
}

/* PATCH อนุมัติ/ปฏิเสธ */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { status, adminNote, refundAmount } = await req.json();

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }

    // ดึง ReturnRequest + Order + User
    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: { include: { orderItem: { include: { product: true } } } },
        order: { include: { user: true } },
      },
    });
    if (!request) return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });

    console.log(`📦 ReturnRequest พบ: id=${id}, orderId=${request.orderId}, status=${request.status}, user=${request.order.user.email}`);

    // กันกดซ้ำ
    if (request.status !== "รอดำเนินการ") {
      return NextResponse.json(
        { error: `ไม่สามารถอัปเดตได้ เนื่องจากสถานะปัจจุบันคือ '${request.status}'` },
        { status: 400 }
      );
    }

    // อัปเดต ReturnRequest
    const updated = await prisma.returnRequest.update({
      where: { id },
      data: { status, adminNote: adminNote ?? null, updatedAt: new Date() },
      include: {
        order: { include: { user: true } },
        items: { include: { orderItem: { include: { product: true } } } },
      },
    });

    // ถ้า approved → อัปเดต Order, คืน Stock, คืนเงิน
    if (status === "approved") {
      await prisma.order.update({
        where: { id: updated.orderId },
        data: { status: "ลูกค้าคืนสินค้า", updatedAt: new Date() },
      });

      // คืน Stock
      for (const item of updated.items) {
        const product = item.orderItem?.product;
        if (product) {
          const stock: Record<string, number> = product.stock as any;
          stock[item.orderItem.size] += item.quantity;
          await prisma.product.update({ where: { id: product.id }, data: { stock } });
          console.log(`📦 คืน Stock -> ${product.name} [${item.orderItem.size}]`);
        }
      }

      // คืนเงิน Stripe
      try {
        if (updated.order.isPaid && updated.order.paymentIntentId) {
          const refundData: Stripe.RefundCreateParams = { payment_intent: updated.order.paymentIntentId };
          if (refundAmount && refundAmount > 0) refundData.amount = Math.round(refundAmount * 100);

          const refund = await stripe.refunds.create(refundData);
          console.log(`💸 Stripe Refund สร้างแล้ว: refundId=${refund.id}, amount=${refund.amount / 100} บาท`);

          // log ตรวจสอบสถานะ
          const refundStatus = await stripe.refunds.retrieve(refund.id);
          console.log(`💰 Refund status: ${refundStatus.status}`);
        }
      } catch (err) {
        console.error("❌ Stripe Refund error:", err);
      }
    }

    // ส่งอีเมลแจ้งลูกค้า
    try {
      await sendEmail(
        updated.order.user.email,
        `T-Double คำขอคืนสินค้า #${updated.order.trackingId}`,
        `
        <h2>📢 ผลการตรวจสอบคำขอคืนสินค้า</h2>
        <p>สถานะ: <b>${status === "approved" ? "อนุมัติ" : "ปฏิเสธ"}</b></p>
        <p>คำสั่งซื้อ: ${updated.order.id}</p>
        <p>Tracking: ${updated.order.trackingId}</p>
        ${adminNote ? `<p>หมายเหตุจากแอดมิน: ${adminNote}</p>` : ""}
        ${status === "approved" ? `<p>💰 เงินที่ชำระจะคืนเข้าบัญชีของคุณภายใน 2–3 วันทำการ</p>` : ""}
        <p>เวลาดำเนินการ: ${formatToThaiTime(new Date())}</p>
        `
      );
    } catch (err) {
      console.error("❌ ส่งอีเมลล้มเหลว:", err);
    }

    return NextResponse.json({ message: `อัปเดตสถานะคำขอเป็น ${status} เรียบร้อย`, request: updated }, { status: 200 });
  } catch (err) {
    console.error("❌ PATCH error:", err);
    return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
  }
}

/* DELETE: soft delete */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const request = await prisma.returnRequest.findUnique({ where: { id } });
    if (!request) return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: { status: "cancelled", updatedAt: new Date() },
    });

    return NextResponse.json({ message: "ยกเลิกคำขอคืนสินค้าเรียบร้อย", request: updated }, { status: 200 });
  } catch (err) {
    console.error("❌ DELETE error:", err);
    return NextResponse.json({ error: "ไม่สามารถยกเลิกคำขอคืนสินค้าได้" }, { status: 500 });
  }
}
