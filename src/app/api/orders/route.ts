export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    console.log('📥 รับคำร้อง POST /api/order');

    const { userId, items, address, phone, name, email } = await req.json();
    console.log('📦 ข้อมูลที่รับมา:', { userId, items, address, phone, name, email });

    if (!userId) {
      console.warn('⚠️ ไม่มี userId');
      return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }

    console.log('🔍 กำลังตรวจสอบผู้ใช้...');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn('❌ ไม่พบผู้ใช้:', userId);
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }
    console.log('✅ พบผู้ใช้:', user.email);

    const missingFields: string[] = [];
    if (!user.name && !name) missingFields.push('name');
    if (!user.phone && !phone) missingFields.push('phone');
    if (!user.address && !address) missingFields.push('address');
    if (!user.email && !email) missingFields.push('email');

    if (missingFields.length > 0) {
      console.warn('⚠️ โปรไฟล์ไม่ครบ:', missingFields);
      return NextResponse.json({
        error: `บัญชีไม่มีข้อมูล ${missingFields.join(', ')} กรุณากรอกให้ครบก่อนทำการสั่งซื้อ`,
      }, { status: 400 });
    }

    if (!user.name || !user.phone || !user.address || !user.email) {
      console.log('🔄 อัปเดตข้อมูลโปรไฟล์...');
      await prisma.user.update({
        where: { id: userId },
        data: {
          name: user.name || name,
          phone: user.phone || phone,
          address: user.address || address,
          email: user.email || email,
        },
      });
      console.log('✅ อัปเดตโปรไฟล์สำเร็จ');
    }

    let orderItems = items;
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      console.log('🛒 ไม่มี items ที่ส่งมา ใช้ตะกร้าแทน');
      const cart = await prisma.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });

      if (cart.length === 0) {
        console.warn('🛒 ตะกร้าว่าง');
        return NextResponse.json({ error: 'ไม่มีสินค้าในตะกร้า' }, { status: 400 });
      }

      orderItems = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.product.price,
        size: item.size,
      }));
      console.log(`✅ โหลดสินค้าจากตะกร้า ${orderItems.length} รายการ`);
    }

    console.log('🔍 ตรวจสอบสต็อกสินค้าก่อนสร้างคำสั่งซื้อ...');
    const insufficientStock: string[] = [];
    for (const item of orderItems) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        console.warn(`❌ ไม่พบสินค้า ID: ${item.productId}`);
        return NextResponse.json({
          error: `❌ ไม่พบสินค้า productId: ${item.productId}`,
        }, { status: 400 });
      }

      const stock: Record<string, number> = product.stock as any;
      const size = item.size;

      if (!size || stock[size] === undefined || stock[size] < item.quantity) {
        insufficientStock.push(`${product.name} (${size}) เหลือ ${stock[size] || 0}`);
      }
    }

    if (insufficientStock.length > 0) {
      console.warn('❌ สินค้าไม่พอ:', insufficientStock);
      return NextResponse.json({
        error: `❌ สินค้าไม่พอ: ${insufficientStock.join(', ')}`,
      }, { status: 400 });
    }

    const totalAmount = orderItems.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0
    );
    console.log('💰 ยอดรวมที่ต้องชำระ:', totalAmount);

    console.log('🔁 เริ่มสร้างคำสั่งซื้อด้วย Transaction...');
    const result = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'pending',
          orderItems: {
            create: orderItems.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              size: item.size,
            })),
          },
        },
        include: { orderItems: true },
      });

      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const stock: Record<string, number> = product.stock as any;
        const size = item.size;
        stock[size] -= item.quantity;

        await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });

        console.log(`✅ หักสต็อก ${product.name} (${size}) คงเหลือ: ${stock[size]}`);
      }

      await tx.cartItem.deleteMany({ where: { userId } });
      console.log('🧹 ล้างตะกร้าสำเร็จ');

      return createdOrder;
    });

    console.log('✅ คำสั่งซื้อสำเร็จ! หมายเลขคำสั่งซื้อ:', result.id);

    return NextResponse.json(
      { message: '✅ สร้างคำสั่งซื้อเรียบร้อยแล้ว', order: result },
      { status: 201 }
    );

  } catch (err: any) {
    console.error('❌ เกิดข้อผิดพลาดขณะสร้างคำสั่งซื้อ:', err);
    return NextResponse.json({ error: 'ไม่สามารถสร้างคำสั่งซื้อได้' }, { status: 500 });
  }
}
