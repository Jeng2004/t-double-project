import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import crypto from "crypto";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** ✅ ฟังก์ชันแปลงเวลา UTC -> เวลาไทย (ICT, UTC+7) */
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ---------------------- GET Orders ----------------------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { orderItems: { include: { product: true } }, user: true },
      });

      if (!order) {
        return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });
      }

      return NextResponse.json(order, { status: 200 });
    } else {
      const orders = await prisma.order.findMany({
        include: { orderItems: { include: { product: true } }, user: true },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json(orders, { status: 200 });
    }
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลคำสั่งซื้อได้" }, { status: 500 });
  }
}

// ---------------------- ฟังก์ชันส่งอีเมล ----------------------
async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"ร้านค้าออนไลน์" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// ---------------------- API POST: สร้างคำสั่งซื้อ ----------------------
export async function POST(req: NextRequest) {
  try {
    console.log("📥 รับคำร้อง POST /api/orders");

    const { userId, items, address, phone, name, email } = await req.json();

    console.log("🔍 กำลังตรวจสอบผู้ใช้...");
    if (!userId) {
      return NextResponse.json({ error: "ต้องระบุ userId" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
    }
    console.log(`✅ พบผู้ใช้: ${user.email}`);

    // ตรวจสอบข้อมูลที่จำเป็น
    const missingFields: string[] = [];
    if (!user.name && !name) missingFields.push("name");
    if (!user.phone && !phone) missingFields.push("phone");
    if (!user.address && !address) missingFields.push("address");
    if (!user.email && !email) missingFields.push("email");

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `บัญชีไม่มีข้อมูล ${missingFields.join(", ")}` },
        { status: 400 }
      );
    }

    // อัปเดต user profile ถ้ายังไม่มี
    if (!user.name || !user.phone || !user.address || !user.email) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          name: user.name || name,
          phone: user.phone || phone,
          address: user.address || address,
          email: user.email || email,
        },
      });
    }

    let orderItems = items;
    let totalAmount = 0;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      const cart = await prisma.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });

      if (cart.length === 0) {
        return NextResponse.json({ error: "ไม่มีสินค้าในตะกร้า" }, { status: 400 });
      }

      orderItems = cart.map((item) => {
        const priceObj = item.product.price as Record<string, number>;
        const price = priceObj[item.size];
        const totalPrice = item.totalPrice;
        totalAmount += totalPrice;

        return {
          productId: item.productId,
          quantity: item.quantity,
          price: Math.floor(price),
          size: item.size,
          unitPrice: item.unitPrice,
          totalPrice,
          productName: item.product.name,
        };
      });
    } else {
      orderItems.forEach((item: any) => {
        totalAmount += item.totalPrice;
      });
    }

    console.log(`💰 ยอดรวมที่ต้องชำระ: ${totalAmount}`);

    // ✅ สร้าง Order (ยังไม่หัก stock)
    const createdOrder = await prisma.order.create({
      data: {
        trackingId: `TRK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        totalAmount,
        status: "รอชำระเงิน",
        createdAtThai: formatToThaiTime(new Date()),
        isPaid: false,
        orderItems: {
          create: orderItems.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
        user: { connect: { id: userId } },
      },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    console.log(`✅ คำสั่งซื้อสำเร็จ (รอชำระ): ${createdOrder.id}`);

    return NextResponse.json(
      { message: "✅ สร้างคำสั่งซื้อเรียบร้อยแล้ว กรุณาชำระเงินก่อน", order: createdOrder },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ Error creating order:", err);
    return NextResponse.json({ error: "ไม่สามารถสร้างคำสั่งซื้อได้" }, { status: 500 });
  }
}

// ---------------------- API PATCH: ชำระเงิน (manual) ----------------------
export async function PATCH(req: NextRequest) {
  try {
    const { orderId } = await req.json();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้" }, { status: 404 });
    }

    if (order.isPaid) {
      return NextResponse.json({ error: "คำสั่งซื้อนี้ชำระเงินแล้ว" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const item of order.orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const stock: Record<string, number> = product.stock as any;
        stock[item.size] -= item.quantity;

        await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { isPaid: true, status: "รอดำเนินการ" },
        include: { orderItems: { include: { product: true } }, user: true },
      });

      await tx.cartItem.deleteMany({ where: { userId: order.userId } });

      return updatedOrder;
    });

    return NextResponse.json(
      { message: "✅ ชำระเงินสำเร็จและหักสต๊อกแล้ว", order: result },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error in payment:", err);
    return NextResponse.json({ error: "ไม่สามารถดำเนินการชำระเงินได้" }, { status: 500 });
  }
}

// ---------------------- PUT: สร้าง Stripe Checkout Session ----------------------
export async function PUT(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });

    const lineItems = order.orderItems.map((item) => {
      const product = item.product;
      const imageUrls =
        product.imageUrls?.map((url) =>
          url.startsWith("http") ? url : `${process.env.APP_URL}${url}`
        ) || ["https://via.placeholder.com/150"];
      return {
        price_data: {
          currency: "thb",
          product_data: { name: product.name, images: imageUrls },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "promptpay"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/payment/cancel`,
      metadata: {
        userId: order.userId,
        orderId: order.id,
        trackingId: order.trackingId,
      },
      payment_intent_data: { capture_method: "automatic" },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Error creating session:", error.message);
    return NextResponse.json({ error: "ไม่สามารถสร้าง session ได้" }, { status: 500 });
  }
}
