const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface ParsedPurchase {
  storeName: string;
  itemDescription: string;
  orderDate: string; // ISO date
  amount: number;
  returnWindowDays: number;
  returnPortalUrl?: string;
}

const SYSTEM_PROMPT = `You extract structured purchase data from order confirmation emails.
Return ONLY valid JSON matching this schema, nothing else:
{
  "storeName": "string - the merchant/store name",
  "itemDescription": "string - brief description of items purchased",
  "orderDate": "ISO 8601 date string (YYYY-MM-DD)",
  "amount": number - total order amount as a float,
  "returnWindowDays": number - the return window in days. If explicitly stated, use that. Otherwise infer: Amazon=30, Apple=14, Walmart=90, Target=90, Best Buy=15, Costco=90, clothing retailers=30, electronics=14-30, default=30,
  "returnPortalUrl": "string or null - the return portal URL if mentioned in the email"
}

Rules:
- If the email is a shipping confirmation (not order confirmation), set amount to 0 and returnWindowDays to 0 to signal SKIP
- If it's a subscription renewal (Netflix, Spotify, SaaS, etc.), set returnWindowDays to 0 to signal SKIP
- If you can't identify a purchase at all, return {"storeName":"","itemDescription":"","orderDate":"","amount":0,"returnWindowDays":0}
- Always infer returnWindowDays from the merchant if not explicitly stated in the email
- Return only the JSON object, no explanation`;

export async function parseEmailForPurchase(
  emailBody: string,
  subject: string = '',
  from: string = ''
): Promise<ParsedPurchase | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('No GEMINI_API_KEY set — using regex fallback');
    return regexFallback(emailBody, subject, from);
  }

  const truncatedBody = emailBody.slice(0, 4000);
  const userMessage = `From: ${from}
Subject: ${subject}

Email body:
${truncatedBody}`;

  try {
    const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 500 }
      }),
    });

    if (!res.ok) {
      console.error('Gemini API error:', await res.text());
      return regexFallback(emailBody, subject, from);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate
    if (!parsed.storeName || parsed.returnWindowDays === 0) return null;

    return {
      storeName: parsed.storeName,
      itemDescription: parsed.itemDescription || 'Purchase',
      orderDate: parsed.orderDate || new Date().toISOString().split('T')[0],
      amount: parsed.amount || 0,
      returnWindowDays: parsed.returnWindowDays || 30,
      returnPortalUrl: parsed.returnPortalUrl || undefined,
    };
  } catch (err) {
    console.error('LLM parsing error:', err);
    return regexFallback(emailBody, subject, from);
  }
}

// Fallback regex parser for common retailers
function regexFallback(
  emailBody: string,
  subject: string,
  from: string
): ParsedPurchase | null {
  const body = emailBody.toLowerCase();
  const combined = `${subject} ${body}`.toLowerCase();

  // Skip shipping confirmations, subscriptions, etc.
  const skipPatterns = [
    /has shipped/i, /shipping confirmation/i, /your.*has been delivered/i,
    /subscription/i, /renewal/i, /your.*plan/i, /monthly.*statement/i,
    /payment receipt/i, /invoice #/i,
  ];
  for (const pattern of skipPatterns) {
    if (pattern.test(subject)) return null;
  }

  // Try to extract amounts
  const amountRegex = /\$(\d+\.?\d{0,2})/g;
  const amounts: number[] = [];
  let am;
  while ((am = amountRegex.exec(combined)) !== null) {
    amounts.push(parseFloat(am[1]));
  }
  const totalAmount = amounts.length > 0 ? Math.max(...amounts) : 0;

  if (totalAmount === 0 && !/order|purchase|confirmation/i.test(subject)) {
    return null;
  }

  // Extract store name from From header
  let storeName = '';
  const fromMatch = from.match(/(?:from\s+)?([^<@]+?)(?:\s*<|$)/i);
  if (fromMatch) {
    storeName = fromMatch[1].trim();
    // Clean up common suffixes
    storeName = storeName
      .replace(/\b(store|shop|orders|order|support|customer\s*service|team|no-?reply)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!storeName || storeName.length < 2) {
    // Try known domains
    const domainMap: Record<string, string> = {
      amazon: 'Amazon', walmart: 'Walmart', target: 'Target',
      bestbuy: 'Best Buy', costco: 'Costco', homedepot: 'Home Depot',
      lowes: "Lowe's", apple: 'Apple', etsy: 'Etsy', ebay: 'eBay',
      shopify: 'Shopify Store', 'shop.app': 'Shop',
    };
    for (const [domain, name] of Object.entries(domainMap)) {
      if (combined.includes(domain)) { storeName = name; break; }
    }
  }

  if (!storeName) storeName = 'Online Store';

  // Extract date
  const dateRegex = /(?:order(?:ed)?\s*(?:date|on)?|date)[:\s]+([a-z]+ \d{1,2},? \d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i;
  const dateMatch = combined.match(dateRegex);
  const orderDate = dateMatch
    ? new Date(dateMatch[1]).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // Known return windows
  const returnWindows: Record<string, number> = {
    amazon: 30, walmart: 90, target: 90, 'best buy': 15,
    costco: 90, 'home depot': 90, "lowe's": 90, apple: 14,
    etsy: 30, ebay: 30, nordstrom: 30, zappos: 365,
  };
  const returnWindowDays = returnWindows[storeName.toLowerCase()] || 30;

  return {
    storeName: storeName.charAt(0).toUpperCase() + storeName.slice(1),
    itemDescription: subject.replace(/^(order|purchase|confirmation)[:\s-]*/i, '').trim() || 'Purchase',
    orderDate,
    amount: totalAmount,
    returnWindowDays,
  };
}

// ── Subscription Parser ──────────────────────────────────────────

export interface ParsedSubscription {
  serviceName: string;
  amount: number;
  currency: string;
  billingFrequency: 'monthly' | 'annual' | 'weekly' | 'unknown';
  lastBilledAt: string; // ISO date
  nextBilledAt?: string; // ISO date
}

const SUBSCRIPTION_SYSTEM_PROMPT = `You extract structured subscription data from billing/receipt emails for recurring services.
Return ONLY valid JSON matching this schema, nothing else:
{
  "serviceName": "string - the service name (Netflix, Spotify, AWS, Notion, etc.)",
  "amount": number - the amount charged as a float,
  "currency": "USD" or "EUR" or "GBP" etc.,
  "billingFrequency": "monthly" | "annual" | "weekly" | "unknown",
  "lastBilledAt": "ISO 8601 date string (YYYY-MM-DD) of when this charge occurred",
  "nextBilledAt": "ISO 8601 date string or null - the next billing date if mentioned"
}

Rules:
- If the email is a one-time purchase (order confirmation, shipping), return {"serviceName":"","amount":0,"currency":"USD","billingFrequency":"unknown","lastBilledAt":"","nextBilledAt":null}
- Infer billing frequency from amount and context: small monthly charges ($5-$30), larger annual charges ($50-$200)
- For annual subscriptions, look for phrases like "annual", "yearly", "12 months"
- Extract the service name from the merchant, not the email sender (e.g. "Netflix" not "noreply@netflix.com")
- If you can't determine the frequency, use "unknown"
- Return only the JSON object, no explanation`;

export async function parseEmailForSubscription(
  emailBody: string,
  subject: string = '',
  from: string = ''
): Promise<ParsedSubscription | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('No GEMINI_API_KEY set — using regex fallback for subscription');
    return subscriptionRegexFallback(emailBody, subject, from);
  }

  const truncatedBody = emailBody.slice(0, 4000);
  const userMessage = `From: ${from}
Subject: ${subject}

Email body:
${truncatedBody}`;

  try {
    const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${SUBSCRIPTION_SYSTEM_PROMPT}\n\n${userMessage}` }]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 500 }
      }),
    });

    if (!res.ok) {
      console.error('Gemini API error:', await res.text());
      return subscriptionRegexFallback(emailBody, subject, from);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.serviceName || parsed.amount === 0) return null;

    return {
      serviceName: parsed.serviceName,
      amount: parsed.amount || 0,
      currency: parsed.currency || 'USD',
      billingFrequency: parsed.billingFrequency || 'unknown',
      lastBilledAt: parsed.lastBilledAt || new Date().toISOString().split('T')[0],
      nextBilledAt: parsed.nextBilledAt || undefined,
    };
  } catch (err) {
    console.error('Subscription LLM parsing error:', err);
    return subscriptionRegexFallback(emailBody, subject, from);
  }
}

// Fallback regex for subscription detection
function subscriptionRegexFallback(
  emailBody: string,
  subject: string,
  from: string
): ParsedSubscription | null {
  const combined = `${subject} ${emailBody}`.toLowerCase();

  // Must look like a receipt/invoice/billing email
  const isReceipt = /receipt|invoice|billing|payment|charged|renewed|subscription/i.test(subject);
  if (!isReceipt) return null;

  // Skip one-time orders
  const skip = /order #|shipping|tracking|delivered|your order|purchase confirmation/i;
  if (skip.test(subject) && !/subscription|renewal|monthly|annual/i.test(combined)) return null;

  // Extract amount
  const amountRegex = /\$(\d+\.?\d{0,2})/g;
  const amounts: number[] = [];
  let am;
  while ((am = amountRegex.exec(combined)) !== null) {
    amounts.push(parseFloat(am[1]));
  }
  const amount = amounts.length > 0 ? Math.max(...amounts) : 0;
  if (amount === 0) return null;

  // Extract service name from From header
  let serviceName = '';
  const fromMatch = from.match(/(?:from\s+)?([^<@]+?)(?:\s*<|$)/i);
  if (fromMatch) {
    serviceName = fromMatch[1].trim()
      .replace(/\b(no-?reply|billing|support|hello|team|info|payments?|accounts?)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Try known service domains
  const knownServices: Record<string, string> = {
    netflix: 'Netflix', spotify: 'Spotify', hulu: 'Hulu',
    'disney+': 'Disney+', 'disneyplus': 'Disney+', hbomax: 'HBO Max', max: 'Max',
    amazon: 'Amazon Prime', prime: 'Amazon Prime', 'apple.com/bill': 'Apple',
    icloud: 'iCloud', 'youtube premium': 'YouTube Premium',
    notion: 'Notion', figma: 'Figma', linear: 'Linear', vercel: 'Vercel',
    github: 'GitHub', gitlab: 'GitLab', 'digitalocean': 'DigitalOcean',
    aws: 'AWS', 'google one': 'Google One', 'google drive': 'Google Drive',
    dropbox: 'Dropbox', chatgpt: 'ChatGPT', 'openai': 'ChatGPT',
    midjourney: 'Midjourney', canva: 'Canva', adobe: 'Adobe',
    nytimes: 'NY Times', wsj: 'Wall Street Journal', substack: 'Substack',
    patreon: 'Patreon', twitch: 'Twitch', discord: 'Discord',
  };
  for (const [domain, name] of Object.entries(knownServices)) {
    if (combined.includes(domain)) { serviceName = name; break; }
  }

  if (!serviceName) serviceName = 'Unknown Service';

  // Detect billing frequency
  let billingFrequency: 'monthly' | 'annual' | 'weekly' | 'unknown' = 'unknown';
  if (/annual|yearly|12.?month|1 year/i.test(combined)) billingFrequency = 'annual';
  else if (/monthly|per month|\/mo|every month/i.test(combined)) billingFrequency = 'monthly';
  else if (/weekly|per week|\/wk/i.test(combined)) billingFrequency = 'weekly';
  else if (amount < 25) billingFrequency = 'monthly';
  else if (amount > 50) billingFrequency = 'annual';

  // Extract date
  const dateRegex = /(?:date|charged|paid|billed)[:\s]+([a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})/i;
  const dateMatch = combined.match(dateRegex);
  const lastBilledAt = dateMatch
    ? new Date(dateMatch[1]).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // Estimate next billing date
  let nextBilledAt: string | undefined;
  try {
    const lastDate = new Date(lastBilledAt);
    if (billingFrequency === 'monthly') {
      lastDate.setMonth(lastDate.getMonth() + 1);
      nextBilledAt = lastDate.toISOString().split('T')[0];
    } else if (billingFrequency === 'annual') {
      lastDate.setFullYear(lastDate.getFullYear() + 1);
      nextBilledAt = lastDate.toISOString().split('T')[0];
    } else if (billingFrequency === 'weekly') {
      lastDate.setDate(lastDate.getDate() + 7);
      nextBilledAt = lastDate.toISOString().split('T')[0];
    }
  } catch { /* leave undefined */ }

  return {
    serviceName,
    amount,
    currency: 'USD',
    billingFrequency,
    lastBilledAt,
    nextBilledAt,
  };
}
