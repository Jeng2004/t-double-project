// src/app/api/slip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/* -------------------- utils -------------------- */
function formatToThaiTime(date: Date) {
  return new Date(date).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
}

/** หาไฟล์ฟอนต์ TTF ของเราเองเพื่อกัน pdfkit ไปโหลด Helvetica.afm */
function getFontPathOrThrow() {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error(
    "FONT_MISSING: กรุณาวางไฟล์ฟอนต์ไว้ที่ public/fonts/NotoSansThai-Regular.ttf (หรือ NotoSans-Regular.ttf)"
  );
}

/* -------------------- คำนวณความสูง + สร้าง PDF แบบพอดีเนื้อหา -------------------- */
const PAGE_WIDTH_PT = 595.28; // A4 width in points (210mm * 72 / 25.4)
const MARGIN = 24;

function createMeasureDoc(fontPath: string) {
  // เอกสารสำหรับวัดความสูง ไม่ได้ส่งออกจริง
  const md = new PDFDocument({ size: [PAGE_WIDTH_PT, 1000], margin: MARGIN, font: fontPath });
  md.font(fontPath);
  return md;
}

function createDocWithSize(fontPath: string, heightPt: number) {
  // เอกสารจริง ความสูงเท่าที่ต้องใช้
  const doc = new PDFDocument({
    size: [PAGE_WIDTH_PT, Math.max(heightPt, MARGIN * 2 + 1)],
    margin: MARGIN,
    font: fontPath,
  });
  doc.font(fontPath);
  return doc;
}

async function generateSlipPdf(order: any): Promise<Buffer> {
  const fontPath = getFontPathOrThrow();

  // ---------- เตรียมข้อความ ----------
  const created =
    order?.createdAt instanceof Date ? order.createdAt : new Date(order?.createdAt ?? Date.now());

  const title = "ใบเสร็จรับเงิน / Payment Slip";

  const linesInfo = [
    `หมายเลขออเดอร์: ${order?.id ?? "-"}`,
    `Tracking ID: ${order?.trackingId ?? "-"}`,
    `ลูกค้า: ${order?.user?.name ?? "-"}`,
    `อีเมล: ${order?.user?.email ?? "-"}`,
    `วันที่: ${formatToThaiTime(created)}`,
  ];

  const items: any[] = Array.isArray(order?.orderItems) ? order.orderItems : [];
  const itemHeader = "รายละเอียดสินค้า:";
  const itemLines = items.map((it, idx) => {
    const name = it?.product?.name ?? "-";
    const size = it?.size ?? "-";
    const qty = Number(it?.quantity ?? 0);
    const line = Number(it?.totalPrice ?? 0);
    return `${idx + 1}. ${name} (${size}) x ${qty} - ${line.toLocaleString()} บาท`;
  });

  let computedTotal = 0;
  for (const it of items) {
    const line = Number(it?.totalPrice ?? 0);
    if (Number.isFinite(line)) computedTotal += line;
  }
  const totalAmount =
    typeof order?.totalAmount === "number" && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : computedTotal;
  const totalLine = `💰 ยอดรวมทั้งหมด: ${Number(totalAmount || 0).toLocaleString()} บาท`;

  // ---------- วัดความสูงทั้งหมด ----------
  const measure = createMeasureDoc(fontPath);
  const textWidth = PAGE_WIDTH_PT - MARGIN * 2;

  let H = 0;

  // Title
  measure.fontSize(20);
  const titleH = measure.heightOfString(title, { width: textWidth });
  const titleGap = 2 * measure.currentLineHeight(); // moveDown(2)
  H += titleH + titleGap;

  // Info lines
  measure.fontSize(12);
  const infoLineH = (txt: string) => measure.heightOfString(txt, { width: textWidth });
  const lineGap12 = 0.5 * measure.currentLineHeight(); // moveDown(.5)
  for (let i = 0; i < linesInfo.length; i++) {
    H += infoLineH(linesInfo[i]) + (i === linesInfo.length - 1 ? 0 : lineGap12);
  }
  H += measure.currentLineHeight(); // moveDown(1) หลังบล็อก info

  // Item header
  measure.fontSize(14);
  H += measure.heightOfString(itemHeader, { width: textWidth });
  H += measure.currentLineHeight(); // moveDown(1)

  // Item rows
  measure.fontSize(12);
  for (const row of itemLines) {
    H += measure.heightOfString(row, { width: textWidth }) + lineGap12;
  }

  // Total
  measure.fontSize(14);
  H += measure.heightOfString(totalLine, { width: textWidth });

  // Padding ล่างนิดหน่อยให้ไม่ชิดเกินไป
  H += 6;

  // ความสูงหน้า = margin บน + H + margin ล่าง
  const pageHeight = Math.ceil(MARGIN + H + MARGIN);
  measure.end(); // จบเอกสารวัด

  // ---------- สร้าง PDF จริงตามความสูงที่คำนวณ ----------
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = createDocWithSize(fontPath, pageHeight);

      doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      // Render จริง (ลำดับเดียวกับตอนวัด)
      doc.fontSize(20).text(title, { align: "center" });
      doc.moveDown(2);

      doc.fontSize(12);
      linesInfo.forEach((t, idx) => {
        doc.text(t);
        if (idx !== linesInfo.length - 1) doc.moveDown(0.5);
      });
      doc.moveDown(1);

      doc.fontSize(14).text(itemHeader);
      doc.moveDown(1);

      doc.fontSize(12);
      itemLines.forEach((t) => {
        doc.text(t);
        doc.moveDown(0.5);
      });

      doc.fontSize(14).text(totalLine, { align: "right" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* -------------------- DB helpers -------------------- */
async function readOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: { include: { product: true } }, user: true },
  });
}

async function upsertSlip(order: any, pdfBuffer: Buffer) {
  const exist = await prisma.slip.findFirst({ where: { orderId: order.id } });
  if (exist) {
    return prisma.slip.update({
      where: { id: exist.id },
      data: { pdfData: pdfBuffer, userId: order.userId },
    });
  }
  return prisma.slip.create({
    data: { orderId: order.id, userId: order.userId, pdfData: pdfBuffer },
  });
}

/* -------------------- POST: สร้าง/อัปเดต แล้วส่ง PDF -------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId || new URL(req.url).searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });

    const order = await readOrder(orderId);
    if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });

    const pdf = await generateSlipPdf(order);
    await upsertSlip(order, pdf);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${orderId}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("❌ /api/slip POST error:", err);
    return NextResponse.json(
      { error: err?.message || "ไม่สามารถสร้างสลิปได้" },
      { status: 500 }
    );
  }
}

/* -------------------- GET: ถ้าไม่มีให้สร้างอัตโนมัติ -------------------- */
export async function GET(req: NextRequest) {
  try {
    const orderId = new URL(req.url).searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });

    const slip = await prisma.slip.findFirst({ where: { orderId } });
    if (slip) {
      return new NextResponse(slip.pdfData, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=slip-${orderId}.pdf`,
          "Cache-Control": "no-store",
        },
      });
    }

    const order = await readOrder(orderId);
    if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });

    const pdf = await generateSlipPdf(order);
    await upsertSlip(order, pdf);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=slip-${orderId}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("❌ /api/slip GET error:", err);
    return NextResponse.json(
      { error: err?.message || "ไม่สามารถดึงสลิปได้" },
      { status: 500 }
    );
  }
}
