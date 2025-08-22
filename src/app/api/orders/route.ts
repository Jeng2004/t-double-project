import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import crypto from "crypto";

const prisma = new PrismaClient();

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

      // ส่งคืนตามเดิม (ถ้ามี createdAtThai ใน DB จะติดมาด้วย)
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

    // ✅ Transaction
    const result = await prisma.$transaction(async (tx) => {
      // ➕ คำนวณเวลาไทยและบันทึกลงฐานข้อมูล (ต้องมีฟิลด์ createdAtThai ใน Order model)
      const createdAtThai = formatToThaiTime(new Date());

      const createdOrder = await tx.order.create({
        data: {
          trackingId: `TRK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
          totalAmount,
          status: "รอดำเนินการ",
          createdAtThai, // ✅ เก็บเวลาไทยลง DB
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

      // หัก stock
      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const stock: Record<string, number> = product.stock as any;
        stock[item.size] -= item.quantity;

        await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });

        console.log(
          `✅ หักสต๊อก ${product.name} (${item.size}) คงเหลือ: ${stock[item.size]}`
        );
      }

      // ล้างตะกร้า
      await tx.cartItem.deleteMany({ where: { userId } });
      console.log("🧹 ล้างตะกร้าสำเร็จ");

      return createdOrder;
    });

    console.log(`✅ คำสั่งซื้อสำเร็จ! หมายเลขคำสั่งซื้อ: ${result.id}`);

    // ส่งอีเมลยืนยัน (แสดงเวลาไทยจาก DB)
    try {
      await sendEmail(
        result.user.email,
        `T-Double คำสั่งซื้อ #${result.trackingId}`,
        `
          <h2>✅ สั่งซื้อสำเร็จ!</h2>
          <p>สวัสดีคุณ <b>${result.user.name ?? ""}</b></p>
          <p>คำสั่งซื้อของคุณถูกสร้างเรียบร้อยแล้ว</p>
          <p><b>หมายเลขคำสั่งซื้อ:</b> ${result.id}</p>
          <p><b>Tracking ID:</b> ${result.trackingId}</p>
          <p><b>ยอดรวม:</b> ${result.totalAmount.toLocaleString()} บาท</p>
          <p><b>สถานะ:</b> ${result.status}</p>
          <p><b>เวลาที่สั่งซื้อ :</b> ${result.createdAtThai ?? formatToThaiTime(result.createdAt)}</p>
          <br />
          <p>ขอบคุณที่ใช้บริการ 🙏</p>
        `
      );
    } catch (err) {
      console.error("❌ ส่งอีเมลล้มเหลว:", err);
    }

    return NextResponse.json(
      { message: "✅ สร้างคำสั่งซื้อเรียบร้อยแล้ว", order: result },
      { status: 201 }
    );
  } catch (err) {
    console.error("❌ Error creating order:", err);
    return NextResponse.json({ error: "ไม่สามารถสร้างคำสั่งซื้อได้" }, { status: 500 });
  }
}

