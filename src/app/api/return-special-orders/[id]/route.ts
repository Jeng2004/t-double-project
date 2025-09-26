// src/app/api/return-special-orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** Helper: ส่งอีเมล */
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

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

/** ---------------- PATCH: Admin อนุมัติ/ปฏิเสธ การคืนสินค้า ---------------- */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params; // ✅ ต้อง await params
    const body = await req.json();
    const { status, adminNote } = body;

    if (!["อนุมัติ", "ปฏิเสธ"].includes(status)) {
      return NextResponse.json(
        { error: "status ต้องเป็น 'อนุมัติ' หรือ 'ปฏิเสธ'" },
        { status: 400 }
      );
    }

    // 🔎 หา returnSpecialRequest พร้อม specialOrder
    const request = await prisma.returnSpecialRequest.findUnique({
      where: { id },
      include: { specialOrder: true },
    });

    if (!request) {
      return NextResponse.json(
        { error: "ไม่พบคำขอคืนสินค้า" },
        { status: 404 }
      );
    }

    let refundId: string | null = null;

    // ✅ ถ้าอนุมัติ → Refund Stripe
    if (status === "อนุมัติ") {
      if (!request.specialOrder?.paymentIntentId) {
        return NextResponse.json(
          { error: "ไม่พบข้อมูลการชำระเงิน ไม่สามารถทำการคืนเงินได้" },
          { status: 400 }
        );
      }

      const refund = await stripe.refunds.create({
        payment_intent: request.specialOrder.paymentIntentId,
      });
      refundId = refund.id;

      // อัปเดต SpecialOrder ด้วย
      await prisma.specialOrder.update({
        where: { id: request.specialOrderId },
        data: {
          refundId,
          status: "ยกเลิก - คืนเงินเรียบร้อย",
        },
      });
    }

    // ✅ อัปเดตสถานะ + note แอดมิน
    const updated = await prisma.returnSpecialRequest.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote ?? null,
      },
      include: { specialOrder: true },
    });

    // ✅ ส่งอีเมลแจ้งลูกค้า
    try {
      if (updated.specialOrder?.email) {
        await sendEmail(
          updated.specialOrder.email,
          `ผลการตรวจสอบคำขอคืนสินค้า #${updated.specialOrder.trackingId}`,
          `
            <h2>📢 ผลการตรวจสอบคำขอคืนสินค้า</h2>
            <p>คำขอคืนสินค้า: <b>${status}</b></p>
            <p>หมายเลขออเดอร์: ${updated.specialOrder.id}</p>
            <p>Tracking ID: ${updated.specialOrder.trackingId}</p>
            ${
              status === "อนุมัติ"
                ? `<p>✅ เราได้ทำการคืนเงินเรียบร้อยแล้ว (Refund ID: ${refundId})<br/>เงินจะเข้าบัญชีของคุณภายใน 5–10 วันทำการ</p>`
                : `<p>❌ คำขอคืนสินค้าของคุณถูกปฏิเสธ</p>`
            }
            ${adminNote ? `<p><b>หมายเหตุจากแอดมิน:</b> ${adminNote}</p>` : ""}
          `
        );
      }
    } catch (mailErr) {
      console.error("❌ ส่งเมลแจ้งลูกค้าล้มเหลว:", mailErr);
    }

    return NextResponse.json(
      {
        message: `อัปเดตคำขอคืนสินค้าเป็น ${status} เรียบร้อย`,
        request: updated,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error in PATCH /return-special-orders/[id]:", err);
    return NextResponse.json(
      { error: "ไม่สามารถอัปเดตคำขอคืนสินค้าได้" },
      { status: 500 }
    );
  }
}
