# ReturnCue

A personal return-deadline tracker for online shoppers. Never miss a return window again.

## Features

- **Dashboard** with countdown badges showing days until return deadline
- **Add Purchase** form with quick-select for popular stores
- **Status Tracker** — cycle between Keep, Return Started, Returned, Refunded
- **Savings Counter** — tracks total money recovered from successful returns
- **Dark Mode** with system preference detection
- Sort and filter by store, status, or deadline

## Tech Stack

- Next.js 13 (App Router), TypeScript, Tailwind CSS
- Neon serverless Postgres via Prisma ORM
- NextAuth.js (email/password + optional Google OAuth)
- Sonner for toast notifications

## Setup

1. Clone and install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Configure your `.env`:
   - `DATABASE_URL` — Your Neon Postgres connection string
   - `NEXTAUTH_SECRET` — Run `openssl rand -base64 32` to generate
   - `NEXTAUTH_URL` — Your app URL (http://localhost:3000 for local)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Optional, for Google OAuth

4. Push the database schema:

```bash
npx prisma db push
```

5. Generate Prisma client:

```bash
npx prisma generate
```

6. Start the dev server:

```bash
npm run dev
```

## Database Models

- **User** — id, email, name, password (hashed), OAuth accounts
- **Purchase** — storeName, itemDescription, orderDate, returnWindowDays, deadline (auto-calculated), amount, status, notes, returnPortalUrl
- **Status enum** — KEEP, RETURN_STARTED, RETURNED, REFUNDED

## Design

Stripe-inspired design language with clean typography, blue-tinted shadows, and generous whitespace. Fully responsive from 320px to 1440px.
