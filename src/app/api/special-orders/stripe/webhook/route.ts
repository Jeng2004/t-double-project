import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** Helper: เวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** Helper: ส่งอีเมล */
async function sendEmail(to: string | string[], subject: string, html: string) {
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

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        const updated = await prisma.specialOrder.update({
          where: { id: orderId },
          data: {
            status: "รอดำเนินการ - ระยะเวลาผลิตโดยประมาณ: 7–14 วัน",
            paymentIntentId: session.payment_intent as string, // ✅ เก็บ PaymentIntentId
          },
        });

        const whenThai = formatToThaiTime(new Date());

        // 📧 ส่งเมลแจ้งลูกค้า
        try {
          if (updated.email) {
            await sendEmail(
              updated.email,
              `T-Double: การชำระเงินสำเร็จ #${updated.id}`,
              `
                <h2>✅ การชำระเงินเสร็จสมบูรณ์</h2>
                <p>เรียนคุณ <b>${updated.firstName} ${updated.lastName}</b></p>
                <p>เราได้รับการชำระเงินสำหรับคำสั่งซื้อของคุณแล้ว</p>
                <p><b>สินค้า:</b> ${updated.productName} (${updated.color ?? "-"})</p>
                <p><b>จำนวน:</b> ${updated.quantity} ตัว</p>
                <p><b>ราคาทั้งหมด:</b> ${updated.price?.toLocaleString()} บาท</p>
                <p><b>เวลา:</b> ${whenThai}</p>
                <p>⏳ สถานะปัจจุบัน: รอดำเนินการ - ระยะเวลาผลิตประมาณ 7–14 วัน</p>
              `
            );
          }
        } catch (e) {
          console.error("❌ ส่งเมลแจ้งลูกค้าล้มเหลว:", e);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
