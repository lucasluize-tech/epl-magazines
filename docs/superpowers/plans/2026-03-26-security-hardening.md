# Security Hardening & Magazine Soft-Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix fragile API auth pattern, add Zod runtime validation, convert magazine delete to soft-delete, and improve error handling across all API routes.

**Architecture:** Add `verifySessionForApi()` to `lib/dal.ts` that returns `null` instead of throwing `redirect()`. Create `lib/validations.ts` with shared Zod schemas for all API input. Refactor each API route to use both. Remove magazine hard-delete in favor of the existing `active: false` toggle. Enhance the admin toggle UI with tooltips.

**Tech Stack:** Zod, Next.js App Router API routes, Base UI Tooltip/Switch components

**Spec:** `/home/lucasluize/.claude/plans/logical-yawning-cupcake.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/dal.ts` | Modify | Add `verifySessionForApi()` |
| `lib/validations.ts` | Create | Shared Zod schemas for all API input |
| `package.json` | Modify | Add `zod` dependency |
| `app/api/auth/logout/route.ts` | Modify | Add `console.error` to catch block (do NOT swap auth — logout must handle missing sessions gracefully) |
| `app/api/branches/route.ts` | Modify | Swap auth + fix catch |
| `app/api/branches/[id]/magazines/route.ts` | Modify | Swap auth + Zod quantity |
| `app/api/branches/[id]/magazines/[magazineId]/route.ts` | Modify | Swap auth + Zod quantity |
| `app/api/magazines/route.ts` | Modify | Swap auth + Zod, remove isCadenceType |
| `app/api/magazines/[id]/route.ts` | Modify | Swap auth + Zod, remove DELETE handler |
| `app/api/magazines/[id]/receipts/route.ts` | Modify | Swap auth + Zod receivedDate |
| `app/api/transfers/route.ts` | Modify | Swap auth + Zod quantity |
| `app/api/transfers/[id]/cancel/route.ts` | Modify | Swap auth |
| `app/api/transfers/[id]/complete/route.ts` | Modify | Swap auth |
| `app/api/users/route.ts` | Modify | Swap auth + fix catch |
| `app/api/users/[id]/route.ts` | Modify | Swap auth + Zod role |
| `app/api/users/profile/route.ts` | Modify | Swap auth + fix catch |
| `components/AdminMagazinesClient.tsx` | Modify | Remove delete-entirely flow, enhance toggle with tooltip |
| `components/AdminMagazineDeleteDialog.tsx` | Delete | No longer needed |

---

## Task 1: Install Zod and create foundation files

**Files:**
- Modify: `package.json`
- Create: `lib/validations.ts`
- Modify: `lib/dal.ts`

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Add `verifySessionForApi()` to `lib/dal.ts`**

Add after the existing `verifySession` function (after line 24), before `getUser`:

```ts
/**
 * Verifies the current session cookie for API route handlers.
 * Returns `null` instead of redirecting — API routes must handle 401 explicitly.
 * Cached per request via React's `cache()`.
 */
export const verifySessionForApi = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    return null
  }

  return { userId: session.userId as string, role: session.role }
})
```

- [ ] **Step 3: Create `lib/validations.ts`**

```ts
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

/** Valid cadence values — must match the Prisma Cadence enum and CadenceType */
export const cadenceSchema = z.enum([
  'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'BI_MONTHLY', 'SEASONAL', 'YEARLY',
])

/** Valid user roles — must match the Prisma Role enum */
export const roleSchema = z.enum(['ADMIN', 'STAFF'])

/** Positive integer quantity (1–100) */
export const quantitySchema = z.number().int().min(1).max(100)

/** ISO date string that parses to a valid Date */
export const dateStringSchema = z.string().refine(
  (val) => !isNaN(new Date(val).getTime()),
  { message: 'Invalid date format' }
)

// ---------------------------------------------------------------------------
// Magazine schemas
// ---------------------------------------------------------------------------

/** POST /api/magazines — create a new magazine */
export const createMagazineSchema = z.object({
  name: z.string().min(1, 'Name is required').transform((s) => s.trim()),
  cadence: cadenceSchema,
  language: z.string().optional(),
  notes: z.string().optional(),
})

/** PUT /api/magazines/[id] — partial update */
export const updateMagazineSchema = z.object({
  name: z.string().min(1).transform((s) => s.trim()).optional(),
  cadence: cadenceSchema.optional(),
  language: z.string().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Receipt schemas
// ---------------------------------------------------------------------------

/** POST /api/magazines/[id]/receipts — create a receipt */
export const createReceiptSchema = z.object({
  receivedDate: dateStringSchema,
  branchId: z.string().min(1, 'branchId is required'),
  notes: z.string().optional(),
})

/** PUT /api/magazines/[id]/receipts — update last receipt date */
export const updateReceiptSchema = z.object({
  receivedDate: dateStringSchema,
  branchId: z.string().min(1, 'branchId is required'),
})

// ---------------------------------------------------------------------------
// Transfer schemas
// ---------------------------------------------------------------------------

/** POST /api/transfers — initiate a transfer */
export const createTransferSchema = z.object({
  magazineId: z.string().min(1, 'magazineId is required'),
  toBranchId: z.string().min(1, 'toBranchId is required'),
  quantity: quantitySchema,
})

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------

/** PUT /api/users/[id] — admin update user */
export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: roleSchema.optional(),
})

// ---------------------------------------------------------------------------
// Branch magazine schemas
// ---------------------------------------------------------------------------

/** POST /api/branches/[id]/magazines — add subscription */
export const addBranchMagazineSchema = z.object({
  magazineId: z.string().min(1, 'magazineId is required'),
  quantity: quantitySchema.optional().default(1),
})

/** PUT /api/branches/[id]/magazines/[magazineId] — update subscription */
export const updateBranchMagazineSchema = z.object({
  quantity: quantitySchema.optional(),
  active: z.boolean().optional(),
})
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/dal.ts lib/validations.ts package.json package-lock.json
git commit -m "feat: add verifySessionForApi and Zod validation schemas"
```

---

## Task 2: Refactor magazine routes (auth + Zod + remove DELETE)

**Files:**
- Modify: `app/api/magazines/route.ts`
- Modify: `app/api/magazines/[id]/route.ts`

- [ ] **Step 1: Rewrite `app/api/magazines/route.ts`**

Replace the entire file:

```ts
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createMagazineSchema } from '@/lib/validations'

/**
 * GET /api/magazines
 * Returns all active magazines ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const magazines = await db.magazine.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
    return Response.json(magazines)
  } catch (err) {
    console.error('List magazines error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/magazines
 * Creates a new magazine. ADMIN only. Body: { name, cadence, language?, notes? }.
 * Returns 201 with the created magazine, or 400/403 on validation/auth failure.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const parsed = createMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { name, cadence, language, notes } = parsed.data

    /** Normalize language: "hindi" → "Hindi", "GUJARATI" → "Gujarati" */
    const normalizedLanguage = language?.trim()
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : 'English'

    const magazine = await withRetry(() => db.magazine.create({
      data: { name, cadence, language: normalizedLanguage, notes: notes?.trim() || null },
    }))

    auditLog(session.userId, 'MAGAZINE_CREATED', { name: magazine.name })
    return Response.json(magazine, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Rewrite `app/api/magazines/[id]/route.ts`** (remove DELETE, add Zod to PUT)

Replace the entire file:

```ts
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { updateMagazineSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/magazines/[id]
 * Returns a single magazine by ID. Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(magazine)
  } catch (err) {
    console.error('Get magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/magazines/[id]
 * Updates name, cadence, language, notes, and/or active status. ADMIN only.
 * Setting active to false is the soft-delete mechanism (replaces hard DELETE).
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const validFields: Record<string, unknown> = {}
    const data = parsed.data
    if (data.name !== undefined) validFields.name = data.name
    if (data.cadence !== undefined) validFields.cadence = data.cadence
    if (data.language !== undefined) {
      const lang = data.language.trim()
      validFields.language = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase()
    }
    if (data.notes !== undefined) validFields.notes = data.notes?.trim() || null
    if (data.active !== undefined) validFields.active = data.active

    const before = await db.magazine.findUnique({ where: { id } })
    if (!before) return Response.json({ error: 'Not found' }, { status: 404 })

    const magazine = await withRetry(() => db.magazine.update({ where: { id }, data: validFields }))

    // Build "field: old → new" for only the fields that actually changed
    const changes = Object.entries(validFields)
      .filter(([k]) => String(before[k as keyof typeof before]) !== String(validFields[k]))
      .map(([k, v]) => `${k}: ${before[k as keyof typeof before]} → ${v}`)
      .join(', ')

    auditLog(session.userId, 'MAGAZINE_UPDATED', { magazineName: before.name, changes: changes || 'no changes' })
    return Response.json(magazine)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/magazines/route.ts app/api/magazines/\[id\]/route.ts
git commit -m "feat: magazines routes — Zod validation, verifySessionForApi, remove hard delete"
```

---

## Task 3: Refactor receipts route (auth + Zod date validation)

**Files:**
- Modify: `app/api/magazines/[id]/receipts/route.ts`

- [ ] **Step 1: Rewrite `app/api/magazines/[id]/receipts/route.ts`**

Replace the entire file. Key changes: `verifySessionForApi`, Zod for `createReceiptSchema`/`updateReceiptSchema`, `console.error` in catch blocks.

```ts
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createReceiptSchema, updateReceiptSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/magazines/[id]/receipts
 * Returns all receipts for a magazine, newest first. Requires any authenticated session.
 * Optionally filters by branchId query parameter.
 */
export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
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
  } catch (err) {
    console.error('List receipts error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/magazines/[id]/receipts
 * Records a new receipt for a magazine. Requires any authenticated session.
 * Body: { receivedDate: ISO string, branchId: string, notes?: string }.
 */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = createReceiptSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { receivedDate, branchId, notes } = parsed.data

    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    const branch = await db.branch.findUnique({ where: { id: branchId } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const receipt = await withRetry(() => db.issueReceipt.create({
      data: {
        magazineId: id,
        receivedById: session.userId,
        receivedDate: new Date(receivedDate),
        branchId,
        notes: notes?.trim() || null,
      },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    auditLog(session.userId, 'RECEIPT_CREATED', {
      magazineName: magazine.name,
      receivedDate: receivedDate.split('T')[0],
      branchName: branch.name,
    })

    return Response.json(receipt, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/magazines/[id]/receipts
 * Updates the most recent receipt's receivedDate for a magazine at a branch.
 * Admin only. Body: { receivedDate: date string, branchId: string }.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateReceiptSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { receivedDate, branchId } = parsed.data

    const lastReceipt = await db.issueReceipt.findFirst({
      where: { magazineId: id, branchId },
      orderBy: { receivedDate: 'desc' },
    })

    if (!lastReceipt) {
      return Response.json({ error: 'No receipt found to update' }, { status: 404 })
    }

    const magazine = await db.magazine.findUnique({ where: { id } })

    const updated = await withRetry(() => db.issueReceipt.update({
      where: { id: lastReceipt.id },
      data: { receivedDate: new Date(receivedDate) },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    const oldDate = lastReceipt.receivedDate.toISOString().split('T')[0]
    const newDate = receivedDate.split('T')[0]
    auditLog(session.userId, 'RECEIPT_EDITED', {
      magazineName: magazine?.name,
      changes: `receivedDate: ${oldDate} → ${newDate}`,
    })

    return Response.json(updated)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/magazines/\[id\]/receipts/route.ts
git commit -m "feat: receipts route — Zod date validation, verifySessionForApi"
```

---

## Task 4: Refactor transfer routes (auth + Zod quantity)

**Files:**
- Modify: `app/api/transfers/route.ts`
- Modify: `app/api/transfers/[id]/cancel/route.ts`
- Modify: `app/api/transfers/[id]/complete/route.ts`

- [ ] **Step 1: Update `app/api/transfers/route.ts`**

Replace imports and modify GET/POST. Key changes: swap `verifySession` → `verifySessionForApi`, use `createTransferSchema` in POST, fix GET catch block.

In the imports, replace:
```ts
import { verifySession } from '@/lib/dal'
```
with:
```ts
import { verifySessionForApi } from '@/lib/dal'
import { createTransferSchema } from '@/lib/validations'
```

Remove the `InitiateTransferBody` interface (lines 8-12).

Replace the GET function (lines 19-48):
```ts
export async function GET(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const branchId = searchParams.get('branchId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (branchId) {
      where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }]
    }

    const transfers = await db.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        magazine: { select: { name: true } },
        fromBranch: { select: { name: true, code: true } },
        toBranch: { select: { name: true, code: true } },
        initiatedBy: { select: { name: true } },
        completedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
      },
    })

    return Response.json(transfers)
  } catch (err) {
    console.error('List transfers error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

Replace the POST function (lines 57-144). Change the body parsing from manual validation to Zod:
```ts
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const fromBranchId = await resolveActiveBranchId()
    const body = await request.json()
    const parsed = createTransferSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { magazineId, toBranchId, quantity } = parsed.data

    if (fromBranchId === toBranchId) {
      return Response.json({ error: 'Cannot transfer to the same branch' }, { status: 400 })
    }

    // ... rest of POST body stays the same from line 74 onwards (the Promise.all lookup, senderSub check, transaction, auditLog, return)
```

The rest of the POST function body (from `const [magazine, fromBranch, toBranch]` through the end) stays the same.

- [ ] **Step 2: Update `app/api/transfers/[id]/cancel/route.ts`**

Replace `import { verifySession } from '@/lib/dal'` with `import { verifySessionForApi } from '@/lib/dal'`.

Replace the first 3 lines of the PUT function body:
```ts
export async function PUT(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ... rest stays the same from line 21 onwards
```

Remove the outer `try/catch` wrapping the auth check — move the try to start after the auth/role check. The existing try/catch for the DB operations (lines 37-91) stays.

- [ ] **Step 3: Update `app/api/transfers/[id]/complete/route.ts`**

Same pattern: replace `verifySession` import with `verifySessionForApi`, move auth outside try/catch:

```ts
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const activeBranchId = await resolveActiveBranchId()
    // ... rest stays the same
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/transfers/
git commit -m "feat: transfer routes — Zod validation, verifySessionForApi"
```

---

## Task 5: Refactor branch magazine routes (auth + Zod quantity)

**Files:**
- Modify: `app/api/branches/route.ts`
- Modify: `app/api/branches/[id]/magazines/route.ts`
- Modify: `app/api/branches/[id]/magazines/[magazineId]/route.ts`

- [ ] **Step 1: Update `app/api/branches/route.ts`**

Replace with:
```ts
import db from '@/lib/db'
import { verifySessionForApi } from '@/lib/dal'

/**
 * GET /api/branches
 * Returns all active branches ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const branches = await db.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true },
    })
    return Response.json(branches)
  } catch (err) {
    console.error('List branches error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Update `app/api/branches/[id]/magazines/route.ts`**

Replace imports, remove `AddMagazineBody` interface, use Zod in POST. Swap auth pattern in both GET and POST. The GET function follows the same pattern as branches/route.ts. The POST uses `addBranchMagazineSchema`.

Key import changes:
```ts
import { verifySessionForApi } from '@/lib/dal'
import { addBranchMagazineSchema } from '@/lib/validations'
```

GET — move auth outside try/catch, fix bare catch:
```ts
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // ... existing body (lines 17-31 unchanged)
  } catch (err) {
    console.error('List branch magazines error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

POST — use Zod:
```ts
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = addBranchMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { magazineId, quantity } = parsed.data
    // ... rest stays the same from the branch/magazine lookups (line 62) onwards
```

- [ ] **Step 3: Update `app/api/branches/[id]/magazines/[magazineId]/route.ts`**

Replace imports, remove `UpdateSubscriptionBody` interface, use Zod in PUT. Import changes:
```ts
import { verifySessionForApi } from '@/lib/dal'
import { updateBranchMagazineSchema } from '@/lib/validations'
```

PUT — use Zod for quantity validation:
```ts
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, magazineId } = await params
    const body = await request.json()
    const parsed = updateBranchMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const validFields = parsed.data
    // ... rest stays the same from the before lookup (line 33) onwards
```

DELETE — swap auth only:
```ts
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // ... rest stays the same from line 79 onwards
```

Add `console.error` to catch blocks that don't already have it.

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/branches/
git commit -m "feat: branch routes — Zod quantity validation, verifySessionForApi"
```

---

## Task 6: Refactor user routes (auth + Zod role)

**Files:**
- Modify: `app/api/users/route.ts`
- Modify: `app/api/users/[id]/route.ts`
- Modify: `app/api/users/profile/route.ts`

- [ ] **Step 1: Update `app/api/users/route.ts`**

Replace `verifySession` with `verifySessionForApi`. Fix GET catch block (currently bare catch → 401). POST stays similar but uses `verifySessionForApi`.

- [ ] **Step 2: Update `app/api/users/[id]/route.ts`**

Replace `verifySession` with `verifySessionForApi`. Add Zod validation for the PUT body:

```ts
import { verifySessionForApi } from '@/lib/dal'
import { updateUserSchema } from '@/lib/validations'
```

In PUT, replace body parsing:
```ts
const body = await request.json()
const parsed = updateUserSchema.safeParse(body)
if (!parsed.success) {
  return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
}
const validFields = parsed.data
```

Add `console.error` to catch blocks that don't have it.

- [ ] **Step 3: Update `app/api/users/profile/route.ts`**

Replace `verifySession` with `verifySessionForApi`. Fix the bare catch block (currently swallows everything silently):

```ts
export async function PUT(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // ... existing body unchanged
  } catch (err) {
    console.error('Update profile error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Update `app/api/auth/logout/route.ts`**

Do NOT swap auth — logout intentionally handles missing/invalid sessions. Only fix the bare catch block:

```ts
  } catch (err) {
    console.error('Logout error:', err)
    return Response.json({ success: true })
  }
```

- [ ] **Step 5: Verify types**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/api/users/ app/api/auth/
git commit -m "feat: user routes — Zod role validation, verifySessionForApi, fix catch blocks"
```

---

## Task 7: Magazine soft-delete UI changes

**Files:**
- Modify: `components/AdminMagazinesClient.tsx`
- Delete: `components/AdminMagazineDeleteDialog.tsx`

**Context:** The admin magazines table has a Switch toggle for active/inactive status per branch subscription. The delete button currently opens `AdminMagazineDeleteDialog` with two options: "Remove from branch" and "Delete entirely". We're removing "Delete entirely" and converting the delete button to just "Remove from branch" directly (with a confirm dialog). The Switch toggle gets enhanced with tooltip showing "Activate"/"Deactivate" and hover effects.

- [ ] **Step 1: Update `AdminMagazinesClient.tsx`**

Key changes:
1. Remove import of `AdminMagazineDeleteDialog`
2. Remove `deleteEntirely` function
3. Remove `deleteTarget` state
4. Replace `AdminMagazineDeleteDialog` with `DeleteConfirmDialog` (already exists at `components/DeleteConfirmDialog.tsx`) for "Remove from branch" confirmation
5. Remove the `AdminMagazineDeleteDialog` render at the bottom
6. Wrap the Switch in a Tooltip showing "Activate" or "Deactivate"
7. Add hover glow/shadow + cursor-pointer to the Switch wrapper

Replace the Switch cell (line 180-185) with:
```tsx
<TableCell>
  <Tooltip>
    <TooltipTrigger render={<div className="inline-flex" />}>
      <div
        className="inline-flex cursor-pointer rounded-full transition-shadow hover:shadow-[0_0_8px_oklch(0.38_0.082_156_/_0.4)]"
        onClick={() => !togglingId && toggleActive(sub)}
      >
        <Switch
          checked={sub.active}
          onCheckedChange={() => toggleActive(sub)}
          disabled={togglingId === sub.id}
        />
      </div>
    </TooltipTrigger>
    <TooltipContent>{sub.active ? 'Deactivate' : 'Activate'}</TooltipContent>
  </Tooltip>
</TableCell>
```

Replace the delete Tooltip button (lines 221-235). Instead of opening `AdminMagazineDeleteDialog`, the Trash2 button opens `DeleteConfirmDialog` (already exists at `components/DeleteConfirmDialog.tsx`):
```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => setDeleteTarget(sub)}
      />
    }
  >
    <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
  </TooltipTrigger>
  <TooltipContent>Remove from branch</TooltipContent>
</Tooltip>
```

Replace the `AdminMagazineDeleteDialog` render block (lines 268-276) with `DeleteConfirmDialog`:
```tsx
{deleteTarget && (
  <DeleteConfirmDialog
    open={!!deleteTarget}
    onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
    title={`Remove "${deleteTarget.magazine.name}"?`}
    description="This will remove the magazine subscription from this branch. Receipt history is preserved."
    confirmLabel="Remove"
    loadingLabel="Removing…"
    onConfirm={() => removeFromBranch(deleteTarget)}
  />
)}
```

Remove:
- `deleteEntirely` function (lines 68-78)
- `AdminMagazineDeleteDialog` import (line 19) — replace with `import DeleteConfirmDialog from './DeleteConfirmDialog'`
- Keep `deleteTarget` state — it's still used for the `DeleteConfirmDialog`

- [ ] **Step 2: Delete `components/AdminMagazineDeleteDialog.tsx`**

```bash
rm components/AdminMagazineDeleteDialog.tsx
```

- [ ] **Step 3: Verify types and no broken imports**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test in browser**

Start dev server, navigate to Admin > Magazines:
- Toggle switch should show "Activate"/"Deactivate" tooltip on hover
- Toggle should have subtle green glow on hover
- Delete button should show "Remove from branch" tooltip and open a styled DeleteConfirmDialog
- No "Delete entirely" option anywhere

- [ ] **Step 5: Commit**

```bash
git add components/AdminMagazinesClient.tsx
git rm components/AdminMagazineDeleteDialog.tsx
git commit -m "feat: magazine soft-delete — remove hard delete, enhance toggle with tooltip"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Check no remaining references to old patterns**

Verify no remaining `verifySession` imports in API routes (should only be in `lib/dal.ts` and Server Components):

```bash
grep -r "from '@/lib/dal'" app/api/ --include="*.ts" | grep -v verifySessionForApi
```

Expected: no results (all API routes now use `verifySessionForApi`).

Verify no remaining `isCadenceType` or `VALID_CADENCES`:

```bash
grep -r "isCadenceType\|VALID_CADENCES" app/ --include="*.ts"
```

Expected: no results.

- [ ] **Step 3: Commit any remaining changes**

If all clean, no commit needed. Otherwise fix and commit.
