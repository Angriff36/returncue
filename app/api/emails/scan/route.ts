import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGoogleAccessToken, fetchPurchaseEmails } from '@/lib/gmail';
import { parseEmailForPurchase } from '@/lib/parser';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if a scan is already running
    const runningScan = await prisma.emailScan.findFirst({
      where: { userId: session.user.id, status: 'RUNNING' },
    });
    if (runningScan) {
      return NextResponse.json({
        scanId: runningScan.id,
        status: 'ALREADY_RUNNING',
        message: 'A scan is already in progress',
      });
    }

    const accessToken = await getGoogleAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json({
        error: 'GMAIL_NOT_CONNECTED',
        message: 'Connect your Gmail account in Settings first',
      }, { status: 400 });
    }

    // Create scan record
    const scan = await prisma.emailScan.create({
      data: {
        userId: session.user.id,
        status: 'RUNNING',
        totalEmails: 0,
        processedEmails: 0,
        purchasesFound: 0,
      },
    });

    // Run scan in background (don't await)
    runScan(scan.id, accessToken, session.user.id).catch(err => {
      console.error('Scan failed:', err);
      prisma.emailScan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', error: String(err).slice(0, 500) },
      }).catch(() => {});
    });

    return NextResponse.json({ scanId: scan.id, status: 'STARTED' });
  } catch (err) {
    console.error('Scan POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function runScan(scanId: string, accessToken: string, userId: string) {
  let totalProcessed = 0;
  let purchasesFound = 0;
  let pageToken: string | undefined;
  let pagesFetched = 0;
  const MAX_PAGES = 5; // maximum 5 pages * 50 = 250 emails scanned

  try {
    do {
      const { messages, nextPageToken } = await fetchPurchaseEmails(
        accessToken,
        50,
        pageToken
      );
      pageToken = nextPageToken;

      for (const message of messages) {
        // Check if already imported
        const existing = await prisma.purchase.findFirst({
          where: { sourceEmailId: message.id },
        });
        if (existing) {
          totalProcessed++;
          continue;
        }

        // Parse email with LLM
        const parsed = await parseEmailForPurchase(
          message.body,
          message.subject,
          message.from
        );

        if (parsed) {
          try {
            const orderDate = new Date(parsed.orderDate);
            const deadline = new Date(orderDate);
            deadline.setDate(deadline.getDate() + parsed.returnWindowDays);

            await prisma.purchase.create({
              data: {
                userId,
                storeName: parsed.storeName,
                itemDescription: parsed.itemDescription,
                orderDate,
                amount: parsed.amount,
                returnWindowDays: parsed.returnWindowDays,
                deadline,
                status: 'PENDING',
                source: 'gmail_scan',
                sourceEmailId: message.id,
              },
            });
            purchasesFound++;
          } catch (dbErr) {
            console.error('DB insert error:', dbErr);
          }
        }

        totalProcessed++;

        // Update progress every 10 emails
        if (totalProcessed % 10 === 0) {
          await prisma.emailScan.update({
            where: { id: scanId },
            data: {
              processedEmails: totalProcessed,
              purchasesFound,
              totalEmails: totalProcessed,
            },
          });
        }
      }

      pagesFetched++;
    } while (pageToken && pagesFetched < MAX_PAGES);

    // Final update
    await prisma.emailScan.update({
      where: { id: scanId },
      data: {
        status: 'COMPLETED',
        totalEmails: totalProcessed,
        processedEmails: totalProcessed,
        purchasesFound,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('RunScan error:', err);
    await prisma.emailScan.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        error: String(err).slice(0, 500),
        processedEmails: totalProcessed,
        purchasesFound,
        completedAt: new Date(),
      },
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scanId = req.nextUrl.searchParams.get('scanId');
    if (scanId) {
      const scan = await prisma.emailScan.findUnique({ where: { id: scanId } });
      if (!scan || scan.userId !== session.user.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ scan });
    }

    // List recent scans
    const scans = await prisma.emailScan.findMany({
      where: { userId: session.user.id },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ scans });
  } catch (err) {
    console.error('Scan GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
