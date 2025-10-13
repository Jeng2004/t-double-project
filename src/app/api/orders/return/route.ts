import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

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
function extnameSafe(name?: string | null) {
  if (!name) return "";
  const ext = path.extname(name).toLowerCase();
  return ext || "";
}
/* ========================================================================== */

/** ฟังก์ชันส่งอีเมล */
async function sendEmail(to: string, subject: string, html: string, reqId?: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // log presence ของ ENV (ไม่โชว์ค่า)
  if (reqId) {
    log("debug", reqId, "Email ENV presence", {
      EMAIL_USER_present: !!process.env.EMAIL_USER,
      EMAIL_PASS_present: !!process.env.EMAIL_PASS,
    });
  }

  try {
    await transporter.verify();
    if (reqId) log("info", reqId, "SMTP transporter verified");
  } catch (e: any) {
    if (reqId) log("warn", reqId, "SMTP verify failed", { error: e?.message });
    // ไม่ throw เพื่อคงพฤติกรรมเดิม (ค่อยไปล้มที่ sendMail)
  }

  const info = await transporter.sendMail({
    from: `"ร้านค้าออนไลน์" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  if (reqId) {
    log("info", reqId, "Email sent result", {
      messageId: info?.messageId,
      accepted: info?.accepted,
      rejected: info?.rejected,
      envelope: info?.envelope,
      response: typeof info?.response === "string" ? info.response.slice(0, 200) + "…" : undefined,
    });
  }

  return info;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const totalTimer = startTimer();
  const caller = getCallerContext(req);
  log("info", reqId, "POST /api/returns start", caller);

  try {
    let stop = startTimer();
    const formData = await req.formData();
    const formKeys = Array.from(formData.keys());
    log("info", reqId, "Parsed formData", { ms: stop(), keys: formKeys });

    const orderId = formData.get("orderId") as string | null;
    const reason = formData.get("reason") as string | null;
    const files = formData.getAll("images") as File[];

    // ✅ ตรวจสอบ itemsRaw ก่อน parse
    const itemsRaw = formData.get("items") as string | null;
    if (!itemsRaw) {
      log("warn", reqId, "items missing");
      return withReqId(
        NextResponse.json({ error: "ต้องส่ง items เป็น JSON string" }, { status: 400 }),
        reqId
      );
    }

    let items: { orderItemId: string; quantity: number }[];
    try {
      stop = startTimer();
      items = JSON.parse(itemsRaw);
      const totalQty = Array.isArray(items) ? items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : 0;
      log("debug", reqId, "Parsed items JSON", { ms: stop(), count: Array.isArray(items) ? items.length : 0, totalQty });
    } catch (e) {
      log("warn", reqId, "items JSON parse failed", { sample: itemsRaw.slice(0, 200) });
      return withReqId(
        NextResponse.json({ error: "items ไม่ใช่ JSON ที่ถูกต้อง", raw: itemsRaw }, { status: 400 }),
        reqId
      );
    }

    if (!orderId || !Array.isArray(items)) {
      log("warn", reqId, "orderId or items invalid", { orderIdPresent: !!orderId, isArray: Array.isArray(items) });
      return withReqId(
        NextResponse.json({ error: "ต้องระบุ orderId และ items" }, { status: 400 }),
        reqId
      );
    }

    if (!files || files.length < 1 || files.length > 5) {
      log("warn", reqId, "invalid files count", { count: files ? files.length : 0 });
      return withReqId(
        NextResponse.json({ error: "ต้องแนบรูปอย่างน้อย 1 และไม่เกิน 5 รูป" }, { status: 400 }),
        reqId
      );
    }

    // สรุปไฟล์แบบปลอดภัย + เตือนถ้าไม่ใช่รูป
    const fileSummary = files.map((f) => {
      const ext = extnameSafe(f.name);
      const type = f.type || "unknown";
      const isImage = typeof type === "string" ? type.startsWith("image/") : false;
      if (!isImage) {
        log("warn", reqId, "Uploaded file is not image", { name: f.name, type, ext });
      } else {
        log("debug", reqId, "Uploaded image detected", { name: f.name, type, ext });
      }
      return { name: f.name, type, ext };
    });
    log("info", reqId, "Files summary", { count: files.length, files: fileSummary });

    // ✅ ค้นหา order + user + orderItems
    stop = startTimer();
    let order;
    try {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, orderItems: true },
      });
    } catch (e: any) {
      log("error", reqId, "DB findUnique(order) error", { error: e?.message });
      throw e;
    }
    log("info", reqId, "DB findUnique(order) done", { ms: stop(), found: !!order, orderId });

    if (!order) {
      log("warn", reqId, "order not found", { orderId });
      return withReqId(NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 }), reqId);
    }

    // 🚨 ตรวจสอบว่า order ถูกจัดส่งสำเร็จหรือยัง
    if (order.status !== "จัดส่งสินค้าสำเร็จเเล้ว") {
      log("warn", reqId, "order not delivered", { status: order.status });
      return withReqId(
        NextResponse.json(
          { error: "ไม่สามารถส่งคำขอคืนสินค้าได้ เนื่องจากออเดอร์ยังไม่ได้จัดส่งสำเร็จ" },
          { status: 400 }
        ),
        reqId
      );
    }

    // 🚨 ตรวจสอบเวลา (ไม่เกิน 3 วันหลังจัดส่ง)
    const deliveredAt = order.updatedAt ?? order.createdAt; // ใช้ updatedAt เป็นเวลาจัดส่ง
    const now = new Date();
    const diffDays =
      (now.getTime() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);

    log("debug", reqId, "delivery time window check", {
      deliveredAt,
      now,
      diffDays: Number(diffDays.toFixed(3)),
    });

    if (diffDays > 3) {
      log("warn", reqId, "return window exceeded", { diffDays });
      return withReqId(
        NextResponse.json(
          { error: "ไม่สามารถคืนสินค้าได้ เนื่องจากเกิน 3 วันหลังจัดส่ง" },
          { status: 400 }
        ),
        reqId
      );
    }

    // ✅ ตรวจสอบสินค้าและจำนวน
    for (const item of items) {
      const orderItem = order.orderItems.find((oi) => oi.id === item.orderItemId);
      if (!orderItem) {
        log("warn", reqId, "orderItem not in order", { orderItemId: item.orderItemId });
        return withReqId(
          NextResponse.json(
            { error: `ไม่พบสินค้าในคำสั่งซื้อ: ${item.orderItemId}` },
            { status: 400 }
          ),
          reqId
        );
      }
      if (item.quantity > orderItem.quantity) {
        log("warn", reqId, "return qty exceeds purchased", {
          requested: item.quantity,
          purchased: orderItem.quantity,
          orderItemId: item.orderItemId,
        });
        return withReqId(
          NextResponse.json(
            { error: `จำนวนคืน (${item.quantity}) เกินกว่าที่ซื้อ (${orderItem.quantity})` },
            { status: 400 }
          ),
          reqId
        );
      }

      // ✅ กันไม่ให้คืนซ้ำ
      stop = startTimer();
      let existingReturn;
      try {
        existingReturn = await prisma.returnItem.findUnique({
          where: { orderItemId: item.orderItemId },
        });
      } catch (e: any) {
        log("error", reqId, "DB findUnique(returnItem) error", { error: e?.message });
        throw e;
      }
      log("debug", reqId, "DB findUnique(returnItem) done", {
        ms: stop(),
        exists: !!existingReturn,
        orderItemId: item.orderItemId,
      });
      if (existingReturn) {
        log("warn", reqId, "duplicate return", { orderItemId: item.orderItemId });
        return withReqId(
          NextResponse.json(
            { error: `สินค้านี้ (orderItemId: ${item.orderItemId}) ได้ถูกส่งคำขอคืนไปแล้ว` },
            { status: 400 }
          ),
          reqId
        );
      }
    }

    // ✅ เก็บรูปลง public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    stop = startTimer();
    await fs.mkdir(uploadDir, { recursive: true });
    log("debug", reqId, "Ensured upload dir", { ms: stop(), uploadDir });

    const savedPaths: string[] = [];
    let totalBytes = 0;
    for (const file of files) {
      const bufTimer = startTimer();
      const bytes = Buffer.from(await file.arrayBuffer());
      totalBytes += bytes.length;
      const ext = extnameSafe(file.name);
      const safeBase = path.basename(file.name).replace(/\s+/g, "_");
      const fileName = `${Date.now()}-${safeBase}`;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, bytes);
      const singleMs = bufTimer();
      savedPaths.push(`/uploads/${fileName}`);
      log("info", reqId, "Saved upload file", {
        name: file.name,
        ext,
        type: file.type || "unknown",
        size: bytes.length,
        ms: singleMs,
        saved: `/uploads/${fileName}`,
      });
    }
    log("info", reqId, "Upload summary", { filesCount: files.length, totalBytes });

    // ✅ สร้าง ReturnRequest + ReturnItem
    stop = startTimer();
    let request;
    try {
      request = await prisma.returnRequest.create({
        data: {
          orderId,
          reason: reason ?? "",
          images: savedPaths,
          status: "รอดำเนินการ",
          items: {
            create: items.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    } catch (e: any) {
      log("error", reqId, "DB create(returnRequest) error", { error: e?.message });
      throw e;
    }
    log("info", reqId, "DB create(returnRequest) done", {
      ms: stop(),
      requestId: request.id,
      itemsCount: request.items.length,
    });

    // ✅ ส่งอีเมลแจ้งลูกค้า
    try {
      const mailTimer = startTimer();
      const info = await sendEmail(
        order.user.email,
        `คำขอคืนสินค้า #${order.trackingId}`,
        `
          <h2>📦 คำขอคืนสินค้าของคุณถูกส่งแล้ว</h2>
          <p>สวัสดีคุณ <b>${order.user.name ?? ""}</b></p>
          <p>หมายเลขคำสั่งซื้อ: ${order.id}</p>
          <p>Tracking ID: ${order.trackingId}</p>
          <p><b>เหตุผล:</b> ${reason ?? "ไม่ระบุ"}</p>
          <p>สถานะ: ${request.status}</p>
          <p>แนบรูปจำนวน: ${savedPaths.length} รูป</p>
          <hr />
          <p>ทีมงานจะตรวจสอบและแจ้งผลให้ทราบภายหลังค่ะ 🙏</p>
        `,
        reqId
      );
      log("info", reqId, "Email sent", {
        ms: mailTimer(),
        to: order.user.email,
        trackingId: order.trackingId,
        messageId: info?.messageId,
      });
    } catch (mailErr: any) {
      log("error", reqId, "Send email failed", { error: mailErr?.message });
      // เดินหน้าต่อ (ไม่ถือว่าเป็น fatal) และคงตอบ 201 ตามเดิม
    }

    const totalMs = totalTimer();
    log("info", reqId, "POST /api/returns success", { requestId: request.id, totalMs });
    return withReqId(
      NextResponse.json({ message: "✅ ส่งคำขอคืนสินค้าเรียบร้อย", request }, { status: 201 }),
      reqId
    );
  } catch (err: any) {
    const totalMs = totalTimer();
    log("error", reqId, "Error creating return request", { error: err?.message, totalMs });
    return withReqId(
      NextResponse.json({ error: "ไม่สามารถส่งคำขอคืนสินค้าได้" }, { status: 500 }),
      reqId
    );
  }
}
