// src/app/api/special-orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
// 🔹 ADD: Stripe ตรวจสอบการชำระเงิน
import Stripe from "stripe";

const prisma = new PrismaClient();

// 🔹 ADD: Stripe client (ถ้าไม่ได้เซ็ตคีย์ จะไม่เรียก Stripe API)
const stripe =
  process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// 📝 LOG: helpers (เพิ่ม)
const LOG_PREFIX = "📦 SpecialOrdersAPI";
const log  = (...a: any[]) => console.log(LOG_PREFIX, ...a);
const info = (...a: any[]) => console.info(LOG_PREFIX, ...a);
const warn = (...a: any[]) => console.warn(LOG_PREFIX, ...a);
const err  = (...a: any[]) => console.error(LOG_PREFIX, ...a);

const allowedStatus = [
  "ยกเลิก",
  // 🔹 ADD: รอชำระเงิน
  "รอชำระเงิน",
  "รอดำเนินการ",
  "กำลังดำเนินการจัดเตรียมสินค้า",
  "กำลังดำเนินการจัดส่งสินค้า",
  "จัดส่งสินค้าสำเร็จเเล้ว",
] as const;
type OrderStatus = (typeof allowedStatus)[number];

// 🔹 ADD: flow ลำดับสถานะ (ไม่รวม "ยกเลิก")
const flow: Exclude<OrderStatus, "ยกเลิก">[] = [
  // 🔹 ADD: รอชำระเงิน (ต้องมาก่อนรอดำเนินการ)
  "รอชำระเงิน",
  "รอดำเนินการ",
  "กำลังดำเนินการจัดเตรียมสินค้า",
  "กำลังดำเนินการจัดส่งสินค้า",
  "จัดส่งสินค้าสำเร็จเเล้ว",
];

// 🔹 ADD: ตรวจสอบการเปลี่ยนสถานะตามลำดับ + ทีละขั้น
function canTransition(current: OrderStatus, next: OrderStatus) {
  // 📝 LOG:
  log("canTransition called", { current, next });

  if (current === next) {
    const reason = `ไม่สามารถเลือกสถานะเดิมซ้ำได้ ("${current}")`;
    warn("canTransition blocked: same status", { reason });
    return { ok: false as const, reason };
  }
  if (current === "จัดส่งสินค้าสำเร็จเเล้ว" || current === "ยกเลิก") {
    const reason = `ไม่สามารถเปลี่ยนสถานะจาก "${current}" ได้`;
    warn("canTransition blocked: terminal state", { reason });
    return { ok: false as const, reason };
  }

  // 🔹 เดิม: อนุญาต cancel (แต่เราจะบล็อกอีกชั้นใน PATCH ตามนโยบายคุณ)
  if (next === "ยกเลิก") {
    info("canTransition allowed: cancel");
    return { ok: true as const };
  }

  // 🔹 ADD: ห้ามเปลี่ยนไป "รอชำระเงิน" (ล็อคจากการกดเลือก)
  if (next === "รอชำระเงิน") {
    const reason = `ไม่สามารถเปลี่ยนเป็นสถานะ "รอชำระเงิน" ได้`;
    warn("canTransition blocked: disallow pending-payment", { reason });
    return { ok: false as const, reason };
  }

  const curIdx = flow.indexOf(current as (typeof flow)[number]);
  const nextIdx = flow.indexOf(next as (typeof flow)[number]);
  log("canTransition indices", { curIdx, nextIdx });

  if (curIdx === -1 || nextIdx === -1) {
    const reason = "รูปแบบสถานะไม่ถูกต้อง";
    warn("canTransition blocked: invalid status in flow", { reason });
    return { ok: false as const, reason };
  }
  if (nextIdx === curIdx + 1) {
    info("canTransition allowed: next step");
    return { ok: true as const };
  }

  const reason = `ต้องเปลี่ยนสถานะตามลำดับเท่านั้น: "${flow.join('" → "')}" (ห้ามข้ามลำดับ)`;
  warn("canTransition blocked: skipping/backward", { reason });
  return { ok: false as const, reason };
}

/** ฟังก์ชันแปลงเวลาไทย */
function formatToThaiTime(date: Date | string) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** ฟังก์ชันส่งเมล */
async function sendEmail(to: string, subject: string, html: string) {
  // 📝 LOG:
  info("sendEmail init", { to, subject });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  const mailPayload = {
    from: `"T-Double" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  // 📝 LOG:
  log("sendEmail payload prepared");

  await transporter.sendMail(mailPayload);

  // 📝 LOG:
  info("sendEmail sent");
}

// 🔹 ADD: ตรวจสอบว่าออเดอร์ “ชำระแล้ว” หรือยัง
async function isOrderPaid(order: any): Promise<boolean> {
  try {
    // เคส 1: มีฟิลด์สถานะการจ่ายใน DB (ถ้ามี)
    const paidFlags = ["paid", "succeeded", "ชำระแล้ว"];
    if (order.paymentStatus && paidFlags.includes(String(order.paymentStatus).toLowerCase())) {
      info("isOrderPaid: from DB flag", { paymentStatus: order.paymentStatus });
      return true;
    }

    // เคส 2: มี paymentIntentId และมีคีย์ Stripe → ตรวจจาก Stripe
    if (order.paymentIntentId && stripe) {
      info("isOrderPaid: checking Stripe", { paymentIntentId: order.paymentIntentId });
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      const ok = pi.status === "succeeded";
      info("isOrderPaid: stripe result", { status: pi.status, ok });
      return ok;
    }

    // เคส 3: ไม่มีข้อมูลยืนยันการชำระ
    warn("isOrderPaid: no payment proof found", {
      hasPaymentStatus: !!order.paymentStatus,
      hasPI: !!order.paymentIntentId,
      stripeEnabled: !!stripe,
    });
    return false;
  } catch (e) {
    err("isOrderPaid error", e);
    return false;
  }
}

/** ------------------ PATCH: อัพเดทสถานะ + แจ้งเตือนเมล์ ------------------ */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log("📌 PATCH /special-orders id:", id);
    info("PATCH start", { id });

    const body = await req.json();
    const { status } = body as { status: string };

    // 📝 LOG:
    log("PATCH payload", { status });

    if (!status || !allowedStatus.includes(status as OrderStatus)) {
      warn("PATCH invalid status", { status, allowedStatus });
      return NextResponse.json(
        { error: `status ต้องเป็นหนึ่งใน: ${allowedStatus.join(", ")}` },
        { status: 400 }
      );
    }

    // 🔎 ตรวจสอบก่อนว่ามี order จริงไหม
    const existing = await prisma.specialOrder.findUnique({ where: { id } });
    console.log("💡 Existing order:", existing);
    log("PATCH existing fetched", { found: !!existing });

    if (!existing) {
      warn("PATCH not found", { id });
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    // 🔹 ADD: บล็อก "ยกเลิก" และ "รอชำระเงิน" จากการกดเลือกใน PATCH
    if (status === "ยกเลิก" || status === "รอชำระเงิน") {
      warn("PATCH blocked status", { id, from: existing.status, to: status });
      return NextResponse.json(
        { error: `ไม่สามารถเปลี่ยนเป็นสถานะ "${status}" ได้` },
        { status: 400 }
      );
    }

    // 🔹 ADD: ต้องชำระเงินแล้วเท่านั้นถึงจะเปลี่ยนสถานะได้
    const paid = await isOrderPaid(existing);
    if (!paid) {
      warn("PATCH blocked: unpaid order", { id, tryingTo: status });
      return NextResponse.json(
        { error: "คำสั่งซื้อนี้ยังไม่ได้ชำระเงิน ไม่สามารถเปลี่ยนสถานะได้" },
        { status: 403 }
      );
    }

    // 🔹 เดิม: ตรวจลำดับสถานะ + ห้ามซ้ำ
    const currentStatus = existing.status as OrderStatus;
    const check = canTransition(currentStatus, status as OrderStatus);
    log("PATCH transition check", { from: currentStatus, to: status, ok: check.ok });

    if (!check.ok) {
      warn("PATCH transition blocked", { reason: check.reason });
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    // ✅ อัพเดทสถานะ
    info("PATCH updating order", { id, to: status });
    const order = await prisma.specialOrder.update({
      where: { id },
      data: { status },
      include: { user: true },
    });
    log("PATCH updated", { id: order.id, newStatus: order.status });

    // ✅ ส่งอีเมลแจ้งลูกค้า
    try {
      if (order.email) {
        info("PATCH send email try", { to: order.email, id: order.id });
        await sendEmail(
          order.email,
          `T-Double: อัพเดทสถานะคำสั่งซื้อ #${order.id}`,
          `
            <h2>📢 แจ้งอัพเดทสถานะ</h2>
            <p>เรียนคุณ <b>${order.firstName} ${order.lastName}</b></p>
            <p>สถานะคำสั่งซื้อของคุณถูกอัพเดทเป็น: <b>${status}</b></p>
            <p><b>เวลาที่อัพเดท:</b> ${formatToThaiTime(new Date())}</p>
            <hr/>
            <p>ขอบคุณที่สั่งซื้อกับเรา 🙏</p>
          `
        );
        info("PATCH email sent", { id: order.id });
      } else {
        warn("PATCH email skipped (no email on order)", { id: order.id });
      }
    } catch (mailErr) {
      err("❌ ส่งอีเมลล้มเหลว:", mailErr);
    }

    info("PATCH success", { id, status });

    return NextResponse.json(
      { message: "อัพเดทสถานะเรียบร้อย + แจ้งเตือนเมล์", order },
      { status: 200 }
    );
  } catch (e: any) {
    err("❌ PATCH error:", e);
    return NextResponse.json(
      { error: "ไม่สามารถอัพเดทสถานะได้" },
      { status: 500 }
    );
  }
}

/** ------------------ GET: ดูรายละเอียดออเดอร์เดียว ------------------ */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    console.log("📌 GET /special-orders id:", id);
    info("GET start", { id });

    const order = await prisma.specialOrder.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!order) {
      warn("GET not found", { id });
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    info("GET success", { id: order.id });
    return NextResponse.json(order, { status: 200 });
  } catch (e: any) {
    err("❌ GET error:", e);
    return NextResponse.json({ error: "ไม่สามารถดึงข้อมูลได้" }, { status: 500 });
  }
}
