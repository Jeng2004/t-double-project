// /api/orders/return/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/* ====================== Logging Helpers (non-breaking) ====================== */
type LogLevel = "error" | "warn" | "info" | "debug";
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as LogLevel;
const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] <= LEVEL_ORDER[LOG_LEVEL];
}
function ts() {
  return new Date().toISOString();
}
function genRequestId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}
function log(level: LogLevel, reqId: string, msg: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const base = `[${ts()}] [${reqId}] [${level.toUpperCase()}] ${msg}`;
  if (meta) {
    try {
      const safe = JSON.parse(
        JSON.stringify(meta, (k, v) => {
          if (typeof v === "string" && v.length > 500) return v.slice(0, 500) + "…";
          return v;
        })
      );
      // eslint-disable-next-line no-console
      console.log(base, safe);
    } catch {
      // eslint-disable-next-line no-console
      console.log(base);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
}
function startTimer() {
  const start = process.hrtime.bigint();
  return () => Number((process.hrtime.bigint() - start) / BigInt(1_000_000)); // ms
}
function withReqId(res: NextResponse, reqId: string) {
  try {
    res.headers.set("x-request-id", reqId);
  } catch {}
  return res;
}
function getCallerContext(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return { ip, ua };
}
/* ========================================================================== */

// แปลงเวลาไทย
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

// ส่งอีเมล
async function sendEmail(to: string, subject: string, html: string, reqId?: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    if (reqId) log("warn", reqId, "⚠️ ไม่มีการตั้งค่า EMAIL_USER/EMAIL_PASS ข้ามการส่งอีเมล");
    else console.warn("⚠️ ไม่มีการตั้งค่า EMAIL_USER/EMAIL_PASS ข้ามการส่งอีเมล");
    return;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.verify();
    if (reqId) log("info", reqId, "SMTP transporter verified");
  } catch (e: any) {
    if (reqId) log("warn", reqId, "SMTP verify failed", { error: e?.message });
  }

  const info = await transporter.sendMail({
    from: `"ร้านค้าออนไลน์" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
  if (reqId) {
    log("info", reqId, "📧 ส่งอีเมลสำเร็จ", {
      to,
      messageId: info?.messageId,
      accepted: info?.accepted,
      rejected: info?.rejected,
    });
  } else {
    console.log(`📧 ส่งอีเมลไปยัง ${to} สำเร็จ`);
  }
}

/* GET ReturnRequest */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  const caller = getCallerContext(_req);
  log("info", reqId, "GET /api/orders/return/[id] start", caller);

  try {
    const { id } = await context.params;
    log("debug", reqId, "Fetching ReturnRequest", { id });

    const stop = startTimer();
    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: { 
        items: { include: { orderItem: { include: { product: true } } } },
        order: { include: { user: true } },
      },
    });
    log("info", reqId, "DB findUnique(returnRequest) done", { ms: stop(), found: !!request });

    if (!request) {
      log("warn", reqId, "ReturnRequest not found", { id });
      return withReqId(NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 }), reqId);
    }
    log("info", reqId, "GET success", { id, orderId: request.orderId });
    return withReqId(NextResponse.json(request, { status: 200 }), reqId);
  } catch (err: any) {
    log("error", reqId, "❌ GET ReturnRequest error", { error: err?.message });
    return withReqId(NextResponse.json({ error: "ไม่สามารถดึงข้อมูลได้" }, { status: 500 }), reqId);
  }
}

/* PATCH อนุมัติ/ปฏิเสธ */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  const totalTimer = startTimer();
  const caller = getCallerContext(req);
  log("info", reqId, "PATCH /api/orders/return/[id] start", caller);

  try {
    const { id } = await context.params;
    const bodyTimer = startTimer();
    const { status, adminNote, refundAmount } = await req.json();
    log("info", reqId, "Parsed request body", {
      ms: bodyTimer(),
      status,
      hasAdminNote: !!adminNote,
      refundAmount,
    });

    if (!["approved", "rejected"].includes(status)) {
      log("warn", reqId, "Invalid status", { status });
      return withReqId(NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 }), reqId);
    }

    // ดึง ReturnRequest + Order + User
    let request: any;
    try {
      const stop = startTimer();
      request = await prisma.returnRequest.findUnique({
        where: { id },
        include: {
          items: { include: { orderItem: { include: { product: true } } } },
          order: { include: { user: true } },
        },
      });
      log("info", reqId, "DB findUnique(returnRequest) done", { ms: stop(), found: !!request });
    } catch (e: any) {
      log("error", reqId, "DB findUnique(returnRequest) error", { error: e?.message });
      throw e;
    }

    if (!request) {
      log("warn", reqId, "ReturnRequest not found", { id });
      return withReqId(NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 }), reqId);
    }

    log("info", reqId, "📦 ReturnRequest พบ", {
      id,
      orderId: request.orderId,
      status: request.status,
      user: request.order?.user?.email,
      itemsCount: request.items?.length ?? 0,
    });

    // กันกดซ้ำ
    if (request.status !== "รอดำเนินการ") {
      log("warn", reqId, "ReturnRequest already processed", { currentStatus: request.status });
      return withReqId(
        NextResponse.json(
          { error: `ไม่สามารถอัปเดตได้ เนื่องจากสถานะปัจจุบันคือ '${request.status}'` },
          { status: 400 }
        ),
        reqId
      );
    }

    // อัปเดต ReturnRequest
    let updated: any;
    try {
      const stop = startTimer();
      updated = await prisma.returnRequest.update({
        where: { id },
        data: { status, adminNote: adminNote ?? null, updatedAt: new Date() },
        include: {
          order: { include: { user: true } },
          items: { include: { orderItem: { include: { product: true } } } },
        },
      });
      log("info", reqId, "DB update(returnRequest) done", { ms: stop(), newStatus: status });
    } catch (e: any) {
      log("error", reqId, "DB update(returnRequest) error", { error: e?.message });
      throw e;
    }

    // ถ้า approved → อัปเดต Order, คืน Stock, คืนเงิน
    if (status === "approved") {
      // อัปเดต Order
      try {
        const stop = startTimer();
        await prisma.order.update({
          where: { id: updated.orderId },
          data: { status: "ลูกค้าคืนสินค้า", updatedAt: new Date() },
        });
        log("info", reqId, "DB update(order) done", { ms: stop(), orderId: updated.orderId });
      } catch (e: any) {
        log("error", reqId, "DB update(order) error", { error: e?.message });
        throw e;
      }

      // คืน Stock
      for (const item of updated.items) {
        const product = item.orderItem?.product;
        if (product) {
          try {
            const stop = startTimer();
            const stock: Record<string, number> = product.stock as any;
            const sizeKey = item.orderItem.size as string;
            const before = stock[sizeKey];
            stock[sizeKey] += item.quantity;
            await prisma.product.update({ where: { id: product.id }, data: { stock } });
            log("info", reqId, "📦 คืน Stock", {
              product: product.name,
              size: sizeKey,
              before,
              added: item.quantity,
              after: stock[sizeKey],
              ms: stop(),
            });
          } catch (e: any) {
            log("error", reqId, "DB update(product stock) error", {
              error: e?.message,
              productId: product.id,
            });
            throw e;
          }
        }
      }

      // คืนเงิน Stripe
      try {
        if (updated.order.isPaid && updated.order.paymentIntentId) {
          const refundData: Stripe.RefundCreateParams = { payment_intent: updated.order.paymentIntentId };
          if (refundAmount && refundAmount > 0) refundData.amount = Math.round(refundAmount * 100);

          log("info", reqId, "Creating Stripe refund", {
            paymentIntentId: updated.order.paymentIntentId,
            amountSatang: refundData.amount ?? "FULL",
          });

          const stop = startTimer();
          const refund = await stripe.refunds.create(refundData);
          log("info", reqId, "💸 Stripe Refund created", {
            ms: stop(),
            refundId: refund.id,
            amountTHB: refund.amount / 100,
            status: refund.status,
          });

          // ตรวจสอบสถานะ
          const checkTimer = startTimer();
          const refundStatus = await stripe.refunds.retrieve(refund.id);
          log("info", reqId, "💰 Refund status checked", {
            ms: checkTimer(),
            refundId: refund.id,
            status: refundStatus.status,
          });
        } else {
          log("warn", reqId, "Skip refund: order unpaid or missing paymentIntentId", {
            isPaid: updated.order.isPaid,
            paymentIntentIdPresent: !!updated.order.paymentIntentId,
          });
        }
      } catch (err: any) {
        log("error", reqId, "❌ Stripe Refund error", { error: err?.message });
        // ดำเนินการต่อเพื่อแจ้งลูกค้า/บันทึกสถานะ (ไม่ throw เพื่อไม่ให้ 500)
      }
    }

    // ส่งอีเมลแจ้งลูกค้า
    try {
      const mailTimer = startTimer();
      await sendEmail(
        updated.order.user.email,
        `T-Double คำขอคืนสินค้า #${updated.order.trackingId}`,
        `
        <h2>📢 ผลการตรวจสอบคำขอคืนสินค้า</h2>
        <p>สถานะ: <b>${status === "approved" ? "อนุมัติ" : "ปฏิเสธ"}</b></p>
        <p>คำสั่งซื้อ: ${updated.order.id}</p>
        <p>Tracking: ${updated.order.trackingId}</p>
        ${adminNote ? `<p>หมายเหตุจากแอดมิน: ${adminNote}</p>` : ""}
        ${status === "approved" ? `<p>💰 เงินที่ชำระจะคืนเข้าบัญชีของคุณภายใน 2–3 วันทำการ</p>` : ""}
        <p>เวลาดำเนินการ: ${formatToThaiTime(new Date())}</p>
        `,
        reqId
      );
      log("info", reqId, "Customer notification email sent", {
        ms: mailTimer(),
        to: updated.order.user.email,
      });
    } catch (err: any) {
      log("error", reqId, "❌ ส่งอีเมลล้มเหลว", { error: err?.message });
    }

    const totalMs = totalTimer();
    log("info", reqId, "PATCH success", { id, newStatus: status, totalMs });
    return withReqId(
      NextResponse.json({ message: `อัปเดตสถานะคำขอเป็น ${status} เรียบร้อย`, request: updated }, { status: 200 }),
      reqId
    );
  } catch (err: any) {
    const totalMs = totalTimer();
    log("error", reqId, "❌ PATCH error", { error: err?.message, totalMs });
    return withReqId(NextResponse.json({ error: "ไม่สามารถดำเนินการได้" }, { status: 500 }), reqId);
  }
}

/* DELETE: soft delete */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = genRequestId();
  const caller = getCallerContext(_req);
  log("info", reqId, "DELETE /api/orders/return/[id] start", caller);

  try {
    const { id } = await context.params;
    log("debug", reqId, "Soft delete ReturnRequest", { id });

    const stopFind = startTimer();
    const request = await prisma.returnRequest.findUnique({ where: { id } });
    log("info", reqId, "DB findUnique(returnRequest) done", { ms: stopFind(), found: !!request });

    if (!request) {
      log("warn", reqId, "ReturnRequest not found", { id });
      return withReqId(NextResponse.json({ error: "ไม่พบคำขอคืนสินค้า" }, { status: 404 }), reqId);
    }

    const stopUpdate = startTimer();
    const updated = await prisma.returnRequest.update({
      where: { id },
      data: { status: "cancelled", updatedAt: new Date() },
    });
    log("info", reqId, "DB update(returnRequest) -> cancelled", { ms: stopUpdate(), id });

    log("info", reqId, "DELETE success", { id });
    return withReqId(
      NextResponse.json({ message: "ยกเลิกคำขอคืนสินค้าเรียบร้อย", request: updated }, { status: 200 }),
      reqId
    );
  } catch (err: any) {
    log("error", reqId, "❌ DELETE error", { error: err?.message });
    return withReqId(
      NextResponse.json({ error: "ไม่สามารถยกเลิกคำขอคืนสินค้าได้" }, { status: 500 }),
      reqId
    );
  }
}
