import { prisma } from './prisma';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      mimeType: string;
      body: { data?: string; size: number };
      parts?: Array<{ mimeType: string; body: { data?: string } }>;
    }>;
    body?: { data?: string };
    mimeType: string;
  };
  internalDate: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractEmailBody(payload: { mimeType: string; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> }> }): string {
  // Try text/plain parts first
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Recurse through multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part);
      if (text.trim()) return text;
    }
  }

  // HTML body as fallback
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    // Strip HTML tags for LLM parsing
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

export async function refreshGoogleToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account?.refresh_token) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('Token refresh failed:', await res.text());
      return null;
    }

    const data = await res.json();

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      },
    });

    return data.access_token;
  } catch (err) {
    console.error('Token refresh error:', err);
    return null;
  }
}

export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account?.access_token) return null;

  // Check if token is expired or expires within 5 minutes
  if (account.expires_at && account.expires_at * 1000 < Date.now() + 5 * 60 * 1000) {
    return refreshGoogleToken(userId);
  }

  return account.access_token;
}

export async function fetchPurchaseEmails(
  accessToken: string,
  maxResults = 50,
  pageToken?: string
): Promise<{ messages: Array<{ id: string; body: string; subject: string; from: string; date: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: `subject:("order confirmation" OR "your receipt" OR "purchase confirmation" OR "thank you for your order" OR "order received" OR "order #" OR "invoice #" OR "payment received" OR "your order") -subject:(promo OR "get %" OR sale OR deal OR "news alert" OR breaking OR announcement OR "you've got" OR "don't miss")`, 
    maxResults: String(maxResults),
  });
  if (pageToken) params.set('pageToken', pageToken);

  // List messages
  const listRes = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail API list failed: ${listRes.status} ${err}`);
  }

  const listData = await listRes.json();
  const messageIds: Array<{ id: string }> = listData.messages || [];

  if (messageIds.length === 0) {
    return { messages: [] };
  }

  // Batch fetch full message details (max 50 at a time)
  const messages: Array<{ id: string; body: string; subject: string; from: string; date: string }> = [];

  for (const { id } of messageIds) {
    try {
      const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgRes.ok) continue;

      const msg: GmailMessage = await msgRes.json();
      const body = extractEmailBody(msg.payload);
      const subject = extractHeader(msg.payload.headers, 'Subject');
      const from = extractHeader(msg.payload.headers, 'From');
      const date = extractHeader(msg.payload.headers, 'Date');

      if (body.length > 50) {
        messages.push({ id, body, subject, from, date });
      }
    } catch (err) {
      console.error(`Error fetching message ${id}:`, err);
    }
  }

  return {
    messages,
    nextPageToken: listData.nextPageToken,
  };
}

export async function fetchSubscriptionEmails(
  accessToken: string,
  maxResults = 50,
  pageToken?: string
): Promise<{ messages: Array<{ id: string; body: string; subject: string; from: string; date: string }>; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: 'subject:(receipt OR invoice OR "your subscription" OR "monthly" OR "billing statement" OR "payment confirmed" OR "auto-pay" OR "automatic payment" OR "has been renewed" OR "renewal confirmation") -subject:(order OR shipping OR delivered OR "thank you for your order" OR "your order")',
    maxResults: String(maxResults),
  });
  if (pageToken) params.set('pageToken', pageToken);

  const listRes = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail API list failed: ${listRes.status} ${err}`);
  }

  const listData = await listRes.json();
  const messageIds: Array<{ id: string }> = listData.messages || [];

  if (messageIds.length === 0) {
    return { messages: [] };
  }

  const messages: Array<{ id: string; body: string; subject: string; from: string; date: string }> = [];

  for (const { id } of messageIds) {
    try {
      const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgRes.ok) continue;

      const msg: GmailMessage = await msgRes.json();
      const body = extractEmailBody(msg.payload);
      const subject = extractHeader(msg.payload.headers, 'Subject');
      const from = extractHeader(msg.payload.headers, 'From');
      const date = extractHeader(msg.payload.headers, 'Date');

      if (body.length > 50) {
        messages.push({ id, body, subject, from, date });
      }
    } catch (err) {
      console.error(`Error fetching message ${id}:`, err);
    }
  }

  return {
    messages,
    nextPageToken: listData.nextPageToken,
  };
}
