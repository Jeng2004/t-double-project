import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!); // ใช้ default apiVersion
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    console.log('📥 รับคำร้อง POST /api/payment');

    const { userId, items } = await req.json();
    console.log('📦 ข้อมูลที่รับมา:', { userId, items });

    if (!userId || !Array.isArray(items) || items.length === 0) {
      console.warn('⚠️ userId หรือ items ไม่ถูกต้อง');
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });
    }

    console.log('🔄 สร้าง lineItems สำหรับ Stripe...');
    const lineItems = await Promise.all(
      items.map(async (item: any, index: number) => {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          console.error(`❌ ไม่พบสินค้า ID: ${item.productId}`);
          throw new Error(`ไม่พบสินค้า ID: ${item.productId}`);
        }

        const imageUrls = product.imageUrls?.map((url) =>
          url.startsWith('http') ? url : `${process.env.APP_URL}${url}`
        ) || ['https://via.placeholder.com/150'];

        const itemLog = {
          name: product.name,
          price: product.price,
          image: imageUrls[0],
          quantity: item.quantity,
        };
        console.log(`✅ สินค้ารายการที่ ${index + 1}:`, itemLog);

        return {
          price_data: {
            currency: 'thb',
            product_data: {
              name: product.name,
              images: imageUrls,
            },
            unit_amount: Math.round(product.price * 100),
          },
          quantity: item.quantity,
        };
      })
    );

    const successUrl = `${process.env.APP_URL}/payment/success`;
    const cancelUrl = `${process.env.APP_URL}/payment/cancel`;

    console.log('🧾 lineItems ที่จะส่งให้ Stripe:', lineItems);
    console.log('🌐 URL Success:', successUrl);
    console.log('🌐 URL Cancel:', cancelUrl);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
      },
    });

    console.log('✅ Checkout session สร้างเสร็จ:', session.id);
    console.log('🔗 session.url:', session.url);

    return NextResponse.json({ url: session.url }, { status: 200 });

  } catch (error: any) {
    console.error('❌ สร้าง Checkout session ผิดพลาด:', error.message);
    return NextResponse.json({ error: 'ไม่สามารถสร้าง session ได้' }, { status: 500 });
  }
}
