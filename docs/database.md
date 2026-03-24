# Database

## Overview

| Property | Value |
|---|---|
| Engine | SQLite |
| ORM | Prisma v7 with `@prisma/adapter-better-sqlite3` |
| File | `prisma/dev.db` |
| WAL Mode | Enabled (concurrent reads during writes) |
| Connection | File-based, no server process |

## Database Files

| File | Purpose | Persistent? |
|---|---|---|
| `dev.db` | Main database | Yes — always back up |
| `dev.db-shm` | Shared memory map | Temporary — recreated on open |
| `dev.db-wal` | Write-Ahead Log | Temporary — checkpointed into `dev.db` |

## Connection (lib/db.ts)

The application creates a singleton Prisma client with WAL mode:

```typescript
function createPrismaClient(): PrismaClient {
  const dbUrl = process.env['DATABASE_URL']!
  enableWalMode(dbUrl)
  const adapter = new PrismaBetterSqlite3({ url: dbUrl })
  return new PrismaClient({ adapter })
}
```

In development, the client is stored on `globalThis` to survive hot-reload without creating multiple connections.

## Schema Models

| Model | Purpose | Key Fields |
|---|---|---|
| `User` | Staff/admin accounts | `email` (unique), `passwordHash`, `role`, `active` |
| `Magazine` | Publication definitions | `name`, `cadence`, `language`, `active` |
| `Branch` | Library branches | `name`, `code` (unique), `active` |
| `BranchMagazine` | Branch ↔ Magazine subscriptions | `branchId`, `magazineId`, `quantity`, `active` |
| `IssueReceipt` | Received magazine records | `magazineId`, `receivedById`, `branchId`, `receivedDate` |
| `Transfer` | Inter-branch magazine transfers | `magazineId`, `fromBranchId`, `toBranchId`, `status`, `quantity` |

## Inspection & Maintenance

```bash
# Visual database browser (opens in browser)
npx prisma studio

# Check migration status
npx prisma migrate status

# Apply pending migrations
npx prisma migrate deploy

# Create a new migration after schema changes
npx prisma migrate dev --name <migration_name>

# Regenerate Prisma client (required after schema.prisma changes)
npx prisma generate

# Full database reset (destructive — drops all data)
rm prisma/dev.db && npx prisma migrate dev && npm run seed

# Query database directly with SQLite CLI
sqlite3 prisma/dev.db ".tables"
sqlite3 prisma/dev.db "SELECT id, name, email, role FROM User;"
sqlite3 prisma/dev.db "PRAGMA journal_mode;"   # Should return "wal"
sqlite3 prisma/dev.db "PRAGMA integrity_check;" # Should return "ok"
```

## Migration History

| Migration | Date | Description |
|---|---|---|
| `20260318194042_init` | 2026-03-18 | Initial schema: User, Magazine, Branch, IssueReceipt |
| `20260319181129_add_branch_support` | 2026-03-19 | BranchMagazine join table |
| `20260320171522_add_transfers` | 2026-03-20 | Transfer model and status tracking |
| `20260323170030_add_magazine_language` | 2026-03-23 | Language field on Magazine |
