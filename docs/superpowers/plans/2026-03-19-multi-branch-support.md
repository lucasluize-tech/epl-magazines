# Multi-Branch Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-branch support so each EPL library location (Main, North, Clara Barton, Bookmobile) can independently track its own magazine subscriptions, quantities, and receipts — with a persistent branch selector in the UI that filters all views.

**Architecture:** New `Branch` and `BranchMagazine` tables create a many-to-many relationship between branches and magazines. `IssueReceipt` gains a `branchId` foreign key. A branch selector persisted in a cookie lets staff filter dashboard/magazines views per-branch. API routes accept an optional `branchId` query param for filtering. The seed script pre-populates the four EPL branches.

**Tech Stack:** Prisma ORM v7 (SQLite), Next.js App Router, React Server Components, shadcn/ui, cookies for branch persistence, existing auth/session infrastructure.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `app/api/branches/route.ts` | GET all branches (any auth) |
| `app/api/branches/[id]/magazines/route.ts` | GET magazines for branch, POST add magazine to branch (admin) |
| `app/api/branches/[id]/magazines/[magazineId]/route.ts` | PUT update subscription (qty), DELETE remove magazine from branch (admin) |
| `components/BranchSelector.tsx` | Client component: dropdown to pick active branch, persists to cookie |
| `lib/branch.ts` | Server helper: `getActiveBranchId()` reads branch cookie |
| `types/branch.ts` | **NO** — add branch types to existing `types/index.ts` |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `Branch`, `BranchMagazine` models; add `branchId` FK to `IssueReceipt` |
| `prisma/seed.ts` | Seed 4 branches + assign magazines to branches with quantities |
| `types/index.ts` | Add `Branch`, `BranchMagazine`, `BranchCode` types; add `branchId` to `IssueReceipt`; add new audit actions |
| `components/Sidebar.tsx` | Add `BranchSelector` above user info section |
| `app/(dashboard)/dashboard/page.tsx` | Read branch cookie, filter magazines by branch subscription + receipts |
| `app/(dashboard)/magazines/page.tsx` | Read branch cookie, filter magazines by branch, add "Total Issues" column |
| `app/(dashboard)/magazines/[id]/page.tsx` | Show branch-specific receipt history, display branch name on each receipt |
| `app/api/magazines/[id]/receipts/route.ts` | POST: require `branchId` in body; GET: optional `branchId` query filter |
| `components/MagazineCard.tsx` | Show branch-specific last received / next expected |
| `components/MarkReceivedDialog.tsx` | Auto-populate branchId from cookie (hidden or displayed) |
| `lib/logger.ts` | No code changes — already generic enough |

> **Out of scope for this plan:** Admin UI for managing branch-magazine assignments (the API endpoints exist in Task 5, but the admin page to use them will be a separate plan). `AdminMagazinesClient.tsx` is unchanged.

---

## Task 1: Prisma Schema — Branch & BranchMagazine Models

**Files:**
- Modify: `prisma/schema.prisma`

This task adds the database tables. No application code yet — just schema and migration.

- [ ] **Step 1: Add Branch model to schema**

In `prisma/schema.prisma`, add after the `Cadence` enum:

```prisma
model Branch {
  id        String            @id @default(cuid())
  name      String
  code      String            @unique
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())
  magazines BranchMagazine[]
  receipts  IssueReceipt[]
}
```

- [ ] **Step 2: Add BranchMagazine join table**

Add after the `Branch` model:

```prisma
model BranchMagazine {
  id         String   @id @default(cuid())
  branch     Branch   @relation(fields: [branchId], references: [id])
  branchId   String
  magazine   Magazine @relation(fields: [magazineId], references: [id])
  magazineId String
  quantity   Int      @default(1)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())

  @@unique([branchId, magazineId])
}
```

- [ ] **Step 3: Add branchId to IssueReceipt**

Modify the existing `IssueReceipt` model — add the `branch` relation and `branchId` field. The field is **optional** (`String?`) so existing receipts without a branch remain valid:

```prisma
model IssueReceipt {
  id           String   @id @default(cuid())
  magazine     Magazine @relation(fields: [magazineId], references: [id])
  magazineId   String
  receivedBy   User     @relation(fields: [receivedById], references: [id])
  receivedById String
  branch       Branch?  @relation(fields: [branchId], references: [id])
  branchId     String?
  receivedDate DateTime @default(now())
  notes        String?
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 4: Add reverse relation on Magazine model**

Add `branches BranchMagazine[]` to the existing `Magazine` model (after the `receipts` field):

```prisma
model Magazine {
  id        String            @id @default(cuid())
  name      String
  cadence   Cadence
  active    Boolean           @default(true)
  notes     String?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  receipts  IssueReceipt[]
  branches  BranchMagazine[]
}
```

- [ ] **Step 5: Run migration**

```bash
npx prisma migrate dev --name add-branch-support
```

Expected: Migration creates `Branch`, `BranchMagazine` tables and adds `branchId` column to `IssueReceipt`.

- [ ] **Step 6: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: No errors. Generated client in `generated/prisma/`.

- [ ] **Step 7: Verify schema compiles**

```bash
npx prisma validate
```

Expected: "The schema is valid."

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Branch, BranchMagazine models and branchId on IssueReceipt"
```

---

## Task 2: Types — Branch Domain Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add BranchCode type**

Add after the `MagazineStatus` type (around line 17):

```typescript
/** Short code identifying each library branch */
export type BranchCode = 'MAIN' | 'NORTH' | 'CB' | 'MOBILE'
```

- [ ] **Step 2: Add Branch interface**

Add a new "Branches" section after the "Receipts" section (after line 105):

```typescript
// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Raw branch record from the database */
export interface Branch {
  id: string
  name: string
  code: BranchCode
  active: boolean
  createdAt: Date
}

/** Branch magazine subscription (join table record) */
export interface BranchMagazine {
  id: string
  branchId: string
  magazineId: string
  quantity: number
  active: boolean
  createdAt: Date
}

/** Branch with count of active magazine subscriptions */
export interface BranchWithCount extends Branch {
  _count: { magazines: number }
}
```

- [ ] **Step 3: Update IssueReceipt interface**

Add `branchId` to the existing `IssueReceipt` interface:

```typescript
/** Raw issue receipt record */
export interface IssueReceipt {
  id: string
  magazineId: string
  receivedById: string
  branchId: string | null
  receivedDate: Date
  notes: string | null
  createdAt: Date
}
```

- [ ] **Step 4: Update ReceiptWithReceiver to include branch name**

```typescript
/** Receipt with the receiver's name and branch name joined */
export interface ReceiptWithReceiver extends IssueReceipt {
  receivedBy: { name: string }
  branch?: { name: string; code: string } | null
}
```

- [ ] **Step 5: Add new audit actions**

Update the `AuditAction` type to include branch-related actions:

```typescript
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'MAGAZINE_CREATED'
  | 'MAGAZINE_UPDATED'
  | 'MAGAZINE_DELETED'
  | 'RECEIPT_CREATED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'BRANCH_MAGAZINE_ADDED'
  | 'BRANCH_MAGAZINE_UPDATED'
  | 'BRANCH_MAGAZINE_REMOVED'
```

- [ ] **Step 6: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add Branch, BranchMagazine types and updated AuditAction"
```

---

## Task 3: Seed Script — Pre-populate Branches

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Read the existing seed script**

Read `prisma/seed.ts` to understand the current structure. It creates admin/staff users and 8 magazines with sample receipts.

**IMPORTANT:** The existing seed script uses a `for...of` loop that creates magazines one at a time inside the loop body (storing each in a local `created` variable). It does NOT collect them into an array. You must refactor the magazine creation to collect all created magazine records into an array, so they can be referenced when assigning branches.

- [ ] **Step 2: Refactor magazine creation into an array**

Replace the existing magazine creation `for...of` loop (the one that creates magazines AND receipts in the same loop) with two separate steps. First, collect all created magazines into an array:

```typescript
// Create sample magazines — collect into array for branch assignment
const magazineData = [
  { name: 'The Economist', cadence: 'WEEKLY' as const, notes: 'International edition' },
  { name: 'Time Magazine', cadence: 'WEEKLY' as const },
  { name: 'National Geographic', cadence: 'MONTHLY' as const, notes: 'With maps supplement' },
  { name: 'Scientific American', cadence: 'MONTHLY' as const },
  { name: 'The New Yorker', cadence: 'WEEKLY' as const },
  { name: 'Consumer Reports', cadence: 'MONTHLY' as const },
  { name: 'Nature', cadence: 'WEEKLY' as const, notes: 'Academic journal' },
  { name: 'Wired', cadence: 'MONTHLY' as const },
]

const createdMagazines: Array<{ id: string; name: string; cadence: string }> = []
for (const mag of magazineData) {
  const created = await db.magazine.upsert({
    where: { id: mag.name },
    update: {},
    create: mag,
  }).catch(() => db.magazine.create({ data: mag }))
  createdMagazines.push({ id: created.id, name: created.name, cadence: created.cadence })
}
```

- [ ] **Step 3: Add branch seed data**

Add after the magazine creation block and before the receipt creation. Create the four branches:

```typescript
const branches = await Promise.all([
  db.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { name: 'Main Library', code: 'MAIN' },
  }),
  db.branch.upsert({
    where: { code: 'NORTH' },
    update: {},
    create: { name: 'North Edison Branch Library', code: 'NORTH' },
  }),
  db.branch.upsert({
    where: { code: 'CB' },
    update: {},
    create: { name: 'Clara Barton Branch Library', code: 'CB' },
  }),
  db.branch.upsert({
    where: { code: 'MOBILE' },
    update: {},
    create: { name: 'Bookmobile', code: 'MOBILE' },
  }),
])

const [main, north, cb, mobile] = branches
```

- [ ] **Step 4: Assign magazines to branches**

Main and North get all 8 magazines. CB gets 5 (skip Nature, Wired, Consumer Reports). Bookmobile gets 3 (Time, National Geographic, The New Yorker). Use `upsert` with the `@@unique([branchId, magazineId])` constraint:

```typescript
// Helper to assign magazine to branch
async function assignMagazine(branchId: string, magazineId: string, quantity = 1) {
  await db.branchMagazine.upsert({
    where: { branchId_magazineId: { branchId, magazineId } },
    update: { quantity },
    create: { branchId, magazineId, quantity },
  })
}

// Main Library: all magazines, qty 2 for weeklies, 1 for monthlies
for (const mag of createdMagazines) {
  const qty = mag.cadence === 'WEEKLY' ? 2 : 1
  await assignMagazine(main.id, mag.id, qty)
}

// North: all magazines, qty 1
for (const mag of createdMagazines) {
  await assignMagazine(north.id, mag.id, 1)
}

// CB: 5 magazines (skip Nature, Wired, Consumer Reports)
const cbMags = createdMagazines.filter(m => !['Nature', 'Wired', 'Consumer Reports'].includes(m.name))
for (const mag of cbMags) {
  await assignMagazine(cb.id, mag.id, 1)
}

// Bookmobile: 3 magazines
const mobileMags = createdMagazines.filter(m => ['Time Magazine', 'National Geographic', 'The New Yorker'].includes(m.name))
for (const mag of mobileMags) {
  await assignMagazine(mobile.id, mag.id, 1)
}
```

- [ ] **Step 5: Update receipt creation to include branchId**

Now create the receipt loop as a separate step (it was previously inside the magazine creation loop). Iterate over `createdMagazines` and add `branchId: main.id` to all seeded receipts:

```typescript
// Create sample receipts (all assigned to Main Library for seed data)
for (const mag of createdMagazines) {
  const cadence = mag.cadence
  const receiptCount = Math.floor(Math.random() * 3)
  for (let i = receiptCount; i >= 0; i--) {
    const daysAgo = i * (cadence === 'WEEKLY' ? 7 : 30) + Math.floor(Math.random() * 3)
    const receivedDate = new Date()
    receivedDate.setDate(receivedDate.getDate() - daysAgo)

    await db.issueReceipt.create({
      data: {
        magazineId: mag.id,
        receivedById: Math.random() > 0.5 ? admin.id : staff.id,
        branchId: main.id,
        receivedDate,
        notes: i === 0 ? null : 'Received in good condition',
      },
    }).catch(() => {})
  }
}
```

- [ ] **Step 6: Reset and reseed**

```bash
npx prisma migrate reset --force
```

Expected: Database is reset, migrations run, seed script runs successfully.

- [ ] **Step 7: Verify seed data**

```bash
npx prisma studio
```

Open in browser. Verify:
- 4 branches exist (MAIN, NORTH, CB, MOBILE)
- BranchMagazine table has the correct assignments (Main: 8, North: 8, CB: 5, Bookmobile: 3)
- IssueReceipts have branchId populated (all pointing to Main Library)

- [ ] **Step 8: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): add branch seed data with magazine assignments"
```

---

## Task 4: Branch API — GET /api/branches

**Files:**
- Create: `app/api/branches/route.ts`

- [ ] **Step 1: Create the branches route file**

Create `app/api/branches/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'

/**
 * GET /api/branches
 * Returns all active branches ordered by name. Requires any authenticated session.
 */
export async function GET(_request: NextRequest): Promise<Response> {
  try {
    await verifySession()
    const branches = await db.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true },
    })
    return Response.json(branches)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: Verify the route works**

Start the dev server (`npm run dev`) and test:

```bash
# Login first to get a session cookie, then:
curl -b cookies.txt http://localhost:3000/api/branches
```

Expected: JSON array of 4 branches.

- [ ] **Step 3: Commit**

```bash
git add app/api/branches/route.ts
git commit -m "feat(api): add GET /api/branches endpoint"
```

---

## Task 5: Branch Magazine API — Manage Subscriptions Per Branch

**Files:**
- Create: `app/api/branches/[id]/magazines/route.ts`
- Create: `app/api/branches/[id]/magazines/[magazineId]/route.ts`

- [ ] **Step 1: Create GET/POST for branch magazines**

Create `app/api/branches/[id]/magazines/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/branches/[id]/magazines
 * Returns all magazine subscriptions for a branch, including magazine details.
 * Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await verifySession()
    const { id } = await params

    const branch = await db.branch.findUnique({ where: { id } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const subscriptions = await db.branchMagazine.findMany({
      where: { branchId: id, active: true },
      include: {
        magazine: {
          select: { id: true, name: true, cadence: true, active: true, notes: true },
        },
      },
      orderBy: { magazine: { name: 'asc' } },
    })

    return Response.json(subscriptions)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

interface AddMagazineBody {
  magazineId: string
  quantity?: number
}

/**
 * POST /api/branches/[id]/magazines
 * Adds a magazine subscription to a branch. ADMIN only.
 * Body: { magazineId: string, quantity?: number }
 */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { magazineId, quantity = 1 } = (await request.json()) as AddMagazineBody

    if (!magazineId) {
      return Response.json({ error: 'magazineId is required' }, { status: 400 })
    }

    const branch = await db.branch.findUnique({ where: { id } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const magazine = await db.magazine.findUnique({ where: { id: magazineId } })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    const subscription = await db.branchMagazine.upsert({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      update: { active: true, quantity },
      create: { branchId: id, magazineId, quantity },
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_ADDED', {
      branchId: id,
      branchName: branch.name,
      magazineId,
      magazineName: magazine.name,
      quantity,
    })

    return Response.json(subscription, { status: 201 })
  } catch (err) {
    console.error('Add branch magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create PUT/DELETE for individual branch magazine**

Create `app/api/branches/[id]/magazines/[magazineId]/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string; magazineId: string }> }

interface UpdateSubscriptionBody {
  quantity?: number
  active?: boolean
}

/**
 * PUT /api/branches/[id]/magazines/[magazineId]
 * Updates quantity or active status of a branch magazine subscription. ADMIN only.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, magazineId } = await params
    const body = (await request.json()) as UpdateSubscriptionBody

    const validFields: { quantity?: number; active?: boolean } = {}
    if (body.quantity !== undefined) validFields.quantity = body.quantity
    if (body.active !== undefined) validFields.active = body.active

    const subscription = await db.branchMagazine.update({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      data: validFields,
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_UPDATED', {
      branchId: id,
      magazineId,
      changes: Object.keys(validFields).join(','),
    })

    return Response.json(subscription)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/branches/[id]/magazines/[magazineId]
 * Removes a magazine subscription from a branch (soft delete: sets active=false). ADMIN only.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, magazineId } = await params

    await db.branchMagazine.update({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      data: { active: false },
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_REMOVED', {
      branchId: id,
      magazineId,
    })

    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/branches/
git commit -m "feat(api): add branch magazine subscription CRUD endpoints"
```

---

## Task 6: Branch Cookie Helper — lib/branch.ts

**Files:**
- Create: `lib/branch.ts`

This small server utility reads the selected branch from a cookie. Used by dashboard and magazines pages.

- [ ] **Step 1: Create lib/branch.ts**

```typescript
import { cookies } from 'next/headers'
import db from './db'
import type { Branch } from '@/types'

const BRANCH_COOKIE = 'epl-active-branch'

/**
 * Reads the active branch ID from the cookie.
 * Returns null if no branch is selected or the cookie is missing.
 */
export async function getActiveBranchId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(BRANCH_COOKIE)?.value ?? null
}

/**
 * Returns all active branches from the database.
 * Used by server components that need the branch list (e.g., Sidebar).
 */
export async function getActiveBranches(): Promise<Branch[]> {
  const branches = await db.branch.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, active: true, createdAt: true },
  })
  return branches as Branch[]
}

/**
 * Resolves the active branch. If cookie is set and valid, returns that branch ID.
 * If cookie is missing or invalid, returns the first active branch ID (Main Library).
 */
export async function resolveActiveBranchId(): Promise<string> {
  const cookieBranchId = await getActiveBranchId()

  if (cookieBranchId) {
    const branch = await db.branch.findUnique({
      where: { id: cookieBranchId, active: true },
      select: { id: true },
    })
    if (branch) return branch.id
  }

  // Fallback: Main Library (code='MAIN'). If Main doesn't exist, fall back to any active branch.
  const fallback = await db.branch.findFirst({
    where: { active: true, code: 'MAIN' },
    select: { id: true },
  }) ?? await db.branch.findFirst({
    where: { active: true },
    select: { id: true },
  })

  if (!fallback) throw new Error('No active branches in database')
  return fallback.id
}

export { BRANCH_COOKIE }
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/branch.ts
git commit -m "feat(lib): add branch cookie helper for persistent branch selection"
```

---

## Task 7: BranchSelector Component

**Files:**
- Create: `components/BranchSelector.tsx`

This client component renders a dropdown of branches and sets a cookie when the user picks one.

- [ ] **Step 1: Create BranchSelector.tsx**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import type { Branch } from '@/types'

export interface BranchSelectorProps {
  branches: Branch[]
  activeBranchId: string
}

/**
 * Dropdown for selecting the active library branch.
 * Sets a cookie and refreshes the page so server components re-render with the new branch filter.
 */
export default function BranchSelector({ branches, activeBranchId }: BranchSelectorProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const branchId = e.target.value
    // Set cookie (365-day expiry, path=/)
    document.cookie = `epl-active-branch=${branchId};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`
    router.refresh()
  }

  const activeBranch = branches.find(b => b.id === activeBranchId)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <MapPin size={12} style={{ color: 'oklch(0.65 0.06 156)' }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(0.55 0.04 158)' }}
        >
          Branch
        </span>
      </div>
      <select
        value={activeBranchId}
        onChange={handleChange}
        className="w-full rounded-md border-0 text-sm font-medium py-1.5 px-2 cursor-pointer focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'oklch(0.28 0.05 158)',
          color: 'oklch(0.90 0.02 158)',
        }}
        title={`Current branch: ${activeBranch?.name ?? 'Unknown'}`}
      >
        {branches.map(branch => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/BranchSelector.tsx
git commit -m "feat(ui): add BranchSelector dropdown component"
```

---

## Task 8: Sidebar — Integrate BranchSelector

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `app/(dashboard)/layout.tsx`

The Sidebar is a client component. We need to pass branch data to it from the server layout.

- [ ] **Step 1: Read current Sidebar.tsx and dashboard layout.tsx**

Read both files fully to understand current props and structure.

- [ ] **Step 2: Update dashboard layout to fetch branches**

In `app/(dashboard)/layout.tsx`, import and call `getActiveBranches()` and `resolveActiveBranchId()` from `lib/branch.ts`. Pass `branches` and `activeBranchId` as new props to `<Sidebar>`:

```typescript
import { getActiveBranches, resolveActiveBranchId } from '@/lib/branch'

// Inside the layout component, alongside the existing getUser() call:
const [user, branches, activeBranchId] = await Promise.all([
  getUser(),
  getActiveBranches(),
  resolveActiveBranchId(),
])

// Update Sidebar usage:
<Sidebar user={user} branches={branches} activeBranchId={activeBranchId} />
```

- [ ] **Step 3: Update Sidebar props to accept branches**

In `components/Sidebar.tsx`, update the props interface:

```typescript
import type { AuthUser, Branch } from '@/types'
import BranchSelector from './BranchSelector'

interface SidebarProps {
  user: AuthUser
  branches: Branch[]
  activeBranchId: string
}
```

- [ ] **Step 4: Render BranchSelector in Sidebar**

Place the `BranchSelector` above the user info footer section (between the nav links and the user badge area). Add a subtle separator above it:

```tsx
{/* Branch Selector — above user section */}
<div
  className="border-t mt-auto"
  style={{ borderColor: 'oklch(0.30 0.04 158)' }}
>
  <BranchSelector branches={branches} activeBranchId={activeBranchId} />
</div>
```

Adjust the layout so the nav links take `flex-1` and push the branch selector + user footer to the bottom.

- [ ] **Step 5: Verify visually**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`. Verify:
- Branch dropdown appears in sidebar above user info
- Selecting a different branch refreshes the page
- Cookie `epl-active-branch` is set in browser dev tools

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx components/BranchSelector.tsx app/(dashboard)/layout.tsx
git commit -m "feat(ui): integrate BranchSelector into Sidebar with persistent cookie"
```

---

## Task 9: Dashboard — Branch-Filtered View

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Read current dashboard page**

Read `app/(dashboard)/dashboard/page.tsx` fully to understand the current query and rendering.

- [ ] **Step 2: Import branch helper and filter by branch**

Add imports and resolve the active branch at the top of the component:

```typescript
import { resolveActiveBranchId } from '@/lib/branch'

// Inside the component:
const activeBranchId = await resolveActiveBranchId()
```

- [ ] **Step 3: Update the magazines query to filter by branch subscription**

Replace the current "fetch all active magazines" query with one that only returns magazines subscribed at the active branch:

```typescript
// Get magazine IDs subscribed at this branch
const branchSubscriptions = await db.branchMagazine.findMany({
  where: { branchId: activeBranchId, active: true },
  select: { magazineId: true },
})
const subscribedMagazineIds = branchSubscriptions.map(s => s.magazineId)

// Fetch only those magazines
const magazines = await db.magazine.findMany({
  where: {
    id: { in: subscribedMagazineIds },
    active: true,
  },
  include: {
    receipts: {
      where: { branchId: activeBranchId },
      orderBy: { receivedDate: 'desc' },
      take: 1,
      include: { receivedBy: { select: { name: true } } },
    },
  },
})
```

The key change: `receipts` are now filtered by `branchId` so `lastReceivedDate` is branch-specific.

- [ ] **Step 4: Update the processing logic**

The processing loop that computes `lastReceivedDate`, `nextExpectedDate`, and `status` should remain the same — it already reads from `magazine.receipts[0]`, which now only contains branch-filtered receipts.

No changes needed to the processing logic itself.

- [ ] **Step 5: Verify visually**

```bash
npm run dev
```

Open dashboard, switch branches. Verify:
- Main/North show all 8 magazines
- CB shows 5 magazines
- Bookmobile shows 3 magazines
- Status badges reflect branch-specific receipt dates

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx
git commit -m "feat(dashboard): filter magazines and receipts by active branch"
```

---

## Task 10: Magazines List — Branch-Filtered + Total Issues Column

**Files:**
- Modify: `app/(dashboard)/magazines/page.tsx`

- [ ] **Step 1: Read current magazines page**

Read `app/(dashboard)/magazines/page.tsx` fully.

- [ ] **Step 2: Import branch helper and filter query**

Same pattern as dashboard — resolve active branch, get subscribed magazine IDs, filter query:

```typescript
import { resolveActiveBranchId } from '@/lib/branch'

// Inside component:
const activeBranchId = await resolveActiveBranchId()

const branchSubscriptions = await db.branchMagazine.findMany({
  where: { branchId: activeBranchId, active: true },
  select: { magazineId: true },
})
const subscribedMagazineIds = branchSubscriptions.map(s => s.magazineId)

// Update magazine query:
const magazines = await db.magazine.findMany({
  where: {
    id: { in: subscribedMagazineIds },
    active: true,
  },
  include: {
    receipts: {
      where: { branchId: activeBranchId },
      orderBy: { receivedDate: 'desc' },
      take: 1,
      include: { receivedBy: { select: { name: true } } },
    },
    _count: {
      select: {
        receipts: { where: { branchId: activeBranchId } },
      },
    },
  },
})
```

- [ ] **Step 3: Add "Total Issues" column to the table**

In the table header, add a new `<TableHead>` for "Total Issues" (between "Status" and "Last Received", or wherever makes sense in the existing column order).

In each table row, render the receipt count:

```tsx
<TableCell>
  <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
    {magazine._count.receipts}
  </span>
</TableCell>
```

- [ ] **Step 4: Verify visually**

Switch branches and verify the table only shows magazines subscribed at that branch, with correct "Total Issues" counts.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/magazines/page.tsx
git commit -m "feat(magazines): branch-filtered list with Total Issues column"
```

---

## Task 11: Receipts API — Branch-Aware

**Files:**
- Modify: `app/api/magazines/[id]/receipts/route.ts`

- [ ] **Step 1: Read current receipts route**

Read `app/api/magazines/[id]/receipts/route.ts`.

- [ ] **Step 2: Update GET to support branchId filter**

Add optional `branchId` query parameter to filter receipts:

```typescript
export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await verifySession()
    const { id } = await params
    const branchId = request.nextUrl.searchParams.get('branchId')

    const where: { magazineId: string; branchId?: string } = { magazineId: id }
    if (branchId) where.branchId = branchId

    const receipts = await db.issueReceipt.findMany({
      where,
      orderBy: { receivedDate: 'desc' },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    })
    return Response.json(receipts)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 3: Update POST to require branchId**

Add `branchId` to the request body. It should be required for new receipts:

```typescript
interface CreateReceiptBody {
  receivedDate: string
  branchId: string
  notes?: string
}

// Inside POST handler, after parsing body:
const { receivedDate, branchId, notes } = (await request.json()) as CreateReceiptBody

if (!receivedDate) {
  return Response.json({ error: 'receivedDate is required' }, { status: 400 })
}
if (!branchId) {
  return Response.json({ error: 'branchId is required' }, { status: 400 })
}

// Validate branch exists
const branch = await db.branch.findUnique({ where: { id: branchId } })
if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

// Add branchId to create data:
const receipt = await db.issueReceipt.create({
  data: {
    magazineId: id,
    receivedById: session.userId,
    branchId,
    receivedDate: new Date(receivedDate),
    notes: notes?.trim() || null,
  },
  include: {
    receivedBy: { select: { name: true } },
    branch: { select: { name: true, code: true } },
  },
})

// Update audit log to include branch:
auditLog(session.userId, 'RECEIPT_CREATED', {
  magazineId: id,
  magazineName: magazine.name,
  receiptId: receipt.id,
  branchId,
  branchName: branch.name,
  receivedDate,
})
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/magazines/[id]/receipts/route.ts
git commit -m "feat(api): make receipts branch-aware (branchId filter + required on create)"
```

---

## Task 12: MarkReceivedDialog — Send branchId

**Files:**
- Modify: `components/MarkReceivedDialog.tsx`
- Modify: `components/MagazineCard.tsx`
- Modify: `components/MagazineDetailActions.tsx`

The dialog needs to know the active branch ID to send it with the receipt creation request.

- [ ] **Step 1: Read MarkReceivedDialog.tsx, MagazineCard.tsx, MagazineDetailActions.tsx**

Read all three files.

- [ ] **Step 2: Add activeBranchId prop to MarkReceivedDialog**

Update the props interface:

```typescript
export interface MarkReceivedDialogProps {
  magazine: Pick<Magazine, 'id' | 'name'>
  activeBranchId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

In the `handleSubmit` function, include `branchId` in the POST body:

```typescript
const res = await fetch(`/api/magazines/${magazine.id}/receipts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    receivedDate: date,
    branchId: activeBranchId,
    notes: notes.trim() || undefined,
  }),
})
```

- [ ] **Step 3: Update MagazineCard to pass activeBranchId**

Add `activeBranchId: string` to `MagazineCard` props and pass it through to `MarkReceivedDialog`:

```tsx
<MarkReceivedDialog
  magazine={{ id: magazine.id, name: magazine.name }}
  activeBranchId={activeBranchId}
  open={dialogOpen}
  onOpenChange={setDialogOpen}
/>
```

- [ ] **Step 4: Update MagazineDetailActions to pass activeBranchId**

Same pattern — add `activeBranchId` to props and pass through:

```typescript
export interface MagazineDetailActionsProps {
  magazine: Pick<Magazine, 'id' | 'name'>
  activeBranchId: string
}
```

- [ ] **Step 5: Update dashboard page to pass activeBranchId to MagazineCard**

In `app/(dashboard)/dashboard/page.tsx`, pass `activeBranchId` as a prop to each `<MagazineCard>`.

- [ ] **Step 6: Update magazine detail page to pass activeBranchId to MagazineDetailActions**

In `app/(dashboard)/magazines/[id]/page.tsx`:

```typescript
import { resolveActiveBranchId } from '@/lib/branch'

// Inside component:
const activeBranchId = await resolveActiveBranchId()

// Pass to actions:
<MagazineDetailActions
  magazine={{ id: magazine.id, name: magazine.name }}
  activeBranchId={activeBranchId}
/>
```

- [ ] **Step 7: Verify Mark Received works**

Test on the dashboard and detail page. Open browser dev tools Network tab. Verify the POST to `/api/magazines/[id]/receipts` includes `branchId` in the request body.

- [ ] **Step 8: Commit**

```bash
git add components/MarkReceivedDialog.tsx components/MagazineCard.tsx components/MagazineDetailActions.tsx app/(dashboard)/dashboard/page.tsx app/(dashboard)/magazines/[id]/page.tsx
git commit -m "feat(ui): pass active branchId through Mark Received flow"
```

---

## Task 13: Magazine Detail — Branch-Filtered Receipts + Branch Column

**Files:**
- Modify: `app/(dashboard)/magazines/[id]/page.tsx`

- [ ] **Step 1: Read current detail page**

Already read in Task 12. Focus on the receipt history query and table.

- [ ] **Step 2: Filter receipts by active branch**

Update the query to filter receipts and include branch info:

```typescript
const activeBranchId = await resolveActiveBranchId()

const magazine = await db.magazine.findUnique({
  where: { id },
  include: {
    receipts: {
      where: { branchId: activeBranchId },
      orderBy: { receivedDate: 'desc' },
      include: {
        receivedBy: { select: { id: true, name: true } },
        branch: { select: { name: true, code: true } },
      },
    },
  },
})
```

- [ ] **Step 3: Update "Total Issues" label to reflect branch scope**

The stats grid shows `{magazine.receipts.length}` as "Total Issues." Since receipts are now branch-filtered, update the label to clarify:

```tsx
<p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'oklch(0.55 0.030 72)' }}>
  Issues at Branch
</p>
```

- [ ] **Step 4: Add Branch column to receipt history table**

Add a "Branch" column header and cell to the receipt table:

```tsx
// In TableHeader:
<TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Branch</TableHead>

// In TableBody row:
<TableCell>
  <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
    {receipt.branch?.name ?? '—'}
  </span>
</TableCell>
```

- [ ] **Step 5: Verify visually**

Navigate to a magazine detail page. Switch branches. Verify receipt history changes and "Issues at Branch" label is correct.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/magazines/[id]/page.tsx
git commit -m "feat(ui): branch-filtered receipt history with Branch column on detail page"
```

---

## Task 14: MagazinesClientControls — Pass branchId to RowActions

**Files:**
- Modify: `components/MagazinesClientControls.tsx`

- [ ] **Step 1: Read MagazinesClientControls.tsx**

Read the file to understand the RowActions mode.

- [ ] **Step 2: Add activeBranchId to RowActionsMode type and RowActions internal component**

The component uses a discriminated union for props. Three changes are needed:

**a) Update the `RowActionsMode` type** to include `activeBranchId`:

```typescript
type RowActionsMode = {
  mode: 'row-actions'
  magazineId: string
  magazine: MagazineWithStatus
  activeBranchId: string
  currentFilter?: never
}
```

**b) Update the `RowActions` internal function component** to accept and pass `activeBranchId`:

```typescript
function RowActions({ magazine, activeBranchId }: { magazine: MagazineWithStatus; activeBranchId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setDialogOpen(true)}
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        <CalendarCheck size={12} /> Received
      </Button>
      <MarkReceivedDialog
        magazine={magazine}
        activeBranchId={activeBranchId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
```

**c) Update the main component's dispatch** to pass `activeBranchId` through:

```typescript
export default function MagazinesClientControls(props: MagazinesClientControlsProps) {
  if (props.mode === 'row-actions') {
    return <RowActions magazine={props.magazine} activeBranchId={props.activeBranchId} />
  }
  return <FilterBar currentFilter={props.currentFilter} />
}
```

- [ ] **Step 3: Update magazines page to pass activeBranchId to RowActions**

In `app/(dashboard)/magazines/page.tsx`, pass `activeBranchId` to the `<MagazinesClientControls mode="row-actions">` component.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/MagazinesClientControls.tsx app/(dashboard)/magazines/page.tsx
git commit -m "feat(ui): pass activeBranchId through MagazinesClientControls row actions"
```

---

## Task 15: Final Verification & Cleanup

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: Successful build with no errors.

- [ ] **Step 3: Manual smoke test**

Start dev server and test the following flow:

1. Login as admin
2. Dashboard shows magazines filtered by Main Library (default)
3. Switch to "Bookmobile" in sidebar → dashboard shows only 3 magazines
4. Navigate to Magazines list → filtered by Bookmobile, "Total Issues" column visible
5. Click "Mark Received" on a magazine → receipt is created with Bookmobile branch
6. Navigate to magazine detail → receipt history shows Branch column, filtered by Bookmobile
7. Switch back to Main Library → all 8 magazines visible, receipts are Main-only
8. Login as staff → same branch filter behavior, no admin routes accessible

- [ ] **Step 4: Reset seed and verify from scratch**

```bash
npx prisma migrate reset --force
npm run dev
```

Verify seed data is correct: 4 branches, magazine assignments, receipts with branchId.

- [ ] **Step 5: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore: final cleanup for multi-branch support"
```

---

## Summary of All Changes

| Area | Files Changed | What Changed |
|------|--------------|--------------|
| **Database** | `prisma/schema.prisma` | +Branch, +BranchMagazine models, +branchId on IssueReceipt |
| **Types** | `types/index.ts` | +Branch, +BranchMagazine, +BranchCode types, updated IssueReceipt/ReceiptWithReceiver/AuditAction |
| **Seed** | `prisma/seed.ts` | +4 branches, +magazine-branch assignments, +branchId on receipts |
| **API** | `app/api/branches/route.ts` | NEW: GET branches |
| **API** | `app/api/branches/[id]/magazines/route.ts` | NEW: GET/POST branch magazine subscriptions |
| **API** | `app/api/branches/[id]/magazines/[magazineId]/route.ts` | NEW: PUT/DELETE branch magazine subscriptions |
| **API** | `app/api/magazines/[id]/receipts/route.ts` | GET: +branchId filter; POST: +branchId required |
| **Lib** | `lib/branch.ts` | NEW: branch cookie helpers |
| **UI** | `components/BranchSelector.tsx` | NEW: branch dropdown component |
| **UI** | `components/Sidebar.tsx` | +BranchSelector integration |
| **UI** | `components/MarkReceivedDialog.tsx` | +activeBranchId prop, sent in POST |
| **UI** | `components/MagazineCard.tsx` | +activeBranchId prop passthrough |
| **UI** | `components/MagazineDetailActions.tsx` | +activeBranchId prop passthrough |
| **UI** | `components/MagazinesClientControls.tsx` | +activeBranchId prop for row actions |
| **Pages** | `app/(dashboard)/layout.tsx` | Fetches branches, passes to Sidebar |
| **Pages** | `app/(dashboard)/dashboard/page.tsx` | Branch-filtered magazine query |
| **Pages** | `app/(dashboard)/magazines/page.tsx` | Branch-filtered query + Total Issues column |
| **Pages** | `app/(dashboard)/magazines/[id]/page.tsx` | Branch-filtered receipts + Branch column |
