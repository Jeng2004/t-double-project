import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ---------------------- LOG helpers ----------------------
const LOG_PREFIX = "🧾 StripeWebhook";
const log  = (...a: any[]) => console.log(LOG_PREFIX, ...a);
const info = (...a: any[]) => console.info(LOG_PREFIX, ...a);
const warn = (...a: any[]) => console.warn(LOG_PREFIX, ...a);
const err  = (...a: any[]) => console.error(LOG_PREFIX, ...a);

// ---------------------- Retry helpers for P2034 (deadlock/write conflict) ----------------------
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
function isWriteConflict(e: unknown) {
  return typeof e === "object" && e !== null && (e as any).code === "P2034";
}
async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { retries = 5, baseDelayMs = 150, label = "tx" } = opts;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (!isWriteConflict(e) || attempt > retries) {
        err("withPrismaRetry give up", { label, attempt, code: (e as any)?.code });
        throw e;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
      warn("withPrismaRetry P2034 — retrying", { label, attempt, backoff });
      await sleep(backoff);
    }
  }
}

// ---------------------- ฟังก์ชันแปลงเวลาไทย ----------------------
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ---------------------- ฟังก์ชันสร้างสลิป PDF ----------------------
async function generateSlip(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf");

      if (!fs.existsSync(fontPath)) {
        throw new Error("ไม่พบฟอนต์ NotoSansThai-Regular.ttf");
      }

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        font: fontPath,
      });

      doc.registerFont("NotoThai", fontPath);
      doc.font("NotoThai");

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // Header
      doc.fontSize(20).text("ใบเสร็จรับเงิน / Payment Slip", { align: "center" });
      doc.moveDown();

      // Order Info
      doc.fontSize(12).text(`หมายเลขออเดอร์: ${order.id}`);
      doc.text(`Tracking ID: ${order.trackingId}`);
      doc.text(`ลูกค้า: ${order.user?.name ?? "-"}`);
      doc.text(`อีเมล: ${order.user?.email ?? "-"}`);
      doc.text(`วันที่: ${formatToThaiTime(order.createdAt)}`);
      doc.moveDown();

      // รายการสินค้า
      doc.fontSize(14).text("รายละเอียดสินค้า:");
      doc.moveDown();
      order.orderItems.forEach((item: any, index: number) => {
        doc.fontSize(12).text(
          `${index + 1}. ${item.product.name} (${item.size}) x ${item.quantity} - ${item.totalPrice.toLocaleString()} บาท`
        );
      });

      doc.moveDown();
      doc.fontSize(14).text(`💰 ยอดรวมทั้งหมด: ${order.totalAmount.toLocaleString()} บาท`, {
        align: "right",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------- ฟังก์ชันส่งอีเมล ----------------------
async function sendSlipEmail(to: string, buffer: Buffer, orderId: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject: `สลิปการชำระเงินสำหรับ Order #${orderId}`,
    text: "กรุณาดูไฟล์สลิปที่แนบมา",
    attachments: [
      {
        filename: `slip-${orderId}.pdf`,
        content: buffer,
      },
    ],
  });
}

// ---------------------- Webhook อัปเดตคำสั่งซื้อ + หักสต๊อก + ล้างตะกร้า ----------------------
export async function POST(req: NextRequest) {
  info("Webhook POST received");
  const sig = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    info("Stripe event constructed", { type: event.type });
  } catch (e: any) {
    err("❌ Error verifying webhook:", e?.message);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      log("checkout.session.completed payload", {
        id: session.id,
        payment_intent: session.payment_intent,
        mode: session.mode,
        metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
      });

      const orderId = session.metadata?.orderId;
      log("Resolved orderId from metadata", { orderId });

      if (!orderId) {
        warn("No orderId in metadata");
      } else {
        // โหลดคำสั่งซื้อ (ใช้เพื่อเช็ก idempotency และรายละเอียด)
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { orderItems: { include: { product: true } }, user: true },
        });

        if (!order) {
          warn("Order not found", { orderId });
        } else {
          // ---------- Idempotency: กัน Stripe รีทรายแล้วอัปเดตซ้ำ ----------
          if (order.isPaid || order.paymentIntentId) {
            info("Order already processed (idempotent skip)", {
              orderId,
              isPaid: order.isPaid,
              hasPI: Boolean(order.paymentIntentId),
            });
            return NextResponse.json({ received: true }, { status: 200 });
          }

          // ---------- ทำงานหลักในทรานแซกชัน พร้อมรีทราย ----------
          const updatedOrder = await withPrismaRetry(
            () =>
              prisma.$transaction(async (tx) => {
                // หักสต๊อกตาม orderItems
                for (const item of order.orderItems) {
                  const product = await tx.product.findUnique({ where: { id: item.productId } });
                  if (!product) {
                    warn("Product not found while deducting stock", { productId: item.productId });
                    continue;
                  }

                  const stock: Record<string, number> = (product.stock as any) || {};
                  const before = Number(stock[item.size] ?? 0);

                  log("📊 ก่อนหัก", { product: product.name, size: item.size, before });
                  stock[item.size] = Math.max(0, before - item.quantity);
                  log("✅ หลังหัก", { product: product.name, size: item.size, after: stock[item.size], deduct: item.quantity });
                  log("📦 Stock ปัจจุบัน", stock);

                  await tx.product.update({
                    where: { id: product.id },
                    data: { stock },
                  });
                }

                // อัปเดตสถานะการจ่ายเงิน + บันทึก PI
                const updated = await tx.order.update({
                  where: { id: orderId },
                  data: {
                    isPaid: true,
                    status: "รอดำเนินการ",
                    paymentIntentId: session.payment_intent as string,
                    updatedAt: new Date(),
                  },
                  include: { user: true, orderItems: { include: { product: true } } },
                });

                // ❌ โค้ดเดิม (คอมเมนต์เก็บไว้ตามคำขอ "อย่าลบโค้ดฉัน")
                // await tx.cartItem.deleteMany({ where: { userId: order.userId } });

                return updated;
              }),
            { label: "order-update-tx" }
          );

          // ---------- ล้างตะกร้านอกทรานแซกชัน + รีทราย ----------
          await withPrismaRetry(
            () => prisma.cartItem.deleteMany({ where: { userId: updatedOrder.userId } }),
            { label: "cart-clear" }
          );

          info("📦 อัปเดตคำสั่งซื้อ + หักสต๊อก + ล้างตะกร้าสำเร็จ", { orderId });

          // ---------------------- ส่งสลิป ----------------------
          try {
            if (updatedOrder.user?.email) {
              const pdfBuffer = await generateSlip(updatedOrder);
              await sendSlipEmail(updatedOrder.user.email, pdfBuffer, updatedOrder.id);
              info("📧 ส่งสลิปสำเร็จ", { to: updatedOrder.user.email });
            } else {
              warn("No user email on order, skip slip send", { orderId: updatedOrder.id });
            }
          } catch (e) {
            err("❌ ส่งสลิปล้มเหลว:", e);
          }
        }
      }
    } else {
      info("Event type not handled", { type: event.type });
    }

    info("Webhook processed OK");
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e) {
    err("❌ Error handling webhook:", e);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
