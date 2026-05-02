import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.purchase.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: any = {};

    if (body.status) updateData.status = body.status;
    if (body.storeName) updateData.storeName = body.storeName;
    if (body.itemDescription) updateData.itemDescription = body.itemDescription;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.returnPortalUrl !== undefined) updateData.returnPortalUrl = body.returnPortalUrl;

    const purchase = await prisma.purchase.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(purchase);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.purchase.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.purchase.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
