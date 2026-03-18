@AGENTS.md

# EPL Magazine Tracker — Project Reference

## Overview

Internal web application for library staff to manage periodical magazine receipts.
Staff log when magazines arrive; the system tracks cadence, flags overdue issues, and shows what's expected each week.

**Deployment**: Internal LAN only, Docker Compose. Never internet-facing.
**Users**: Many users total, max 2–3 concurrent. SQLite is sufficient.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (latest stable), App Router | Full-stack in one repo; user is familiar with it |
| Language | **JavaScript only** (no TypeScript) | Co-workers must be able to read the code |
| Database | SQLite via **Prisma ORM** | No extra server; file-based; easy Docker volume backup |
| Auth | Custom session cookies with **jose** (JWT) + **bcrypt** | Simple, no OAuth needed; HTTP-only cookies |
| Styling | **Tailwind CSS** + **shadcn/ui** | Fast to build clean internal UIs |
| Audit logging | **Winston** → `logs/audit.log` (JSON lines) | File-based, no external dependency, mountable in Docker |

---

## Project Structure

```
epl-magazines/
├── app/
│   ├── layout.js                  # Root layout
│   ├── page.js                    # Redirect → /dashboard or /login
│   ├── (auth)/
│   │   └── login/
│   │       └── page.js
│   ├── (dashboard)/
│   │   ├── layout.js              # Sidebar + nav (authenticated shell)
│   │   ├── page.js                # Dashboard: upcoming + overdue
│   │   ├── magazines/
│   │   │   ├── page.js            # Magazine list + mark-received
│   │   │   └── [id]/
│   │   │       └── page.js        # Magazine detail + receipt history
│   │   ├── admin/
│   │   │   ├── magazines/
│   │   │   │   └── page.js        # Admin: create/edit/delete magazines
│   │   │   └── users/
│   │   │       └── page.js        # Admin: create/delete users
│   │   └── log/
│   │       └── page.js            # View audit log (admin only)
│   └── api/
│       ├── auth/
│       │   ├── login/route.js
│       │   └── logout/route.js
│       ├── magazines/
│       │   ├── route.js           # GET list, POST create
│       │   └── [id]/
│       │       ├── route.js       # GET, PUT, DELETE
│       │       └── receipts/
│       │           └── route.js   # POST mark-received, GET history
│       └── users/
│           ├── route.js           # GET list, POST create (admin)
│           └── [id]/route.js      # DELETE (admin)
├── lib/
│   ├── session.js                 # encrypt/decrypt JWT, createSession, deleteSession
│   ├── dal.js                     # Data Access Layer: verifySession, getUser
│   ├── logger.js                  # Winston audit logger
│   ├── cadence.js                 # computeNextExpectedDate, isOverdue helpers
│   └── db.js                     # Prisma client singleton
├── components/
│   ├── ui/                        # shadcn/ui generated components
│   ├── MagazineCard.js
│   ├── OverdueAlert.js
│   └── ReceiptForm.js
├── middleware.js                  # Route protection (redirect unauthed → /login)
├── prisma/
│   ├── schema.prisma
│   └── dev.db                    # SQLite file (git-ignored, Docker volume)
├── logs/
│   └── audit.log                 # Winston output (git-ignored, Docker volume)
├── .env.local                    # Secrets (git-ignored)
├── docker-compose.yml
└── Dockerfile
```

---

## Data Model (`prisma/schema.prisma`)

```prisma
model User {
  id           String        @id @default(cuid())
  name         String
  email        String        @unique
  passwordHash String
  role         Role          @default(STAFF)
  active       Boolean       @default(true)
  createdAt    DateTime      @default(now())
  receipts     IssueReceipt[]
}

enum Role {
  ADMIN
  STAFF
}

model Magazine {
  id        String        @id @default(cuid())
  name      String
  cadence   Cadence
  active    Boolean       @default(true)
  notes     String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  receipts  IssueReceipt[]
}

enum Cadence {
  WEEKLY       // every 7 days
  BI_WEEKLY    // every 14 days
  MONTHLY      // every ~1 month (calendar)
  BI_MONTHLY   // every ~2 months (calendar)
  SEASONAL     // every ~3 months (quarterly)
}

model IssueReceipt {
  id          String   @id @default(cuid())
  magazine    Magazine @relation(fields: [magazineId], references: [id])
  magazineId  String
  receivedBy  User     @relation(fields: [receivedById], references: [id])
  receivedById String
  receivedDate DateTime @default(now())
  notes       String?
  createdAt   DateTime @default(now())
}
```

---

## Key Business Logic

### Cadence → Next Expected Date (`lib/cadence.js`)

No start date is stored. The **last received date** (most recent `IssueReceipt.receivedDate`)
is used as the anchor to compute the next expected date.

| Cadence | Interval |
|---|---|
| WEEKLY | + 7 days |
| BI_WEEKLY | + 14 days |
| MONTHLY | + 1 calendar month |
| BI_MONTHLY | + 2 calendar months |
| SEASONAL | + 3 calendar months |

```js
// lib/cadence.js
import { addDays, addMonths } from 'date-fns'

const CADENCE_OFFSETS = {
  WEEKLY:     (d) => addDays(d, 7),
  BI_WEEKLY:  (d) => addDays(d, 14),
  MONTHLY:    (d) => addMonths(d, 1),
  BI_MONTHLY: (d) => addMonths(d, 2),
  SEASONAL:   (d) => addMonths(d, 3),
}

export function computeNextExpectedDate(lastReceivedDate, cadence) {
  if (!lastReceivedDate) return null
  return CADENCE_OFFSETS[cadence](new Date(lastReceivedDate))
}

export function isOverdue(nextExpectedDate) {
  if (!nextExpectedDate) return false
  return new Date(nextExpectedDate) < new Date()
}
```

If a magazine has **no receipts at all**, it shows in the dashboard as "Never received — status unknown".

### Dashboard Logic

For each active magazine:
1. Fetch most recent `IssueReceipt` → `lastReceivedDate`
2. Compute `nextExpectedDate = computeNextExpectedDate(lastReceivedDate, cadence)`
3. Bucket into:
   - **Overdue / Missing**: `nextExpectedDate < today`
   - **Expected this week**: `today ≤ nextExpectedDate ≤ today + 7`
   - **Upcoming**: `nextExpectedDate > today + 7`

---

## Auth & Sessions

- Passwords hashed with **bcrypt** (cost factor 10)
- Sessions stored as HTTP-only encrypted JWT cookies (7-day expiry) using **jose**
- `SESSION_SECRET` in `.env.local` — generate with `openssl rand -base64 32`
- `middleware.js` redirects unauthenticated users to `/login` for all dashboard routes
- `lib/dal.js` `verifySession()` re-checks auth in every Server Component (defense in depth)

---

## Role Permissions

| Action | STAFF | ADMIN |
|---|---|---|
| View dashboard | ✓ | ✓ |
| Mark magazine received | ✓ | ✓ |
| View receipt history | ✓ | ✓ |
| Create / edit / delete magazine | ✗ | ✓ |
| Create / delete users | ✗ | ✓ |
| View audit log | ✗ | ✓ |

Enforce in API routes: check `session.role === 'ADMIN'` before admin operations.

---

## Audit Logging (`lib/logger.js`)

Every meaningful action is logged as a JSON line to `logs/audit.log`.

```js
// lib/logger.js
import winston from 'winston'

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/audit.log' }),
  ],
})

export function auditLog(userId, action, details = {}) {
  logger.info({ userId, action, ...details })
}
```

**Log every**: login, logout, magazine created/updated/deleted, receipt recorded, user created/deleted.

---

## Environment Variables

```bash
# .env.local — never commit
SESSION_SECRET=<openssl rand -base64 32>
DATABASE_URL="file:./prisma/dev.db"
```

---

## Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma:/app/prisma      # SQLite file persistence
      - ./logs:/app/logs          # Audit log persistence
    env_file:
      - .env.local
    restart: unless-stopped
```

**Backups**: The SQLite file lives at `prisma/dev.db` and the audit log at `logs/audit.log`.
Both are mounted as Docker volumes. Back them up by copying these two files.

---

## Development Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npx prisma studio    # Visual DB browser
npx prisma migrate dev --name <name>   # Create and run migration
npx prisma generate  # Regenerate Prisma client after schema change
```

---

## Conventions

- **JavaScript only** — no `.ts` / `.tsx` files ever
- Server Components by default; add `'use client'` only for interactive forms/state
- All data mutations via **Server Actions** or API route handlers — no client-side fetch for mutations
- Use `date-fns` for all date arithmetic (already a Next.js ecosystem staple)
- shadcn/ui components live in `components/ui/` — add with `npx shadcn@latest add <component>`
