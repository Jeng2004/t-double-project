import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** คืนเวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false });
}

/** ส่งอีเมล */
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

// ✅ PATCH: ยกเลิกออเดอร์ + คืนสต็อก + คืนเงิน Stripe
export async function PATCH(req: NextRequest) {
  try {
    const { id, cancelReason, refundAmount } = await req.json(); // ✅ รองรับ partial refund
    if (!id) {
      return NextResponse.json({ error: "ต้องระบุรหัสคำสั่งซื้อ (id)" }, { status: 400 });
    }

    // หาออเดอร์
    const order = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    console.log(`📦 ออเดอร์ ${order.id} สถานะปัจจุบัน: ${order.status}`);

    // ❌ ไม่ต้องตรวจซ้ำ
    if (order.status === "ยกเลิก") {
      return NextResponse.json({ message: "ออเดอร์นี้ถูกยกเลิกไปแล้ว", order }, { status: 409 });
    }

    // ❌ ถ้าออเดอร์อยู่ใน "กำลังดำเนินการจัดส่งสินค้า" หรือ "จัดส่งสินค้าสำเร็จแล้ว" -> ห้ามยกเลิก
    if (order.status === "กำลังดำเนินการจัดส่งสินค้า" || order.status === "จัดส่งสินค้าสำเร็จแล้ว") {
      return NextResponse.json(
        { error: `ไม่สามารถยกเลิกออเดอร์ได้ เนื่องจากสถานะปัจจุบันคือ "${order.status}"` },
        { status: 400 }
      );
    }

    // ❌ อนุญาตยกเลิกได้เฉพาะ "รอดำเนินการ" และ "กำลังดำเนินการจัดเตรียมสินค้า"
    if (order.status !== "รอดำเนินการ" && order.status !== "กำลังดำเนินการจัดเตรียมสินค้า") {
      return NextResponse.json(
        { error: `ไม่สามารถยกเลิกออเดอร์ได้ เนื่องจากสถานะปัจจุบันคือ "${order.status}"` },
        { status: 400 }
      );
    }

    // ✅ Transaction: อัพเดทสถานะ + คืน stock
    const result = await prisma.$transaction(async (tx) => {
      const canceledOrder = await tx.order.update({
        where: { id },
        data: { status: "ยกเลิก", cancelReason: cancelReason || null },
        include: { orderItems: { include: { product: true } }, user: true },
      });

      for (const item of canceledOrder.orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const stock: Record<string, number> = product.stock as any;

        console.log(`📊 Stock ก่อนคืน -> ${product.name} [${item.size}] = ${stock[item.size]}`);
        stock[item.size] += item.quantity; // ✅ คืนจำนวนสินค้า
        console.log(`✅ Stock หลังคืน -> ${product.name} [${item.size}] = ${stock[item.size]} (คืน ${item.quantity})`);

        await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });
      }

      return canceledOrder;
    });

    // ✅ คืนเงิน Stripe โดยใช้ paymentIntentId
    try {
      if (order.isPaid && order.paymentIntentId) {
        const refundData: Stripe.RefundCreateParams = {
          payment_intent: order.paymentIntentId,
        };

        if (refundAmount && refundAmount > 0) {
          refundData.amount = Math.round(refundAmount * 100); // แปลงเป็นสตางค์
          console.log(`💸 Partial Refund -> ${refundAmount} บาท (paymentIntent: ${order.paymentIntentId})`);
        } else {
          console.log(`💸 Full Refund -> ${order.totalAmount} บาท (paymentIntent: ${order.paymentIntentId})`);
        }

        const refund = await stripe.refunds.create(refundData);

        // 📝 Log จำนวนเงินจริงที่ Stripe คืน
        console.log(
          `✅ คืนเงิน Stripe สำเร็จ: ${refund.id} | จำนวนเงินที่คืนจริง: ${refund.amount / 100} บาท | สถานะ: ${refund.status}`
        );
      }
    } catch (refundErr) {
      console.error("❌ คืนเงิน Stripe ล้มเหลว:", refundErr);
    }

    // ✅ ส่งอีเมลแจ้งลูกค้า
    try {
      if (result.user?.email) {
        await sendEmail(
          result.user.email,
          `T-Double: คำสั่งซื้อ #${result.trackingId} ถูกยกเลิก`,
          `
            <h2>❌ คำสั่งซื้อถูกยกเลิก</h2>
            <p>เรียนคุณ <b>${result.user.name ?? ""}</b></p>
            <p>คำสั่งซื้อของคุณถูกยกเลิกแล้ว</p>
            <p><b>เหตุผล:</b> ${result.cancelReason ?? "-"}</p>
            <p><b>เวลาที่ยกเลิก:</b> ${formatToThaiTime(new Date())}</p>
            ${order.isPaid ? "<p>💸 ระบบได้ดำเนินการคืนเงินให้คุณเรียบร้อยแล้ว</p>" : ""}
            <hr />
            <p>ขอบคุณที่ใช้บริการ 🙏</p>
          `
        );
      }
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    console.log(`✅ ออเดอร์ ${id} ถูกยกเลิกสำเร็จ`);
    return NextResponse.json(
      {
        message:
          "ออเดอร์ถูกยกเลิก + คืนสต็อกเรียบร้อย" +
          (order.isPaid ? " + คืนเงินแล้ว" : ""),
        order: result,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Cancel Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถยกเลิกคำสั่งซื้อได้" }, { status: 500 });
  }
}
