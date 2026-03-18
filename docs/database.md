# Database

The app uses **SQLite** via **Prisma ORM**. The database is a single file (`prisma/dev.db`) -- no separate database server needed.

---

## Schema Overview

The schema is defined in `prisma/schema.prisma`. There are 3 models and 2 enums.

### Entity-Relationship Diagram

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│    User      │       │  IssueReceipt    │       │   Magazine   │
├─────────────┤       ├──────────────────┤       ├─────────────┤
│ id       PK │◄──────│ receivedById  FK │       │ id       PK │
│ name        │       │ magazineId    FK │──────►│ name        │
│ email    UQ │       │ id            PK │       │ cadence     │
│ passwordHash│       │ receivedDate     │       │ active      │
│ role        │       │ notes            │       │ notes       │
│ active      │       │ createdAt        │       │ createdAt   │
│ createdAt   │       └──────────────────┘       │ updatedAt   │
│ receipts[] ─┤                                  │ receipts[] ─┤
└─────────────┘                                  └─────────────┘
```

**Relationships:**
- A **User** has many **IssueReceipts** (one-to-many via `receivedById`)
- A **Magazine** has many **IssueReceipts** (one-to-many via `magazineId`)
- An **IssueReceipt** belongs to exactly one User and one Magazine

---

## Models in Detail

### User

```prisma
model User {
  id           String         @id @default(cuid())
  name         String
  email        String         @unique
  passwordHash String
  role         Role           @default(STAFF)
  active       Boolean        @default(true)
  createdAt    DateTime       @default(now())
  receipts     IssueReceipt[]
}
```

| Field          | Type     | Notes                                         |
|----------------|----------|-----------------------------------------------|
| `id`           | String   | Auto-generated CUID (e.g. `clx1a2b3c...`)    |
| `name`         | String   | Display name                                  |
| `email`        | String   | Must be unique; stored lowercase              |
| `passwordHash` | String   | bcrypt hash (never exposed in API responses)  |
| `role`         | Role     | `ADMIN` or `STAFF` (defaults to STAFF)        |
| `active`       | Boolean  | Inactive users cannot log in                  |
| `createdAt`    | DateTime | Auto-set on creation                          |
| `receipts`     | Relation | All receipts this user has recorded           |

### Magazine

```prisma
model Magazine {
  id        String         @id @default(cuid())
  name      String
  cadence   Cadence
  active    Boolean        @default(true)
  notes     String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  receipts  IssueReceipt[]
}
```

| Field       | Type     | Notes                                          |
|-------------|----------|-------------------------------------------------|
| `id`        | String   | Auto-generated CUID                             |
| `name`      | String   | Publication title                               |
| `cadence`   | Cadence  | Delivery frequency (see enum below)             |
| `active`    | Boolean  | Inactive magazines are hidden from the dashboard |
| `notes`     | String?  | Optional notes (nullable)                       |
| `createdAt` | DateTime | Auto-set on creation                            |
| `updatedAt` | DateTime | Auto-updated on any change (`@updatedAt`)       |
| `receipts`  | Relation | All receipt records for this magazine           |

### IssueReceipt

```prisma
model IssueReceipt {
  id           String   @id @default(cuid())
  magazine     Magazine @relation(fields: [magazineId], references: [id])
  magazineId   String
  receivedBy   User     @relation(fields: [receivedById], references: [id])
  receivedById String
  receivedDate DateTime @default(now())
  notes        String?
  createdAt    DateTime @default(now())
}
```

| Field          | Type     | Notes                                          |
|----------------|----------|-------------------------------------------------|
| `id`           | String   | Auto-generated CUID                             |
| `magazineId`   | String   | FK to Magazine                                  |
| `receivedById` | String   | FK to User (who recorded this receipt)          |
| `receivedDate` | DateTime | When the issue was received (defaults to now)   |
| `notes`        | String?  | Optional notes about this specific issue        |
| `createdAt`    | DateTime | When this record was created                    |

---

## Enums

### Role

```prisma
enum Role {
  ADMIN
  STAFF
}
```

- `ADMIN` -- full access: create/edit/delete magazines, manage users, view audit log
- `STAFF` -- can view magazines and mark them as received

### Cadence

```prisma
enum Cadence {
  WEEKLY
  BI_WEEKLY
  MONTHLY
  BI_MONTHLY
  SEASONAL
}
```

| Value        | Meaning                    | Interval              |
|--------------|----------------------------|-----------------------|
| `WEEKLY`     | Every week                 | +7 days               |
| `BI_WEEKLY`  | Every two weeks            | +14 days              |
| `MONTHLY`    | Every month                | +1 calendar month     |
| `BI_MONTHLY` | Every two months           | +2 calendar months    |
| `SEASONAL`   | Every quarter (seasonal)   | +3 calendar months    |

---

## Prisma Client Singleton (lib/db.ts)

In development, Next.js hot-reloads your code frequently. Without a singleton pattern, each reload would create a new Prisma client and open a new database connection. The singleton pattern in `lib/db.ts` prevents this:

```ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

const db: PrismaClient =
  globalForPrisma.prisma ??
  new (PrismaClient as unknown as new () => PrismaClient)()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
```

In plain language: we store the Prisma client on `globalThis` (a global variable that survives hot-reloads). If one already exists, we reuse it. In production, we always create a fresh instance (since there are no hot-reloads).

---

## Prisma Configuration

The Prisma config is in `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "sqlite"
}
```

- The generated Prisma client is output to `app/generated/prisma/` (not the default `node_modules` location)
- The database URL comes from the `DATABASE_URL` environment variable: `file:./prisma/dev.db`

---

## Migration Workflow

Prisma uses **migrations** to track schema changes. Each migration is a SQL file stored in `prisma/migrations/`.

### Creating a new migration

When you change `prisma/schema.prisma`, run:

```bash
npx prisma migrate dev --name describe-your-change
```

This will:
1. Compare your schema against the current database
2. Generate a SQL migration file in `prisma/migrations/`
3. Apply the migration to your local database
4. Regenerate the Prisma client

Example:

```bash
# Adding a "tags" field to Magazine:
npx prisma migrate dev --name add-magazine-tags
```

### Regenerating the client

If you only need to regenerate the Prisma client (without creating a migration), run:

```bash
npx prisma generate
```

This is needed after pulling changes that include new migrations.

### Viewing the database

Prisma Studio is a visual database browser:

```bash
npx prisma studio
```

This opens a web UI at `http://localhost:5555` where you can browse and edit records.

### Applying migrations in production

In the Docker build, migrations are applied via:

```bash
npx prisma migrate deploy
```

This runs all pending migrations without prompting.

---

## Cascade Delete Strategy

SQLite does not support `onDelete: Cascade` in the same way as PostgreSQL. The app handles cascading deletes **manually in application code**.

### Deleting a Magazine

When a magazine is deleted, all its receipts must be deleted first:

```ts
// From app/api/magazines/[id]/route.ts:
await db.issueReceipt.deleteMany({ where: { magazineId: id } })
const magazine = await db.magazine.delete({ where: { id } })
```

Without this, the `magazine.delete()` call would fail with a foreign key constraint error.

### Deleting a User

When a user is deleted, their receipt records are **not** deleted. The receipts remain as historical records. This means `DELETE /api/users/[id]` may fail if the user has receipts, depending on database constraints. In practice, deactivating a user (setting `active: false`) is preferred over deletion.

---

## Backup

The entire database is a single file: `prisma/dev.db`.

To back up:

```bash
cp prisma/dev.db prisma/dev.db.backup
```

In Docker, the database file is mounted as a volume (`./prisma:/app/prisma`), so you can copy it from the host machine at any time.

See [deployment.md](./deployment.md) for the full Docker backup procedure.

---

## Seeding (prisma/seed.js)

The seed script creates sample data for development. Run it with:

```bash
node prisma/seed.js
```

It creates:
- **Admin user:** `admin@library.org` / `admin1234`
- **Staff user:** `staff@library.org` / `staff1234`
- **8 sample magazines:** The Economist, Time, National Geographic, Scientific American, The New Yorker, Consumer Reports, Nature, Wired
- **Random receipts** for each magazine (0-3 receipts with randomized dates)

The seed uses `upsert` where possible to be idempotent -- running it multiple times will not create duplicate users.

---

## Common Prisma Queries Used in This Project

### Find all active magazines

```ts
const magazines = await db.magazine.findMany({
  where: { active: true },
  orderBy: { name: 'asc' },
})
```

### Find a magazine with its receipt count

```ts
const magazine = await db.magazine.findMany({
  orderBy: { name: 'asc' },
  include: { _count: { select: { receipts: true } } },
})
// Each result has mag._count.receipts (a number)
```

### Get receipts with the receiver's name

```ts
const receipts = await db.issueReceipt.findMany({
  where: { magazineId: id },
  orderBy: { receivedDate: 'desc' },
  include: { receivedBy: { select: { name: true } } },
})
// Each receipt has receipt.receivedBy.name
```

### Find a user by email (case-insensitive)

```ts
const user = await db.user.findUnique({
  where: { email: email.toLowerCase().trim() },
})
```
