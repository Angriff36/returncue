import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGoogleAccessToken, fetchPurchaseEmails, fetchSubscriptionEmails } from '@/lib/gmail';
import { parseEmailForPurchase, parseEmailForSubscription } from '@/lib/parser';

const MAX_PAGES = 5;

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

    // Run SYNCHRONOUSLY — await everything before returning
    let totalProcessed = 0;
    let purchasesFound = 0;
    let skippedCount = 0;
    let pageToken: string | undefined;
    let pagesFetched = 0;

    try {
      do {
        const { messages, nextPageToken } = await fetchPurchaseEmails(accessToken, 50, pageToken);
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

          // Pre-filter: skip obvious promo/news
          const promoPatterns = [
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
          const isPromo = promoPatterns.some(p => p.test(message.subject));
          if (isPromo) {
            totalProcessed++;
            skippedCount++;
            continue;
          }

          // Parse email with LLM
          const parsed = await parseEmailForPurchase(message.body, message.subject, message.from);

          if (parsed) {
            try {
              const orderDate = new Date(parsed.orderDate);
              const deadline = new Date(orderDate);
              deadline.setDate(deadline.getDate() + parsed.returnWindowDays);

              await prisma.purchase.create({
                data: {
                  userId: session.user.id,
                  storeName: parsed.storeName,
                  itemDescription: parsed.itemDescription,
                  orderDate,
                  amount: parsed.amount,
                  returnWindowDays: parsed.returnWindowDays,
                  deadline,
                  status: 'KEEP',
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

          // Update progress every 5 emails
          if (totalProcessed % 5 === 0) {
            await prisma.emailScan.update({
              where: { id: scan.id },
              data: {
                processedEmails: totalProcessed,
                purchasesFound,
                skippedEmails: skippedCount,
                totalEmails: totalProcessed,
                currentSubject: message.subject?.slice(0, 200) || null,
              },
            });
          }
        }

        pagesFetched++;
      } while (pageToken && pagesFetched < MAX_PAGES);

      // Final update: COMPLETED
      await prisma.emailScan.update({
        where: { id: scan.id },
        data: {
          status: 'COMPLETED',
          totalEmails: totalProcessed,
          processedEmails: totalProcessed,
          purchasesFound,
          skippedEmails: skippedCount,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      console.error('Scan error:', err);
      await prisma.emailScan.update({
        where: { id: scan.id },
        data: {
          status: 'FAILED',
          error: String(err).slice(0, 500),
          processedEmails: totalProcessed,
          purchasesFound,
          skippedEmails: skippedCount,
          completedAt: new Date(),
        },
      });
    }

    // Run subscription scan in background (non-critical, smaller scope)
    runSubscriptionScan(scan.id, accessToken, session.user.id).catch(err => {
      console.error('Subscription scan failed:', err);
    });

    return NextResponse.json({
      scanId: scan.id,
      status: 'COMPLETED',
      totalEmails: totalProcessed,
      purchasesFound,
      skippedEmails: skippedCount,
    });
  } catch (err) {
    console.error('Scan POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function runSubscriptionScan(scanId: string, accessToken: string, userId: string) {
  let totalProcessed = 0;
  let subscriptionsFound = 0;
  let pageToken: string | undefined;
  let pagesFetched = 0;

  try {
    do {
      const { messages, nextPageToken } = await fetchSubscriptionEmails(accessToken, 50, pageToken);
      pageToken = nextPageToken;

      for (const message of messages) {
        const existing = await prisma.subscription.findFirst({
          where: { sourceEmailId: message.id },
        });
        if (existing) {
          totalProcessed++;
          continue;
        }

        const parsed = await parseEmailForSubscription(message.body, message.subject, message.from);

        if (parsed) {
          try {
            const lastBilledAt = new Date(parsed.lastBilledAt);
            let nextBilledAt: Date | undefined;
            if (parsed.nextBilledAt) {
              nextBilledAt = new Date(parsed.nextBilledAt);
            }

            await prisma.subscription.create({
              data: {
                userId,
                serviceName: parsed.serviceName,
                amount: parsed.amount,
                currency: parsed.currency,
                billingFrequency: parsed.billingFrequency,
                lastBilledAt,
                nextBilledAt,
                status: 'active',
                source: 'gmail_scan',
                sourceEmailId: message.id,
              },
            });
            subscriptionsFound++;
          } catch (dbErr) {
            console.error('Subscription DB insert error:', dbErr);
          }
        }

        totalProcessed++;

        if (totalProcessed % 10 === 0) {
          console.log(`Subscription scan progress: ${totalProcessed} processed, ${subscriptionsFound} found`);
        }
      }

      pagesFetched++;
    } while (pageToken && pagesFetched < MAX_PAGES);

    console.log(`Subscription scan complete: ${totalProcessed} emails, ${subscriptionsFound} found`);
  } catch (err) {
    console.error('Subscription scan error:', err);
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
