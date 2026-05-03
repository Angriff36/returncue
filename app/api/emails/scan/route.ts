import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGoogleAccessToken, fetchPurchaseEmails } from '@/lib/gmail';
import { parseEmailForPurchase } from '@/lib/parser';

const MAX_PAGES = 5;
const BATCH_SIZE = 5; // parallel Gemini calls per batch

const PROMO_PATTERNS = [
  /(?:get|save|up to)\s+\d+%/i,
  /\b(?:promo|deal|sale|discount)\b.*\b(?:just for you|exclusive|limited)\b/i,
  /\b(?:news alert|breaking news|announcement|newsletter)\b/i,
  /you'?ve got a promo/i,
  /(?:don't miss|last chance|ending soon|hurry|act now|final hours)/i,
  /(?:now available|new arrivals|just dropped|introducing|check this out)/i,
  /(?:unlock|claim your|upgrade now|shop fresh)/i,
  /(?:sweet savings|hungry again\?|pre-order the new)/i,
  /(?:order your faves|get \d+% off|your.*next.*order)/i,
];

function isPromo(subject: string): boolean {
  return PROMO_PATTERNS.some(p => p.test(subject));
}

async function processBatch(
  scanId: string,
  userId: string,
  batch: { id: string; subject: string; body: string; from: string }[]
): Promise<{ found: number; skipped: number }> {
  let found = 0;
  let skipped = 0;
  let processedInBatch = 0;

  for (const email of batch) {
    // Check already imported
    const existing = await prisma.purchase.findFirst({
      where: { sourceEmailId: email.id },
    });
    if (existing) {
      processedInBatch++;
      continue;
    }

    // Skip promos
    if (isPromo(email.subject)) {
      processedInBatch++;
      skipped++;
      continue;
    }

    // Parse with Gemini
    const parsed = await parseEmailForPurchase(email.body, email.subject, email.from);

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
            status: 'KEEP',
            source: 'gmail_scan',
            sourceEmailId: email.id,
          },
        });
        found++;
      } catch (dbErr) {
        console.error('DB insert error:', dbErr);
      }
    }

    processedInBatch++;
  }

  // Force Prisma to flush any pending transactions
  await prisma.$disconnect();

  return { found, skipped };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if scan already running
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
        skippedEmails: 0,
      },
    });

    // Fire off the scan — returns immediately so the user gets the scanId
    runScanInBackground(scan.id, session.user.id, accessToken).catch(err => {
      console.error('Background scan failed:', err);
      prisma.emailScan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', error: String(err).slice(0, 500), completedAt: new Date() },
      }).catch(() => {});
    });

    return NextResponse.json({ scanId: scan.id, status: 'STARTED' });

  } catch (err) {
    console.error('Scan POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function runScanInBackground(scanId: string, userId: string, accessToken: string) {
  let totalProcessed = 0;
  let totalFound = 0;
  let totalSkipped = 0;
  let pageToken: string | undefined;
  let pagesFetched = 0;

  try {
    do {
      const { messages, nextPageToken } = await fetchPurchaseEmails(accessToken, 50, pageToken);
      pageToken = nextPageToken;

      // Process in parallel batches
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);

        // Update currentSubject for the UI
        const currentBatchSubject = batch[0]?.subject?.slice(0, 200) || null;

        const { found, skipped } = await processBatch(scanId, userId, batch);

        totalFound += found;
        totalSkipped += skipped;
        totalProcessed += batch.length;

        // Update progress after each batch
        await prisma.emailScan.update({
          where: { id: scanId },
          data: {
            processedEmails: totalProcessed,
            purchasesFound: totalFound,
            skippedEmails: totalSkipped,
            totalEmails: totalProcessed,
            currentSubject: currentBatchSubject,
          },
        });
      }

      pagesFetched++;
    } while (pageToken && pagesFetched < MAX_PAGES);

    // Mark complete
    await prisma.emailScan.update({
      where: { id: scanId },
      data: {
        status: 'COMPLETED',
        totalEmails: totalProcessed,
        processedEmails: totalProcessed,
        purchasesFound: totalFound,
        skippedEmails: totalSkipped,
        completedAt: new Date(),
      },
    });

    console.log(`Scan ${scanId} complete: ${totalProcessed} emails, ${totalFound} purchases, ${totalSkipped} skipped`);
  } catch (err) {
    console.error('Scan error:', err);
    await prisma.emailScan.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        error: String(err).slice(0, 500),
        totalEmails: totalProcessed,
        processedEmails: totalProcessed,
        purchasesFound: totalFound,
        skippedEmails: totalSkipped,
        completedAt: new Date(),
      },
    }).catch(() => {});
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
