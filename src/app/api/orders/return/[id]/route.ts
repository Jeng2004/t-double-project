// /api/orders/return/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// 🕒 ฟังก์ชันแปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// 📧 ฟังก์ชันส่งอีเมล
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ ไม่มีการตั้งค่า EMAIL_USER/EMAIL_PASS ข้ามการส่งอีเมล");
    return;
  }
  console.log(`📧 กำลังส่งอีเมลไปยัง: ${to}, subject: ${subject}`);
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
  console.log("✅ ส่งอีเมลสำเร็จ");
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
    console.log(`🔎 GET ReturnRequest id=${id}`);

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
      console.warn(`⚠️ ไม่พบ ReturnRequest id=${id}`);
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }

    console.log(`✅ พบ ReturnRequest id=${id}, status=${request.status}`);
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
    const { status, adminNote, refundAmount } = await req.json();
    console.log(`✏️ PATCH id=${id}, status=${status}, refundAmount=${refundAmount}, adminNote=${adminNote}`);

    if (!["approved", "rejected"].includes(status)) {
      console.warn(`⚠️ Status ไม่ถูกต้อง: ${status}`);
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
      console.warn(`⚠️ ไม่พบ ReturnRequest id=${id}`);
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }
    console.log(`📦 พบ ReturnRequest id=${id}, orderId=${request.orderId}, user=${request.order.user.email}`);

    // 🚨 กันกดซ้ำ
    if (request.status !== "pending") {
      console.warn(`⛔ ไม่สามารถอัปเดต ReturnRequest id=${id} ได้ เนื่องจากสถานะปัจจุบันคือ '${request.status}'`);
      return NextResponse.json(
        { error: `ไม่สามารถอัปเดตได้ เนื่องจากสถานะปัจจุบันคือ '${request.status}'` },
        { status: 400 }
      );
    }

    // ✅ อัปเดต ReturnRequest
    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote ?? null,
        updatedAt: new Date(),
      },
      include: {
        order: { include: { user: true } },
        items: { include: { orderItem: { include: { product: true } } } },
      },
    });
    console.log(`✅ ReturnRequest อัปเดตแล้ว: id=${id}, status=${status}`);

    // ✅ ถ้าอนุมัติ → อัปเดต Order เป็น "ลูกค้าคืนสินค้า"
    if (status === "approved") {
      await prisma.order.update({
        where: { id: updated.orderId },
        data: {
          status: "ลูกค้าคืนสินค้า",
          updatedAt: new Date(),
        },
      });
      console.log(`🔄 Order ${updated.orderId} อัปเดตเป็น 'ลูกค้าคืนสินค้า'`);
    }

    // ✅ คืน Stock ถ้าอนุมัติ
    if (status === "approved") {
      for (const item of updated.items) {
        const product = item.orderItem?.product;
        if (product) {
          const stock: Record<string, number> = product.stock as any;
          const before = stock[item.orderItem.size];
          stock[item.orderItem.size] += item.quantity;
          const after = stock[item.orderItem.size];
          await prisma.product.update({
            where: { id: product.id },
            data: { stock },
          });
          console.log(`📦 คืน Stock -> ${product.name} [${item.orderItem.size}] ${before} ➝ ${after}`);
        }
      }
    }

    // ✅ คืนเงิน Stripe ถ้าอนุมัติ
    try {
      if (status === "approved" && updated.order.isPaid && updated.order.paymentIntentId) {
        const refundData: Stripe.RefundCreateParams = {
          payment_intent: updated.order.paymentIntentId,
        };
        if (refundAmount && refundAmount > 0) {
          refundData.amount = Math.round(refundAmount * 100);
          console.log(`💸 Partial Refund ${refundAmount} บาท`);
        } else {
          console.log(`💸 Full Refund ${updated.order.totalAmount} บาท`);
        }
        const refund = await stripe.refunds.create(refundData);
        console.log(`✅ Stripe Refund สำเร็จ: refundId=${refund.id}, amount=${refund.amount / 100}`);
      }
    } catch (refundErr) {
      console.error("❌ Stripe Refund error:", refundErr);
    }

    // 📧 ส่งอีเมลแจ้งลูกค้า
    try {
      console.log(`📧 กำลังส่งอีเมลถึง ${updated.order.user.email}`);
      await sendEmail(
        updated.order.user.email,
        `T-Double คำขอคืนสินค้า #${updated.order.trackingId}`,
        `
          <h2>📢 ผลการตรวจสอบคำขอคืนสินค้า</h2>
          <p>สถานะ: <b>${status === "approved" ? "อนุมัติ" : "ปฏิเสธ"}</b></p>
          <p>คำสั่งซื้อ: ${updated.order.id}</p>
          <p>Tracking: ${updated.order.trackingId}</p>
          ${adminNote ? `<p>📌 หมายเหตุจากแอดมิน: ${adminNote}</p>` : ""}
          <p>เวลาดำเนินการ: ${formatToThaiTime(new Date())}</p>
        `
      );
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    console.log(`✅ PATCH เสร็จสิ้น id=${id}, status=${status}`);
    return NextResponse.json(
      { message: `✅ อัปเดตสถานะคำขอเป็น ${status} เรียบร้อย และอัปเดต Order เป็น 'ลูกค้าคืนสินค้า'`, request: updated },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ PATCH error:", err);
    return NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 });
  }
}

/* -----------------------------------
   🗑️ DELETE: ยกเลิก/ลบคำขอคืน (soft delete)
----------------------------------- */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log(`🗑️ DELETE ReturnRequest id=${id}`);

    const request = await prisma.returnRequest.findUnique({ where: { id } });
    if (!request) {
      console.warn(`⚠️ ไม่พบ ReturnRequest id=${id}`);
      return NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 });
    }

    // ❌ ไม่ลบจริง แต่เปลี่ยนสถานะเป็น cancelled
    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    });
    console.log(`✅ ReturnRequest id=${id} เปลี่ยนเป็น cancelled`);

    return NextResponse.json(
      { message: "✅ ยกเลิกคำขอคืนสินค้าเรียบร้อย (soft delete)", request: updated },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ DELETE error:", err);
    return NextResponse.json({ error: "ไม่สามารถยกเลิกคำขอคืนสินค้าได้" }, { status: 500 });
  }
}
