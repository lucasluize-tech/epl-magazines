# Application Code Logic

## Project Structure

```
app/
├── (auth)/login/           # Login page (public)
├── (dashboard)/            # Authenticated shell (sidebar + nav)
│   ├── dashboard/          # Dashboard: overdue, this week, upcoming
│   ├── magazines/          # Magazine list + detail views
│   ├── admin/
│   │   ├── magazines/      # Admin: manage magazine definitions
│   │   ├── users/          # Admin: manage user accounts
│   │   └── reports/        # Admin: data reports
│   └── log/                # Admin: audit log viewer
├── api/                    # REST API routes (see api-routes.md)
lib/
├── db.ts                   # Prisma client singleton (WAL mode)
├── session.ts              # JWT encrypt/decrypt, create/delete session
├── dal.ts                  # Data Access Layer: verifySession, getUser
├── logger.ts               # Winston audit logger
├── cadence.ts              # Next expected date computation
├── branch.ts               # Branch cookie helper
├── db-retry.ts             # withRetry() for transient SQLite locks
└── utils.ts                # cn() Tailwind class merging
components/
├── ui/                     # shadcn/ui generated components
├── Sidebar.tsx             # Navigation sidebar
├── BranchSelector.tsx      # Branch dropdown (cookie-persisted)
└── ...                     # Feature-specific components
```

## Rendering Model

- **Server Components** by default — data fetching happens on the server
- `'use client'` only on interactive components (forms, dropdowns, state)
- All mutations go through API route handlers or Server Actions

## Database Retry Logic (lib/db-retry.ts)

All write operations are wrapped with `withRetry()`:

```typescript
withRetry(fn, maxRetries = 2, delayMs = 100)
```

Retries on: `SQLITE_BUSY`, `SQLITE_LOCKED`, Prisma `P2034`, `"database is locked"`. Suitable for the expected 2–3 concurrent users.

## Route Protection (proxy.ts)

Edge middleware that runs on all non-API, non-static routes:

- Unauthenticated → redirect to `/login`
- Authenticated on `/login` → redirect to `/`
- Cannot import `server-only` modules (Edge runtime limitation)

**After editing `proxy.ts`**, delete the `.next/` cache directory for changes to take effect in development.

## Code Formatting & Linting

```bash
# Run ESLint
npm run lint

# Type check
npx tsc --noEmit
```
