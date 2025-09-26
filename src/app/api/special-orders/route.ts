import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!); // ✅ ไม่ระบุ apiVersion

/** Helper: เวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** Helper: สร้าง Tracking ID */
function generateTrackingId(orderId: string) {
  const random = Math.floor(1000 + Math.random() * 9000); // ตัวเลข 4 หลัก
  return `TD-${orderId.slice(-6)}-${random}`;
}

/** Helper: ส่งอีเมล */
async function sendEmail(to: string | string[], subject: string, html: string) {
  console.log("📧 sendEmail called", { to, subject }); // log
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
  console.log("✅ Email sent successfully");
}

/** ---------------- POST: สร้าง Special Order ---------------- */
export async function POST(req: NextRequest) {
  console.log("📌 POST /special-orders called");
  try {
    const body = await req.json();
    console.log("📥 POST request body:", body);

    const {
      firstName,
      lastName,
      phone,
      email,
      address,
      category,
      productName,
      color,
      quantity,
      sizeDetail,
      userId,
    } = body;

    // ✅ Validate input
    if (
      !firstName ||
      !lastName ||
      !phone ||
      !email ||
      !address ||
      !category ||
      !productName ||
      !quantity ||
      !sizeDetail ||
      !userId
    ) {
      console.warn("⚠️ Missing required fields");
      return NextResponse.json({ error: "กรอกข้อมูลไม่ครบถ้วน" }, { status: 400 });
    }

    if (quantity < 5) {
      console.warn("⚠️ Quantity < 5");
      return NextResponse.json({ error: "ต้องสั่งขั้นต่ำ 5 ตัวขึ้นไป" }, { status: 400 });
    }

    // ✅ ตรวจสอบ user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    console.log("🔍 User found:", user);

    if (!user) {
      console.error("❌ User not found");
      return NextResponse.json({ error: "ไม่พบผู้ใช้งาน (userId ไม่ถูกต้อง)" }, { status: 404 });
    }

    // ✅ Create Order
    const order = await prisma.specialOrder.create({
      data: {
        firstName,
        lastName,
        phone,
        email,
        address,
        category,
        productName,
        color,
        quantity,
        sizeDetail,
        status: "รอดำเนินการ",
        createdAtThai: formatToThaiTime(new Date()),
        trackingId: generateTrackingId(Date.now().toString()), // ✅ เพิ่ม trackingId ตอนสร้าง
        userId,
      },
      include: { user: true },
    });
    console.log("✅ Order created:", order);

    const whenThai = formatToThaiTime(new Date());

    // 📧 ส่งอีเมลยืนยัน
    try {
      await sendEmail(
        email,
        `T-Double: ยืนยันคำสั่งซื้อ #${order.id}`,
        `
          <h2>✅ คำสั่งซื้อใหม่</h2>
          <p>เรียนคุณ <b>${firstName} ${lastName}</b></p>
          <p>ระบบได้รับคำสั่งซื้อของคุณแล้ว</p>
          <p><b>สินค้า:</b> ${productName} (${color ?? "-"})</p>
          <p><b>จำนวน:</b> ${quantity} ตัว</p>
          <p><b>Size:</b> ${sizeDetail}</p>
          <p><b>Tracking ID:</b> ${order.trackingId}</p>
          <p><b>เวลา:</b> ${whenThai}</p>
          <p>⏳ ระยะเวลาผลิตประมาณ 7–14 วัน</p>
        `
      );
    } catch (e) {
      console.error("❌ ส่งเมลยืนยันล้มเหลว:", e);
    }

    console.log("➡️ POST Response:", { message: "สร้างออเดอร์สำเร็จ", order });
    return NextResponse.json({ message: "สร้างออเดอร์สำเร็จ", order }, { status: 201 });
  } catch (err) {
    console.error("❌ Create Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถสร้างคำสั่งซื้อได้" }, { status: 500 });
  }
}

/** ---------------- GET: ดึง Special Order ---------------- */
export async function GET(req: NextRequest) {
  console.log("📌 GET /special-orders called");
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    console.log("🔎 GET searchParams id:", id);

    if (id) {
      const order = await prisma.specialOrder.findUnique({
        where: { id },
        include: { user: true },
      });
      console.log("✅ GET single order:", order);
      if (!order) {
        return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
      }
      return NextResponse.json({ order }, { status: 200 });
    }

    const orders = await prisma.specialOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    console.log("✅ GET all orders:", orders.length);
    return NextResponse.json({ orders }, { status: 200 });
  } catch (err) {
    console.error("❌ GET Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงคำสั่งซื้อได้" }, { status: 500 });
  }
}

/** ---------------- DELETE: ลบ Special Order ---------------- */
export async function DELETE(req: NextRequest) {
  console.log("📌 DELETE /special-orders called");
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    console.log("🗑️ DELETE id:", id);

    if (!id) {
      console.warn("⚠️ DELETE called without id");
      return NextResponse.json({ error: "ต้องระบุรหัสคำสั่งซื้อ (id)" }, { status: 400 });
    }

    const order = await prisma.specialOrder.findUnique({ where: { id } });
    console.log("🔍 Order to delete:", order);

    if (!order) {
      console.error("❌ Order not found for delete");
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    await prisma.specialOrder.delete({ where: { id } });
    console.log("✅ Order deleted:", id);

    return NextResponse.json({ message: "ลบคำสั่งซื้อเรียบร้อย", id }, { status: 200 });
  } catch (err) {
    console.error("❌ DELETE Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถลบคำสั่งซื้อได้" }, { status: 500 });
  }
}

/** ---------------- PUT: แอดมินตรวจสอบ & ใส่ราคา ---------------- */
export async function PUT(req: NextRequest) {
  console.log("📌 PUT /special-orders called");
  try {
    const body = await req.json();
    console.log("📥 PUT request body:", body);

    const { id, price } = body;

    if (!id || !price) {
      console.warn("⚠️ Missing id or price in PUT");
      return NextResponse.json({ error: "ต้องระบุ id และ price" }, { status: 400 });
    }

    const order = await prisma.specialOrder.findUnique({ where: { id } });
    console.log("🔍 Order before update:", order);

    if (!order) {
      console.error("❌ Order not found for update");
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // ✅ สร้าง Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "promptpay"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "thb",
            product_data: {
              name: order.productName,
              description: `${order.category} - ${order.color ?? "-"}`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: order.quantity,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?orderId=${order.id}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel?orderId=${order.id}`,
      metadata: { orderId: order.id, userId: order.userId },
    });
    console.log("💳 Stripe session created:", session.id);

    // ✅ อัปเดต order
    const updated = await prisma.specialOrder.update({
      where: { id },
      data: {
        price,
        isApproved: true,
        status: "รอชำระเงิน",
        paymentUrl: session.url!,
        trackingId: order.trackingId ?? generateTrackingId(order.id), // ✅ ใส่ trackingId ถ้ายังไม่มี
      },
    });
    console.log("✅ Order updated:", updated);

    const whenThai = formatToThaiTime(new Date());

    // 📧 ส่งอีเมลแจ้งลูกค้า
    try {
      if (updated.email) {
        await sendEmail(
          updated.email,
          `T-Double: ใบแจ้งชำระเงิน #${updated.id}`,
          `
            <h2>💰 แจ้งยอดชำระ</h2>
            <p>เรียนคุณ <b>${updated.firstName} ${updated.lastName}</b></p>
            <p>คำสั่งซื้อของคุณได้รับการตรวจสอบแล้ว</p>
            <p><b>สินค้า:</b> ${updated.productName} (${updated.color ?? "-"})</p>
            <p><b>จำนวน:</b> ${updated.quantity} ตัว</p>
            <p><b>Tracking ID:</b> ${updated.trackingId}</p>
            <p><b>เวลา:</b> ${whenThai}</p>
            <p>โปรดเลือกวิธีชำระเงินผ่านลิงก์ด้านล่าง (บัตรเครดิต / PromptPay):</p>
            <a href="${session.url}">👉 คลิกที่นี่เพื่อชำระเงิน</a>
          `
        );
      }
    } catch (e) {
      console.error("❌ ส่งเมลแจ้งชำระล้มเหลว:", e);
    }

    return NextResponse.json(
      { message: "อัปเดตคำสั่งซื้อสำเร็จ ส่งลิงก์ชำระเงินให้ลูกค้าแล้ว", order: updated },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Approve Special Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถอัปเดตคำสั่งซื้อได้" }, { status: 500 });
  }
}
