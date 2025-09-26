import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import nodemailer from "nodemailer";

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

/** ---------------- POST: Cancel Special Order ---------------- */
export async function POST(req: NextRequest) {
  try {
    const { orderId, reason } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "ต้องระบุรหัสคำสั่งซื้อ (orderId)" },
        { status: 400 }
      );
    }

    // 🔎 หาออเดอร์
    const order = await prisma.specialOrder.findUnique({
      where: { id: orderId },
    });

    console.log("💡 Order ที่ค้นพบ:", order);

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // ❌ ห้ามยกเลิกถ้าอยู่ระหว่างจัดส่งหรือจัดส่งสำเร็จแล้ว
    if (
      order.status === "กำลังดำเนินการจัดส่งสินค้า" ||
      order.status === "จัดส่งสินค้าสำเร็จเเล้ว"
    ) {
      return NextResponse.json(
        { error: "ไม่สามารถยกเลิกได้ เนื่องจากสินค้าอยู่ระหว่างจัดส่งหรือจัดส่งสำเร็จแล้ว" },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าเคยจ่ายเงินหรือยัง
    if (!order.isApproved || order.status.startsWith("รอชำระเงิน")) {
      return NextResponse.json(
        { error: "คำสั่งซื้อนี้ยังไม่ได้ชำระเงิน ไม่สามารถขอคืนได้" },
        { status: 400 }
      );
    }

    // ✅ ใช้ updatedAt ถ้ามี ถ้าไม่มี fallback ไปที่ createdAt
    const paidDate = order.updatedAt
      ? new Date(order.updatedAt)
      : new Date(order.createdAt);

    const now = new Date();
    const diffDays =
      (now.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24);

    console.log("💡 paidDate:", paidDate, "diffDays:", diffDays);

    if (diffDays > 3) {
      return NextResponse.json(
        { error: "ไม่สามารถยกเลิกได้ เนื่องจากเกิน 3 วันหลังชำระเงิน" },
        { status: 400 }
      );
    }

    // ✅ คืนเงินผ่าน Stripe
    if (!order.paymentIntentId) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลการชำระเงิน ไม่สามารถคืนเงินได้" },
        { status: 400 }
      );
    }

    const refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
    });

    // ✅ อัปเดตสถานะออเดอร์
    const canceled = await prisma.specialOrder.update({
      where: { id: orderId },
      data: {
        status: "ยกเลิก - คืนเงินเรียบร้อย",
        cancelReason: reason || "ไม่ระบุเหตุผล",
        refundId: refund.id,
      },
    });

    const whenThai = formatToThaiTime(new Date());

    // 📧 แจ้งลูกค้า
    try {
      if (canceled.email) {
        await sendEmail(
          canceled.email,
          `T-Double: คำสั่งซื้อ #${canceled.id} ถูกยกเลิกและคืนเงิน`,
          `
            <h2>❌ คำสั่งซื้อถูกยกเลิก</h2>
            <p>เรียนคุณ <b>${canceled.firstName} ${canceled.lastName}</b></p>
            <p>คำสั่งซื้อของคุณถูกยกเลิกและเราได้ทำการคืนเงินแล้ว</p>
            <p><b>เหตุผล:</b> ${canceled.cancelReason}</p>
            <p><b>เวลา:</b> ${whenThai}</p>
            <p>💸 เงินจะถูกคืนเข้าบัญชีของคุณภายใน 2–3 วัน</p>
          `
        );
      }
    } catch (e) {
      console.error("❌ ส่งเมลแจ้งลูกค้าล้มเหลว:", e);
    }

    return NextResponse.json(
      { message: "ออเดอร์ถูกยกเลิกและคืนเงินเรียบร้อย", order: canceled },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Cancel Special Order error:", err);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกคำสั่งซื้อได้" },
      { status: 500 }
    );
  }
}
