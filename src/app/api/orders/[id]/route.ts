import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

// 📝 LOG HELPERS (เพิ่ม)
const LOG_PREFIX = "📦 OrderStatusAPI";
const log = (...args: any[]) => console.log(LOG_PREFIX, ...args);
const info = (...args: any[]) => console.info(LOG_PREFIX, ...args);
const warn = (...args: any[]) => console.warn(LOG_PREFIX, ...args);

const allowedStatus = [
  "ยกเลิก",
  "รอดำเนินการ",
  "กำลังดำเนินการจัดเตรียมสินค้า",
  "กำลังดำเนินการจัดส่งสินค้า",
  "จัดส่งสินค้าสำเร็จเเล้ว",
] as const;
type OrderStatus = (typeof allowedStatus)[number];

// ลำดับ flow ที่ “ต้องเรียงทีละขั้น” (ไม่รวม "ยกเลิก")
const flow: Exclude<OrderStatus, "ยกเลิก">[] = [
  "รอดำเนินการ",
  "กำลังดำเนินการจัดเตรียมสินค้า",
  "กำลังดำเนินการจัดส่งสินค้า",
  "จัดส่งสินค้าสำเร็จเเล้ว",
];

// helper ตรวจสอบการเปลี่ยนสถานะ
function canTransition(current: OrderStatus, next: OrderStatus) {
  // ปลายทางเหมือนเดิม => อนุญาต (idempotent)
  if (current === next) return { ok: true as const };

  // จบกระบวนการแล้ว/ถูกยกเลิกแล้ว ห้ามเปลี่ยนอีก
  if (current === "จัดส่งสินค้าสำเร็จเเล้ว" || current === "ยกเลิก") {
    return {
      ok: false as const,
      reason:
        `ไม่สามารถเปลี่ยนสถานะจาก "${current}" ได้`,
    };
  }

  // อนุญาต "ยกเลิก" จากสถานะใดๆ ที่ยังไม่จบ
  // (เดิมอนุญาต — คงโค้ดเดิมไว้ตามคำขอ "อย่าลบโค้ดฉัน")
  if (next === "ยกเลิก") return { ok: true as const };

  // ต้องขยับ “ทีละขั้น” เท่านั้น
  const curIdx = flow.indexOf(current as (typeof flow)[number]);
  const nextIdx = flow.indexOf(next as (typeof flow)[number]);

  // ถ้าปัจจุบันไม่อยู่ใน flow (เช่นถูกยกเลิก) จะออกตั้งแต่ด้านบนแล้ว
  if (curIdx === -1 || nextIdx === -1) {
    return {
      ok: false as const,
      reason: "รูปแบบสถานะไม่ถูกต้อง",
    };
  }

  if (nextIdx === curIdx + 1) {
    // เดินหน้าหนึ่งขั้น ถูกต้อง
    return { ok: true as const };
  }

  // อื่นๆ คือการข้ามขั้น/ถอยหลัง => ไม่อนุญาต
  return {
    ok: false as const,
    reason:
      `ต้องเปลี่ยนสถานะตามลำดับเท่านั้น: "${flow.join('" → "')}" (ห้ามข้ามลำดับ)`,
  };
}

// สร้าง transporter สำหรับส่งอีเมล
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // ใช้ App Password
  },
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 🔹 LOG: เข้า handler
  info("PATCH called");

  try {
    const { id } = await context.params;
    const orderId = id;

    const { status } = (await req.json()) as { status?: OrderStatus };

    // 🔹 LOG: พารามิเตอร์ที่รับเข้า
    log("Incoming params", { orderId, status });

    if (!status || !allowedStatus.includes(status)) {
      warn("Invalid status payload", { status, allowedStatus });
      return NextResponse.json(
        {
          error:
            `status ต้องเป็นหนึ่งใน: ${allowedStatus.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ดึงออเดอร์พร้อม user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    // 🔹 LOG: ผลการค้นหา order
    log("Fetched order", { found: !!order, orderId });

    if (!order) {
      warn("Order not found", { orderId });
      return NextResponse.json(
        { error: "ไม่พบคำสั่งซื้อ" },
        { status: 404 }
      );
    }

    const currentStatus = order.status as OrderStatus;
    log("Current status", { orderId, currentStatus, next: status });

    // 🔹 ADD: disallow cancel — บล็อคการเปลี่ยนเป็น "ยกเลิก" เสมอ
    if (status === "ยกเลิก") {
      warn("Cancel action blocked", { orderId, from: currentStatus, to: status });
      return NextResponse.json(
        { error: "ไม่สามารถยกเลิกคำสั่งซื้อนี้ได้" },
        { status: 400 }
      );
    }

    // 🔹 ADD: กันการกดสถานะเดิมซ้ำ (ตัดสินใจตั้งแต่ต้นทาง)
    if (currentStatus === status) {
      warn("Duplicate status attempt", { orderId, status });
      return NextResponse.json(
        {
          error: `ไม่สามารถเลือกสถานะเดิมซ้ำได้ ("${status}")`,
          order,
        },
        { status: 400 }
      );
    }

    // ตรวจสอบกฎการเปลี่ยนสถานะ (ยังใช้ฟังก์ชันเดิมได้ เพราะเราบล็อค "ยกเลิก" ไปแล้วด้านบน)
    const check = canTransition(currentStatus, status);
    log("Transition check", { from: currentStatus, to: status, ok: check.ok });

    if (!check.ok) {
      warn("Transition blocked", { reason: check.reason });
      return NextResponse.json(
        {
          error:
            check.reason ??
            "ไม่สามารถเปลี่ยนสถานะได้",
        },
        { status: 400 }
      );
    }

    // ถ้าสถานะเหมือนเดิม ไม่ต้อง update/ส่งเมลซ้ำ
    // (บล็อกนี้คงไว้ตามคำขอ "อย่าลบโค้ดฉัน" แต่จะไม่ถูกเข้าถึง
    // เพราะเราตัดสินใจที่บล็อกกันสถานะเดิมซ้ำด้านบนแล้ว)
    if (currentStatus === status) {
      info("No-op update (same status) — legacy branch kept");
      return NextResponse.json(
        {
          message: "ไม่มีการเปลี่ยนแปลงสถานะ (เหมือนเดิม)",
          order,
        },
        { status: 200 }
      );
    }

    // อัปเดตสถานะ
    info("Updating order status", { orderId, to: status });
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { user: true },
    });
    log("Updated order", { orderId: updatedOrder.id, newStatus: updatedOrder.status });

    // ส่งอีเมลแจ้งเตือน
    if (updatedOrder.user?.email) {
      info("Sending email notification", {
        to: updatedOrder.user.email,
        orderId: updatedOrder.id,
        status,
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: updatedOrder.user.email,
        subject: `อัปเดตสถานะคำสั่งซื้อ #${updatedOrder.id}`,
        text: `คำสั่งซื้อของคุณถูกอัปเดตเป็นสถานะ: ${status}`,
        html: `<p>คำสั่งซื้อของคุณถูกอัปเดตเป็นสถานะ: <b>${status}</b></p>`,
      });
      log("Email sent successfully");
    } else {
      warn("No user email to notify", { orderId: updatedOrder.id });
    }

    info("PATCH success", { orderId, status });

    return NextResponse.json(
      {
        message:
          "✅ อัปเดตสถานะสำเร็จ และส่งการเเจ้งเตือนไปที่อีเมลแล้ว",
        order: updatedOrder,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error updating order:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
