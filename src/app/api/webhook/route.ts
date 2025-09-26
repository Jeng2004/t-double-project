import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
  const sig = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❌ Error verifying webhook:", err.message);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("✅ Checkout Completed:", session.id);

      const orderId = session.metadata?.orderId;
      if (!orderId) {
        console.error("❌ ไม่มี orderId ใน metadata");
      } else {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { orderItems: { include: { product: true } }, user: true },
        });

        if (order && !order.isPaid) {
          const updatedOrder = await prisma.$transaction(async (tx) => {
            for (const item of order.orderItems) {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              if (!product) continue;

              const stock: Record<string, number> = product.stock as any;

              // 📝 Log ก่อนหัก
              console.log(
                `📊 ก่อนหัก -> ${product.name} [${item.size}] = ${stock[item.size]}`
              );

              stock[item.size] -= item.quantity;

              // 📝 Log หลังหัก
              console.log(
                `✅ หลังหัก -> ${product.name} [${item.size}] = ${stock[item.size]} (หักออก ${item.quantity})`
              );

              // 📝 Log รวม stock ทุกไซส์
              console.log("📦 Stock ปัจจุบัน:", stock);

              await tx.product.update({
                where: { id: product.id },
                data: { stock },
              });
            }

            const updated = await tx.order.update({
              where: { id: orderId },
              data: { 
                isPaid: true, 
                status: "รอดำเนินการ",
                paymentIntentId: session.payment_intent as string, // ✅ เก็บ paymentIntentId
              },
              include: { user: true, orderItems: { include: { product: true } } },
            });

            // 🧹 ✅ ล้างของในตะกร้า (หลังชำระเงินสำเร็จ)
            await tx.cartItem.deleteMany({ where: { userId: order.userId } });

            return updated;
          });

          console.log("📦 อัปเดตคำสั่งซื้อ + หักสต๊อก + ล้างตะกร้าสำเร็จ:", orderId);

          // ---------------------- ส่งสลิป ----------------------
          try {
            if (updatedOrder.user?.email) {
              const pdfBuffer = await generateSlip(updatedOrder);
              await sendSlipEmail(updatedOrder.user.email, pdfBuffer, updatedOrder.id);
              console.log("📧 ส่งสลิปสำเร็จ:", updatedOrder.user.email);
            }
          } catch (err) {
            console.error("❌ ส่งสลิปล้มเหลว:", err);
          }
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("❌ Error handling webhook:", err);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
