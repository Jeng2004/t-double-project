import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

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

// ✅ PATCH: ยกเลิกออเดอร์ + คืนสต็อก
export async function PATCH(req: NextRequest) {
  try {
    const { id, cancelReason } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ต้องระบุรหัสคำสั่งซื้อ (id)" }, { status: 400 });
    }

    // ดึงข้อมูลออเดอร์พร้อมสินค้า
    const order = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: { include: { product: true } }, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }
    if (order.status === "ยกเลิก") {
      return NextResponse.json({ message: "ออเดอร์นี้ถูกยกเลิกไปแล้ว", order }, { status: 409 });
    }

    // ✅ Transaction: ยกเลิก + คืนสต็อก
    const result = await prisma.$transaction(async (tx) => {
      // อัพเดทสถานะ
      const canceledOrder = await tx.order.update({
        where: { id },
        data: { status: "ยกเลิก", cancelReason: cancelReason || null },
        include: { orderItems: { include: { product: true } }, user: true },
      });

      // คืนสต็อก
      for (const item of canceledOrder.orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const stock: Record<string, number> = product.stock as any;
        stock[item.size] += item.quantity; // ✅ คืนจำนวน

        await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });
      }

      return canceledOrder;
    });

    // ส่งอีเมลแจ้งลูกค้า
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
            <hr />
            <p>ขอบคุณที่ใช้บริการ 🙏</p>
          `
        );
      }
    } catch (mailErr) {
      console.error("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    return NextResponse.json({ message: "ออเดอร์ถูกยกเลิก + คืนสต็อกเรียบร้อย", order: result }, { status: 200 });
  } catch (err) {
    console.error("❌ Cancel Order error:", err);
    return NextResponse.json({ error: "ไม่สามารถยกเลิกคำสั่งซื้อได้" }, { status: 500 });
  }
}