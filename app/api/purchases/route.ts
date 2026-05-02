import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: { userId: (session.user as any).id },
      orderBy: { deadline: 'asc' },
    });

    return NextResponse.json(purchases);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storeName, itemDescription, orderDate, returnWindowDays, amount, notes, returnPortalUrl } = body;

    if (!storeName || !itemDescription || !orderDate || !returnWindowDays || amount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const order = new Date(orderDate);
    const deadline = new Date(order);
    deadline.setDate(deadline.getDate() + parseInt(returnWindowDays));

    const purchase = await prisma.purchase.create({
      data: {
        userId: (session.user as any).id,
        storeName,
        itemDescription,
        orderDate: order,
        returnWindowDays: parseInt(returnWindowDays),
        deadline,
        amount: parseFloat(amount),
        notes: notes || null,
        returnPortalUrl: returnPortalUrl || null,
      },
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
