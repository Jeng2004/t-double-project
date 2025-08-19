import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// สร้างประเภทของ item สำหรับ orderItems
type OrderItem = {
  productId: string;
  quantity: number;
  price: number;  // เปลี่ยนเป็นจำนวนเต็ม (Int32)
  size: string;
  unitPrice: number;  // unitPrice ที่เก็บจากตะกร้า
  totalPrice: number;  // totalPrice ที่เก็บจากตะกร้า
};

export async function POST(req: NextRequest) {
  try {
    console.log('📥 รับคำร้อง POST /api/order'); // Log when the API is called

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

    // ตรวจสอบข้อมูลในโปรไฟล์ผู้ใช้
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

    // อัปเดตข้อมูลโปรไฟล์ผู้ใช้
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

    let orderItems: OrderItem[] = items;
    let totalAmount = 0; // สำหรับการคำนวณยอดรวม
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

      orderItems = cart.map((item) => {
        const priceObj = item.product.price as Record<string, number>;
        const price = priceObj[item.size];
        const unitPrice = item.unitPrice; // unitPrice ที่เก็บจากตะกร้า
        const totalPrice = item.totalPrice; // totalPrice ที่เก็บจากตะกร้า

        // เพิ่มการตรวจสอบกรณีที่ไม่ได้รับราคาไซส์
        if (price === undefined || isNaN(price) || price <= 0) {
          console.warn(`❌ ราคาไม่พบหรือไม่ถูกต้องสำหรับสินค้า ${item.productId} ขนาด ${item.size}. ราคา: ${price}`);
          return {
            productId: item.productId,
            quantity: item.quantity,
            price: 0,  // กำหนดราคาเป็น 0 ถ้าราคาไม่พบหรือไม่ถูกต้อง
            size: item.size,
            unitPrice: 0, // unitPrice ที่ไม่ได้รับ
            totalPrice: 0, // totalPrice ที่ไม่ได้รับ
          };
        }

        console.log(`🛒 ราคาไซส์ ${item.size}: ${price}`);
        totalAmount += totalPrice; // คำนวณยอดรวมในระหว่างนี้
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: Math.floor(price),  // ปรับให้ราคาคำนวณเป็นจำนวนเต็ม
          size: item.size,
          unitPrice,
          totalPrice,
        };
      });
      console.log(`✅ โหลดสินค้าจากตะกร้า ${orderItems.length} รายการ`);
    } else {
      // ถ้ามี items ส่งมาให้ใช้ข้อมูลใน `items`
      orderItems.forEach((item) => {
        totalAmount += item.totalPrice;  // เพิ่ม `totalPrice` ที่เก็บจากข้อมูล `items`
      });
    }

    // ตรวจสอบยอดรวมสุดท้าย
    console.log('💰 ยอดรวมที่ต้องชำระ:', totalAmount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      console.warn('❌ ยอดรวมไม่ถูกต้อง:', totalAmount);
      return NextResponse.json({ error: 'ยอดรวมไม่ถูกต้อง' }, { status: 400 });
    }

    console.log('🔁 เริ่มสร้างคำสั่งซื้อด้วย Transaction...');
    const result = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          totalAmount, // ส่ง totalAmount ไปที่ฟิลด์นี้
          status: 'pending', // สถานะคำสั่งซื้อเป็น "pending"
          orderItems: {
            create: orderItems.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              size: item.size,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice, // เพิ่ม totalPrice
            })),
          },
          user: {
            connect: {
              id: userId,
            },
          },
        },
        include: {
          orderItems: true,
        },
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
