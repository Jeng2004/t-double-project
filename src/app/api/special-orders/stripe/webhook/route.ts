import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// 📝 LOG: helpers (เพิ่ม)
const LOG_PREFIX = "🧾 StripeWebhook";
const log  = (...a: any[]) => console.log(LOG_PREFIX, ...a);
const info = (...a: any[]) => console.info(LOG_PREFIX, ...a);
const warn = (...a: any[]) => console.warn(LOG_PREFIX, ...a);
const err  = (...a: any[]) => console.error(LOG_PREFIX, ...a);

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
    warn("⚠️ EMAIL_USER/EMAIL_PASS not set. Skipping email send.");
    return;
  }
  // 📝 LOG:
  info("Preparing to send email", { to, subject });

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

  // 📝 LOG:
  info("Email sent successfully");
}

export async function POST(req: NextRequest) {
  // 📝 LOG:
  info("Webhook POST received");

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  // 📝 LOG:
  log("Headers check", {
    hasStripeSignature: Boolean(sig),
    contentType: req.headers.get("content-type"),
  });

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // 📝 LOG:
    info("Stripe event constructed", { type: event.type });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // 📝 LOG:
      log("checkout.session.completed payload", {
        id: session.id,
        payment_intent: session.payment_intent,
        mode: session.mode,
        metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
      });

      const orderId = session.metadata?.orderId;

      // 📝 LOG:
      log("Resolved orderId from metadata", { orderId });

      if (orderId) {
        const updated = await prisma.specialOrder.update({
          where: { id: orderId },
          data: {
            // 🔧 เปลี่ยนสถานะหลังจ่ายสำเร็จเป็น "รอดำเนินการ"
            status: "รอดำเนินการ",
            paymentIntentId: session.payment_intent as string, // ✅ เก็บ PaymentIntentId
          },
        });

        // 📝 LOG:
        info("Order updated after payment", {
          orderId: updated.id,
          newStatus: updated.status,
          hasEmail: Boolean(updated.email),
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
                <p>⏳ สถานะปัจจุบัน: รอดำเนินการ</p>
                <p>ระยะเวลาผลิตโดยประมาณ: 7–14 วัน</p>
              `
            );
          } else {
            warn("No email found on order, skipping email send", { orderId: updated.id });
          }
        } catch (e) {
          err("❌ ส่งเมลแจ้งลูกค้าล้มเหลว:", e);
        }
      } else {
        warn("No orderId in session.metadata — cannot update order");
      }
    } else {
      // 📝 LOG:
      info("Event type not handled", { type: event.type });
    }

    // 📝 LOG:
    info("Webhook processed OK");
    return NextResponse.json({ received: true });
  } catch (error) {
    err("❌ Webhook error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
