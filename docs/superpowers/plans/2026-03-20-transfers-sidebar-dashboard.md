# Transfers, Sidebar, and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branch-to-branch magazine transfers, collapsible sidebar, and dashboard simplification (2 buckets + transfer cards).

**Architecture:** New `Transfer` model with PENDING/COMPLETED/CANCELLED lifecycle. Transfer initiation decrements sender quantity atomically; completion creates an IssueReceipt and increments receiver quantity. Dashboard drops to 2 buckets (Expected This Week using calendar week Sun–Sat, Overdue) with pending transfer cards that suppress subscription cards. Sidebar gains cookie-persisted collapse.

**Tech Stack:** Next.js 16 (App Router), Prisma v7 + SQLite, shadcn/ui, Tailwind CSS, date-fns, lucide-react, jose sessions, Winston audit logging.

**Spec:** `docs/superpowers/specs/2026-03-20-transfers-sidebar-dashboard-design.md`

**Note:** No test framework is installed. Verification steps use `curl` and the dev server UI. If a test framework is added later, these become integration test candidates.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `prisma/migrations/<timestamp>_add_transfers/migration.sql` | Schema migration for Transfer model |
| `app/api/transfers/route.ts` | `POST` initiate, `GET` list transfers |
| `app/api/transfers/[id]/complete/route.ts` | `PUT` complete a pending transfer |
| `app/api/transfers/[id]/cancel/route.ts` | `PUT` cancel a pending transfer |
| `components/TransferDialog.tsx` | Shared dialog: pick destination branch + quantity |
| `components/TransferCard.tsx` | Dashboard card for a pending incoming transfer |
| `app/(dashboard)/admin/transfers/page.tsx` | Admin transfers management page (server component) |
| `components/AdminTransfersClient.tsx` | Client component for admin transfers table |

### Modified files
| File | Changes |
|---|---|
| `prisma/schema.prisma` | Add `TransferStatus` enum, `Transfer` model, reverse relations on User/Magazine/Branch |
| `types/index.ts` | Add `TransferStatus`, `Transfer`, `TransferWithDetails`, new `AuditAction` values |
| `lib/cadence.ts` | Change `isExpectedThisWeek` from rolling +7 to Sun–Sat calendar week |
| `components/Sidebar.tsx` | Add collapse toggle, cookie persistence, icon-only mode, "Transfers" admin nav item |
| `app/(dashboard)/layout.tsx` | Read sidebar cookie, pass to Sidebar; animate main content margin |
| `app/(dashboard)/dashboard/page.tsx` | 2 buckets, dynamic title, fetch pending transfers, suppression rule, transfer cards |
| `app/(dashboard)/magazines/page.tsx` | Magazine name becomes `<Link>`, replace History button with Transfer button, fetch branches + quantities for TransferDialog |
| `components/MagazinesClientControls.tsx` | Add `'transfer'` row-action mode with TransferDialog |
| `components/AdminMagazinesClient.tsx` | Swap Notes/Status columns, rename "Total Issues" → "Total Deliveries", add transfer send button |

---

## Task 1: Prisma Schema — Transfer Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add TransferStatus enum and Transfer model**

Add after the `Cadence` enum:

```prisma
enum TransferStatus {
  PENDING
  COMPLETED
  CANCELLED
}

model Transfer {
  id             String         @id @default(cuid())
  magazine       Magazine       @relation(fields: [magazineId], references: [id])
  magazineId     String
  fromBranch     Branch         @relation("TransferFrom", fields: [fromBranchId], references: [id])
  fromBranchId   String
  toBranch       Branch         @relation("TransferTo", fields: [toBranchId], references: [id])
  toBranchId     String
  quantity       Int
  status         TransferStatus @default(PENDING)
  initiatedBy    User           @relation("TransferInitiated", fields: [initiatedById], references: [id])
  initiatedById  String
  completedBy    User?          @relation("TransferCompleted", fields: [completedById], references: [id])
  completedById  String?
  cancelledBy    User?          @relation("TransferCancelled", fields: [cancelledById], references: [id])
  cancelledById  String?
  createdAt      DateTime       @default(now())
  completedAt    DateTime?
  cancelledAt    DateTime?
}
```

- [ ] **Step 2: Add reverse relations to existing models**

In the `User` model, add after `receipts`:
```prisma
  transfersInitiated  Transfer[] @relation("TransferInitiated")
  transfersCompleted  Transfer[] @relation("TransferCompleted")
  transfersCancelled  Transfer[] @relation("TransferCancelled")
```

In the `Magazine` model, add after `branches`:
```prisma
  transfers Transfer[]
```

In the `Branch` model, add after `receipts`:
```prisma
  transfersFrom Transfer[] @relation("TransferFrom")
  transfersTo   Transfer[] @relation("TransferTo")
```

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name add_transfers
```

Expected: Migration created, Prisma client regenerated. No errors.

- [ ] **Step 4: Verify the generated client has Transfer type**

```bash
grep -r "Transfer" generated/prisma/index.d.ts | head -5
```

Expected: Shows `Transfer`, `TransferStatus`, `TransferCreateInput` etc.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Transfer model and TransferStatus enum"
```

---

## Task 2: Domain Types — Transfer Types and Audit Actions

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add TransferStatus type and Transfer interface**

Add after the `BranchMagazine` interface (around line 133):

```ts
// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

/** Transfer lifecycle status */
export type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

/** Raw transfer record from the database */
export interface Transfer {
  id: string
  magazineId: string
  fromBranchId: string
  toBranchId: string
  quantity: number
  status: TransferStatus
  initiatedById: string
  completedById: string | null
  cancelledById: string | null
  createdAt: Date
  completedAt: Date | null
  cancelledAt: Date | null
}

/** Transfer enriched with related names for display */
export interface TransferWithDetails extends Transfer {
  magazine: { name: string }
  fromBranch: { name: string; code: BranchCode }
  toBranch: { name: string; code: BranchCode }
  initiatedBy: { name: string }
  completedBy: { name: string } | null
  cancelledBy: { name: string } | null
}
```

- [ ] **Step 2: Update AuditAction to include transfer actions**

Add to the `AuditAction` union:
```ts
  | 'TRANSFER_INITIATED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
```

- [ ] **Step 3: Update MagazineStatus — remove 'upcoming' and 'never_received'**

Per the spec, dashboard reduces to 2 buckets. Change:
```ts
export type MagazineStatus = 'overdue' | 'this_week'
```

**Important:** This is a breaking change. The `/magazines` page filter bar and `MagazineStatusBadge` still reference these values. The staff magazines page filter should keep all 4 values for its own filtering purposes. So instead, keep the original `MagazineStatus` as-is and add:

```ts
/** Dashboard-only status buckets (reduced from 4 to 2) */
export type DashboardStatus = 'overdue' | 'this_week'
```

Leave `MagazineStatus` unchanged so the staff magazines page continues to work.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add Transfer, TransferWithDetails, DashboardStatus, transfer audit actions"
```

---

## Task 3: API — POST /api/transfers (Initiate Transfer)

**Files:**
- Create: `app/api/transfers/route.ts`

- [ ] **Step 1: Create the route file with POST handler**

```ts
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { resolveActiveBranchId } from '@/lib/branch'
import { auditLog } from '@/lib/logger'

interface InitiateTransferBody {
  magazineId: string
  toBranchId: string
  quantity: number
}

/**
 * POST /api/transfers
 * Initiates a branch-to-branch magazine transfer.
 * fromBranchId is resolved from the active branch cookie.
 * Atomically decrements sender's BranchMagazine.quantity and creates Transfer record.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await verifySession()
    const fromBranchId = await resolveActiveBranchId()
    const { magazineId, toBranchId, quantity } = (await request.json()) as InitiateTransferBody

    // Validation
    if (!magazineId || !toBranchId || !quantity) {
      return Response.json({ error: 'magazineId, toBranchId, and quantity are required' }, { status: 400 })
    }
    if (quantity < 1) {
      return Response.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    }
    if (fromBranchId === toBranchId) {
      return Response.json({ error: 'Cannot transfer to the same branch' }, { status: 400 })
    }

    const [magazine, fromBranch, toBranch] = await Promise.all([
      db.magazine.findUnique({ where: { id: magazineId } }),
      db.branch.findUnique({ where: { id: fromBranchId } }),
      db.branch.findUnique({ where: { id: toBranchId, active: true } }),
    ])

    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })
    if (!fromBranch) return Response.json({ error: 'Source branch not found' }, { status: 404 })
    if (!toBranch) return Response.json({ error: 'Destination branch not found or inactive' }, { status: 404 })

    // Check sender has enough quantity
    const senderSub = await db.branchMagazine.findUnique({
      where: { branchId_magazineId: { branchId: fromBranchId, magazineId } },
    })
    if (!senderSub || senderSub.quantity < quantity) {
      return Response.json({ error: 'Insufficient quantity to transfer' }, { status: 400 })
    }

    // Atomic transaction: decrement sender quantity + create transfer
    const transfer = await db.$transaction(async (tx) => {
      // Decrement with race-condition guard
      const updated = await tx.branchMagazine.updateMany({
        where: {
          branchId: fromBranchId,
          magazineId,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      })

      if (updated.count === 0) {
        throw new Error('INSUFFICIENT_QUANTITY')
      }

      return tx.transfer.create({
        data: {
          magazineId,
          fromBranchId,
          toBranchId,
          quantity,
          initiatedById: session.userId,
        },
        include: {
          magazine: { select: { name: true } },
          fromBranch: { select: { name: true, code: true } },
          toBranch: { select: { name: true, code: true } },
          initiatedBy: { select: { name: true } },
        },
      })
    })

    auditLog(session.userId, 'TRANSFER_INITIATED', {
      transferId: transfer.id,
      magazineId,
      magazineName: transfer.magazine.name,
      fromBranchId,
      fromBranchName: transfer.fromBranch.name,
      toBranchId,
      toBranchName: transfer.toBranch.name,
      quantity,
    })

    return Response.json(transfer, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_QUANTITY') {
      return Response.json({ error: 'Insufficient quantity to transfer' }, { status: 400 })
    }
    console.error('Initiate transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify by starting dev server and testing with curl**

```bash
npm run dev &
# Use a valid magazineId, toBranchId from your DB
curl -X POST http://localhost:3000/api/transfers \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"magazineId":"<id>","toBranchId":"<id>","quantity":1}'
```

Expected: 201 with transfer JSON, or appropriate error.

- [ ] **Step 3: Commit**

```bash
git add app/api/transfers/route.ts
git commit -m "feat(api): add POST /api/transfers for transfer initiation"
```

---

## Task 4: API — GET /api/transfers (List Transfers)

**Files:**
- Modify: `app/api/transfers/route.ts`

- [ ] **Step 1: Add GET handler to the same route file**

Add above the POST handler:

```ts
/**
 * GET /api/transfers
 * Lists transfers. Filterable by status and branchId query params.
 * branchId matches transfers where fromBranchId OR toBranchId equals the value.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await verifySession()
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
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

- [ ] **Step 2: Verify**

```bash
curl http://localhost:3000/api/transfers -H "Cookie: <session>"
curl "http://localhost:3000/api/transfers?status=PENDING" -H "Cookie: <session>"
```

Expected: JSON array of transfers.

- [ ] **Step 3: Commit**

```bash
git add app/api/transfers/route.ts
git commit -m "feat(api): add GET /api/transfers with status and branch filtering"
```

---

## Task 5: API — PUT /api/transfers/[id]/complete

**Files:**
- Create: `app/api/transfers/[id]/complete/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { resolveActiveBranchId } from '@/lib/branch'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/transfers/[id]/complete
 * Marks a pending transfer as completed. Must be called from the receiving branch.
 * Atomically: creates IssueReceipt, upserts BranchMagazine quantity, updates Transfer status.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    const { id } = await params
    const activeBranchId = await resolveActiveBranchId()

    const transfer = await db.transfer.findUnique({
      where: { id },
      include: {
        magazine: { select: { name: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
    })

    if (!transfer) return Response.json({ error: 'Transfer not found' }, { status: 404 })
    if (transfer.status !== 'PENDING') {
      return Response.json({ error: 'Transfer is not pending' }, { status: 400 })
    }
    if (transfer.toBranchId !== activeBranchId) {
      return Response.json({ error: 'Only the receiving branch can complete this transfer' }, { status: 403 })
    }

    await db.$transaction(async (tx) => {
      // 1. Create IssueReceipt
      await tx.issueReceipt.create({
        data: {
          magazineId: transfer.magazineId,
          branchId: transfer.toBranchId,
          receivedById: session.userId,
          receivedDate: new Date(),
        },
      })

      // 2. Upsert BranchMagazine for receiver
      const existingSub = await tx.branchMagazine.findUnique({
        where: {
          branchId_magazineId: {
            branchId: transfer.toBranchId,
            magazineId: transfer.magazineId,
          },
        },
      })

      if (existingSub) {
        await tx.branchMagazine.update({
          where: { id: existingSub.id },
          data: { quantity: { increment: transfer.quantity } },
        })
      } else {
        await tx.branchMagazine.create({
          data: {
            branchId: transfer.toBranchId,
            magazineId: transfer.magazineId,
            quantity: transfer.quantity,
            active: false,
          },
        })
      }

      // 3. Update transfer status
      await tx.transfer.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedById: session.userId,
          completedAt: new Date(),
        },
      })
    })

    auditLog(session.userId, 'TRANSFER_COMPLETED', {
      transferId: id,
      magazineId: transfer.magazineId,
      magazineName: transfer.magazine.name,
      fromBranchId: transfer.fromBranchId,
      fromBranchName: transfer.fromBranch.name,
      toBranchId: transfer.toBranchId,
      toBranchName: transfer.toBranch.name,
      quantity: transfer.quantity,
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Complete transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify with curl**

```bash
curl -X PUT http://localhost:3000/api/transfers/<transfer-id>/complete \
  -H "Cookie: <session-for-receiving-branch>"
```

Expected: `{ "success": true }` — check DB: transfer status = COMPLETED, receipt created, BranchMagazine quantity increased.

- [ ] **Step 3: Commit**

```bash
git add app/api/transfers/[id]/complete/route.ts
git commit -m "feat(api): add PUT /api/transfers/[id]/complete for transfer completion"
```

---

## Task 6: API — PUT /api/transfers/[id]/cancel

**Files:**
- Create: `app/api/transfers/[id]/cancel/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/transfers/[id]/cancel
 * Cancels a pending transfer. ADMIN only.
 * Atomically restores sender's BranchMagazine quantity and marks transfer CANCELLED.
 */
export async function PUT(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const transfer = await db.transfer.findUnique({
      where: { id },
      include: {
        magazine: { select: { name: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
    })

    if (!transfer) return Response.json({ error: 'Transfer not found' }, { status: 404 })
    if (transfer.status !== 'PENDING') {
      return Response.json({ error: 'Transfer is not pending' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      // Restore sender's quantity
      const senderSub = await tx.branchMagazine.findUnique({
        where: {
          branchId_magazineId: {
            branchId: transfer.fromBranchId,
            magazineId: transfer.magazineId,
          },
        },
      })

      if (senderSub) {
        await tx.branchMagazine.update({
          where: { id: senderSub.id },
          data: { quantity: { increment: transfer.quantity } },
        })
      } else {
        // BranchMagazine was deleted since initiation — re-create as inactive
        await tx.branchMagazine.create({
          data: {
            branchId: transfer.fromBranchId,
            magazineId: transfer.magazineId,
            quantity: transfer.quantity,
            active: false,
          },
        })
      }

      // Update transfer status
      await tx.transfer.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledById: session.userId,
          cancelledAt: new Date(),
        },
      })
    })

    auditLog(session.userId, 'TRANSFER_CANCELLED', {
      transferId: id,
      magazineId: transfer.magazineId,
      magazineName: transfer.magazine.name,
      fromBranchId: transfer.fromBranchId,
      fromBranchName: transfer.fromBranch.name,
      toBranchId: transfer.toBranchId,
      toBranchName: transfer.toBranch.name,
      quantity: transfer.quantity,
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Cancel transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify with curl**

```bash
curl -X PUT http://localhost:3000/api/transfers/<transfer-id>/cancel \
  -H "Cookie: <admin-session>"
```

Expected: `{ "success": true }` — sender quantity restored, transfer status = CANCELLED.

- [ ] **Step 3: Commit**

```bash
git add app/api/transfers/[id]/cancel/route.ts
git commit -m "feat(api): add PUT /api/transfers/[id]/cancel for admin transfer cancellation"
```

---

## Task 7: Cadence — Calendar Week for isExpectedThisWeek

**Files:**
- Modify: `lib/cadence.ts`

- [ ] **Step 1: Update isExpectedThisWeek to use Sun–Sat boundaries**

Replace the existing `isExpectedThisWeek` function:

```ts
import { addDays, addMonths, startOfWeek, endOfWeek } from 'date-fns'
```

```ts
/**
 * Returns `true` if the next expected date falls within the current calendar week
 * (Sunday through Saturday).
 * @param nextExpectedDate - Computed next expected date, or null
 */
export function isExpectedThisWeek(nextExpectedDate: Date | null): boolean {
  if (!nextExpectedDate) return false
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 }) // Sunday
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 })     // Saturday
  const next = new Date(nextExpectedDate)
  return next >= weekStart && next <= weekEnd
}
```

- [ ] **Step 2: Verify the import is updated**

Make sure the import line reads:
```ts
import { addDays, addMonths, startOfWeek, endOfWeek } from 'date-fns'
```

- [ ] **Step 3: Verify dev server compiles without errors**

```bash
npm run dev
```

Check browser console for no errors on dashboard page.

- [ ] **Step 4: Commit**

```bash
git add lib/cadence.ts
git commit -m "feat(cadence): change isExpectedThisWeek to Sun-Sat calendar week boundaries"
```

---

## Task 8: TransferDialog Component

**Files:**
- Create: `components/TransferDialog.tsx`

- [ ] **Step 1: Create the dialog component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Branch } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SendHorizontal } from 'lucide-react'

export interface TransferDialogProps {
  /** Magazine to transfer */
  magazineName: string
  magazineId: string
  /** Max quantity the sender branch holds */
  maxQuantity: number
  /** All active branches except the sender */
  availableBranches: Branch[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TransferDialog({
  magazineName,
  magazineId,
  maxQuantity,
  availableBranches,
  open,
  onOpenChange,
}: TransferDialogProps) {
  const router = useRouter()
  const [toBranchId, setToBranchId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!toBranchId) {
      toast.error('Please select a destination branch')
      return
    }
    if (quantity < 1 || quantity > maxQuantity) {
      toast.error(`Quantity must be between 1 and ${maxQuantity}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magazineId, toBranchId, quantity }),
      })

      if (res.ok) {
        toast.success('Transfer initiated')
        onOpenChange(false)
        setToBranchId('')
        setQuantity(1)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to initiate transfer')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizontal size={18} style={{ color: 'oklch(0.38 0.082 156)' }} />
            Transfer Magazine
          </DialogTitle>
          <DialogDescription>
            Send copies of <strong>{magazineName}</strong> to another branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Destination Branch</Label>
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity (max {maxQuantity})</Label>
            <Input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !toBranchId}
            style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
          >
            {submitting ? 'Sending...' : 'Send Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run dev
```

No import errors. Component isn't used yet — that comes in Tasks 9/10.

- [ ] **Step 3: Commit**

```bash
git add components/TransferDialog.tsx
git commit -m "feat(ui): add TransferDialog component for branch-to-branch transfers"
```

---

## Task 9: Staff Magazines Page — Clickable Names + Transfer Button

**Files:**
- Modify: `app/(dashboard)/magazines/page.tsx`
- Modify: `components/MagazinesClientControls.tsx`

- [ ] **Step 1: Make magazine name a clickable link in the magazines page**

In `app/(dashboard)/magazines/page.tsx`, find the Name table cell (currently just a `<p>` tag around line 132–143). `Link` is already imported — just change the `<p>` to a `<Link>`:

```tsx
<TableCell>
  <div>
    <Link
      href={`/magazines/${mag.id}`}
      className="font-medium hover:underline"
      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
    >
      {mag.name}
    </Link>
    {mag.notes && (
      <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
        {mag.notes}
      </p>
    )}
  </div>
</TableCell>
```

- [ ] **Step 2: Replace History button with Transfer button**

In the Actions cell (around line 181–194), replace the History button with a transfer action. Change the cell to:

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-2">
    <MagazinesClientControls magazineId={mag.id} magazine={mag} mode="row-actions" activeBranchId={activeBranchId} />
  </div>
</TableCell>
```

Remove the History `<Button>` entirely — staff now access history by clicking the magazine name.

- [ ] **Step 3: Update MagazinesClientControls to include transfer action**

In `components/MagazinesClientControls.tsx`, update the `RowActions` component. The component needs access to branches and the sender's subscription quantity for the TransferDialog. Keep `FilterBarMode` unchanged. Only update `RowActionsMode` to add `branches` and `senderQuantity`:

Replace the `RowActionsMode` type (keep `FilterBarMode` as-is):
```ts
type RowActionsMode = {
  mode: 'row-actions'
  magazineId: string
  magazine: MagazineWithStatus
  activeBranchId: string
  branches: Branch[]
  senderQuantity: number
  currentFilter?: never
}
```

Update imports and the RowActions function:
```tsx
import { CalendarCheck, Filter, SendHorizontal } from 'lucide-react'
import TransferDialog from './TransferDialog'
import type { MagazineWithStatus, Branch } from '@/types'

function RowActions({ magazine, activeBranchId, branches, senderQuantity }: {
  magazine: MagazineWithStatus
  activeBranchId: string
  branches: Branch[]
  senderQuantity: number
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const otherBranches = branches.filter(b => b.id !== activeBranchId)

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
      {senderQuantity > 0 && otherBranches.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          onClick={() => setTransferOpen(true)}
          title="Transfer"
        >
          <SendHorizontal size={13} style={{ color: 'oklch(0.45 0.082 156)' }} />
        </Button>
      )}
      <MarkReceivedDialog
        magazine={magazine}
        activeBranchId={activeBranchId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <TransferDialog
        magazineName={magazine.name}
        magazineId={magazine.id}
        maxQuantity={senderQuantity}
        availableBranches={otherBranches}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
    </>
  )
}
```

Update the default export to pass through the new props:
```tsx
export default function MagazinesClientControls(props: MagazinesClientControlsProps) {
  if (props.mode === 'row-actions') {
    return (
      <RowActions
        magazine={props.magazine}
        activeBranchId={props.activeBranchId}
        branches={props.branches}
        senderQuantity={props.senderQuantity}
      />
    )
  }
  return <FilterBar currentFilter={props.currentFilter} />
}
```

- [ ] **Step 4: Update the magazines page to pass branches and quantity**

In `app/(dashboard)/magazines/page.tsx`:

Add imports:
```ts
import { getActiveBranches } from '@/lib/branch'
```

After resolving `activeBranchId`, fetch branches:
```ts
const branches = await getActiveBranches()
```

Fetch subscription quantities alongside magazines. Add to the query or fetch separately:
```ts
const branchSubscriptionsFull = await db.branchMagazine.findMany({
  where: { branchId: activeBranchId, active: true },
  select: { magazineId: true, quantity: true },
})
const quantityMap = new Map(branchSubscriptionsFull.map(s => [s.magazineId, s.quantity]))
```

Update the `MagazinesClientControls` call in the row:
```tsx
<MagazinesClientControls
  magazineId={mag.id}
  magazine={mag}
  mode="row-actions"
  activeBranchId={activeBranchId}
  branches={branches}
  senderQuantity={quantityMap.get(mag.id) ?? 0}
/>
```

- [ ] **Step 5: Rename "Total Issues" column header to "Total Deliveries"**

In the `<TableHead>` for "Total Issues" (around line 117), change:
```tsx
<TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Total Deliveries</TableHead>
```

- [ ] **Step 6: Verify in browser**

Open `/magazines`. Confirm:
- Magazine names are clickable links to `/magazines/[id]`
- Transfer button (send icon) appears in Actions column
- Clicking transfer button opens TransferDialog
- "Total Issues" now says "Total Deliveries"

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/magazines/page.tsx components/MagazinesClientControls.tsx
git commit -m "feat(magazines): clickable names, transfer button, rename Total Deliveries"
```

---

## Task 10: Admin Magazines Page — Column Swap, Rename, Transfer Button

**Files:**
- Modify: `components/AdminMagazinesClient.tsx`

- [ ] **Step 1: Add TransferDialog import and state**

At top, add:
```tsx
import { Plus, Pencil, Trash2, BookMarked, SendHorizontal } from 'lucide-react'
import TransferDialog from './TransferDialog'
```

Add new props to `AdminMagazinesClientProps`:
```ts
export interface AdminMagazinesClientProps {
  magazines: BranchMagazineWithDetails[]
  branchId: string
  page: number
  totalPages: number
  branches: Branch[]
}
```

Add state in the component:
```ts
const [transferTarget, setTransferTarget] = useState<BranchMagazineWithDetails | null>(null)
```

- [ ] **Step 2: Reorder columns and rename**

Change the header array from:
```ts
['Name', 'Cadence', 'Qty', 'Total Issues', 'Last Received', 'Next Expected', 'Status', 'Notes', 'Actions']
```
to:
```ts
['Name', 'Cadence', 'Qty', 'Total Deliveries', 'Last Received', 'Next Expected', 'Notes', 'Status', 'Actions']
```

In the table body rows, swap the Notes and Status cells so Notes comes before the Switch (Status).

- [ ] **Step 3: Add transfer button to Actions column**

In the Actions `<TableCell>`, add a SendHorizontal button before the edit/delete buttons:

```tsx
<Button
  size="sm"
  variant="ghost"
  className="h-7 w-7 p-0"
  onClick={() => setTransferTarget(sub)}
  title="Transfer"
  disabled={sub.quantity < 1}
>
  <SendHorizontal size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
</Button>
```

- [ ] **Step 4: Add TransferDialog render at the bottom of the component**

Before the closing `</>`:
```tsx
{transferTarget && (
  <TransferDialog
    magazineName={transferTarget.magazine.name}
    magazineId={transferTarget.magazineId}
    maxQuantity={transferTarget.quantity}
    availableBranches={branches.filter(b => b.id !== branchId)}
    open={!!transferTarget}
    onOpenChange={(v) => { if (!v) setTransferTarget(null) }}
  />
)}
```

- [ ] **Step 5: Update admin magazines page to pass branches**

In `app/(dashboard)/admin/magazines/page.tsx`, the `branches` variable is already fetched. Pass it:
```tsx
<AdminMagazinesClient
  magazines={enriched}
  branchId={branchId}
  page={page}
  totalPages={totalPages}
  branches={branches}
/>
```

- [ ] **Step 6: Add Branch import to AdminMagazinesClient**

```ts
import type { BranchMagazineWithDetails, Branch } from '@/types'
```

- [ ] **Step 7: Verify in browser**

Open `/admin/magazines`. Confirm:
- Column order: Name, Cadence, Qty, Total Deliveries, Last Received, Next Expected, Notes, Status (Switch), Actions
- Send icon button in Actions column
- Clicking it opens TransferDialog

- [ ] **Step 8: Commit**

```bash
git add components/AdminMagazinesClient.tsx app/\(dashboard\)/admin/magazines/page.tsx
git commit -m "feat(admin): reorder columns, rename Total Deliveries, add transfer button"
```

---

## Task 11: Dashboard — 2 Buckets, Title, Transfer Cards, Suppression

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Create: `components/TransferCard.tsx`

- [ ] **Step 1: Create TransferCard component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { TransferWithDetails } from '@/types'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SendHorizontal, CalendarCheck } from 'lucide-react'

export interface TransferCardProps {
  transfer: TransferWithDetails
}

export default function TransferCard({ transfer }: TransferCardProps) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/complete`, { method: 'PUT' })
      if (res.ok) {
        toast.success(`Transfer of ${transfer.magazine.name} received`)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to complete transfer')
      }
    } finally {
      setCompleting(false)
    }
  }

  return (
    <Card
      className="relative overflow-hidden transition-shadow hover:shadow-md"
      style={{
        borderColor: 'oklch(0.78 0.12 250)',
        backgroundColor: 'oklch(0.98 0.008 250)',
      }}
    >
      {/* Transfer indicator dot */}
      <div
        className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: 'oklch(0.55 0.18 250)' }}
      />

      <CardHeader className="pb-2 pr-8">
        <div className="flex items-start gap-2 flex-wrap">
          <h3
            className="font-semibold text-base leading-snug flex-1 min-w-0"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            {transfer.magazine.name}
          </h3>
        </div>
        <Badge
          variant="outline"
          className="w-fit text-xs font-medium mt-1"
          style={{
            backgroundColor: 'oklch(0.55 0.18 250 / 0.10)',
            color: 'oklch(0.45 0.15 250)',
            borderColor: 'oklch(0.55 0.18 250 / 0.25)',
          }}
        >
          Transfer · {transfer.quantity} {transfer.quantity === 1 ? 'copy' : 'copies'}
        </Badge>
      </CardHeader>

      <CardContent className="pb-3 space-y-1.5 text-sm">
        <div className="flex items-center gap-2" style={{ color: 'oklch(0.50 0.035 72)' }}>
          <SendHorizontal size={13} className="flex-shrink-0" style={{ color: 'oklch(0.55 0.18 250)' }} />
          <span>
            Will be delivered from{' '}
            <span style={{ color: 'oklch(0.25 0.028 62)', fontWeight: 500 }}>
              {transfer.fromBranch.name}
            </span>{' '}
            soon
          </span>
        </div>
      </CardContent>

      <CardFooter className="gap-2 items-center justify-center">
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-xs h-8 cursor-pointer"
          onClick={handleComplete}
          disabled={completing}
          style={{ backgroundColor: 'oklch(0.45 0.15 250)' }}
        >
          <CalendarCheck size={13} /> {completing ? 'Receiving...' : 'Received'}
        </Button>
      </CardFooter>
    </Card>
  )
}
```

- [ ] **Step 2: Rewrite dashboard page**

Replace `app/(dashboard)/dashboard/page.tsx` entirely:

```tsx
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import type { DashboardStatus, MagazineWithStatus, TransferWithDetails } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { resolveActiveBranchId } from '@/lib/branch'
import { computeNextExpectedDate, isOverdue, isExpectedThisWeek } from '@/lib/cadence'
import MagazineCard from '@/components/MagazineCard'
import TransferCard from '@/components/TransferCard'
import { AlertTriangle, Clock, BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — EPL Magazine Tracker' }

interface SectionConfig {
  label: string
  description: string
  icon: LucideIcon
  color: string
  bg: string
  border: string
}

const SECTION_CONFIG: Record<DashboardStatus, SectionConfig> = {
  this_week: {
    label: 'Expected This Week',
    description: 'Due within the current week (Sun–Sat)',
    icon: Clock,
    color: 'oklch(0.55 0.15 78)',
    bg: 'oklch(0.97 0.022 85)',
    border: 'oklch(0.88 0.08 78)',
  },
  overdue: {
    label: 'Overdue',
    description: 'Past their expected delivery date',
    icon: AlertTriangle,
    color: 'oklch(0.56 0.225 27)',
    bg: 'oklch(0.97 0.020 27)',
    border: 'oklch(0.88 0.08 27)',
  },
}

const BUCKET_ORDER: DashboardStatus[] = ['this_week', 'overdue']

type Buckets = Record<DashboardStatus, MagazineWithStatus[]>

export default async function DashboardPage() {
  await verifySession()

  const activeBranchId = await resolveActiveBranchId()

  // Fetch branch name for title
  const currentBranch = await db.branch.findUnique({
    where: { id: activeBranchId },
    select: { name: true },
  })

  // Fetch pending incoming transfers for this branch
  const pendingTransfers = await db.transfer.findMany({
    where: { toBranchId: activeBranchId, status: 'PENDING' },
    include: {
      magazine: { select: { name: true } },
      fromBranch: { select: { name: true, code: true } },
      toBranch: { select: { name: true, code: true } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  }) as TransferWithDetails[]

  // Magazine IDs that have pending transfers — suppress their subscription cards
  const suppressedMagazineIds = new Set(pendingTransfers.map((t) => t.magazineId))

  // Get magazine IDs subscribed at this branch
  const branchSubscriptions = await db.branchMagazine.findMany({
    where: { branchId: activeBranchId, active: true },
    select: { magazineId: true },
  })
  const subscribedMagazineIds = branchSubscriptions.map((s) => s.magazineId)

  // Fetch only those magazines with branch-specific receipts
  const magazines = await db.magazine.findMany({
    where: {
      id: { in: subscribedMagazineIds },
      active: true,
    },
    include: {
      receipts: {
        where: { branchId: activeBranchId },
        orderBy: { receivedDate: 'desc' as const },
        take: 1,
        include: { receivedBy: { select: { name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  const processed: MagazineWithStatus[] = magazines
    .filter((mag) => !suppressedMagazineIds.has(mag.id))
    .map((mag) => {
      const lastReceipt = mag.receipts[0] ?? null
      const lastReceivedDate = lastReceipt?.receivedDate ?? null
      const nextExpectedDate = computeNextExpectedDate(lastReceivedDate, mag.cadence)
      const status = isOverdue(nextExpectedDate)
        ? 'overdue' as const
        : isExpectedThisWeek(nextExpectedDate)
          ? 'this_week' as const
          : null
      return status ? { ...mag, lastReceivedDate, nextExpectedDate, status } : null
    })
    .filter((m): m is MagazineWithStatus => m !== null)

  const buckets: Buckets = {
    this_week: processed.filter((m) => m.status === 'this_week'),
    overdue: processed.filter((m) => m.status === 'overdue'),
  }

  const totalOverdue = buckets.overdue.length
  const totalThisWeek = buckets.this_week.length + pendingTransfers.length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Magazine Dashboard
          {currentBranch && (
            <span style={{ color: 'oklch(0.50 0.035 72)' }}> {currentBranch.name}</span>
          )}
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalThisWeek} expected this week
          {totalOverdue > 0 && (
            <span style={{ color: 'oklch(0.56 0.225 27)' }}>
              {' '}· {totalOverdue} overdue
            </span>
          )}
          {pendingTransfers.length > 0 && (
            <span style={{ color: 'oklch(0.45 0.15 250)' }}>
              {' '}· {pendingTransfers.length} incoming transfer{pendingTransfers.length !== 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        {BUCKET_ORDER.map((status) => {
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
          const count = status === 'this_week'
            ? buckets[status].length + pendingTransfers.length
            : buckets[status].length
          return (
            <div
              key={status}
              className="rounded-lg px-4 py-3 border"
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Icon size={14} style={{ color: cfg.color }} />
                <span className="text-xs font-medium" style={{ color: cfg.color }}>
                  {count}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'oklch(0.50 0.035 72)' }}>
                {cfg.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Status sections */}
      <div className="space-y-10">
        {BUCKET_ORDER.map((status) => {
          const items = buckets[status]
          const transfers = status === 'this_week' ? pendingTransfers : []
          if (items.length === 0 && transfers.length === 0) return null
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
          const totalCount = items.length + transfers.length
          return (
            <section key={status}>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  <Icon size={15} style={{ color: cfg.color }} />
                </div>
                <div>
                  <h2
                    className="text-base font-semibold leading-tight"
                    style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                  >
                    {cfg.label}
                    <span className="ml-2 text-sm font-normal" style={{ color: cfg.color }}>
                      ({totalCount})
                    </span>
                  </h2>
                  <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                    {cfg.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {transfers.map((t) => (
                  <TransferCard key={t.id} transfer={t} />
                ))}
                {items.map((magazine) => (
                  <MagazineCard key={magazine.id} magazine={magazine} activeBranchId={activeBranchId} />
                ))}
              </div>
            </section>
          )
        })}

        {processed.length === 0 && pendingTransfers.length === 0 && (
          <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
            <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
              No magazines expected right now
            </p>
            <p className="text-sm mt-1">Check back when deliveries are due this week.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Open `/dashboard`. Confirm:
- Title shows "Magazine Dashboard [Branch Name]"
- Only 2 buckets: Expected This Week, Overdue
- No Upcoming or Never Received sections
- If there are pending incoming transfers, they show as blue-ish cards in Expected This Week
- Magazines with pending transfers are suppressed from subscription cards

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx components/TransferCard.tsx
git commit -m "feat(dashboard): 2 buckets, dynamic title, transfer cards with suppression"
```

---

## Task 12: Admin Transfers Page

**Files:**
- Create: `app/(dashboard)/admin/transfers/page.tsx`
- Create: `components/AdminTransfersClient.tsx`

- [ ] **Step 1: Create AdminTransfersClient component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { TransferWithDetails, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Filter, XCircle } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export interface AdminTransfersClientProps {
  transfers: TransferWithDetails[]
  currentFilter: TransferStatus | 'ALL'
}

const STATUS_COLORS: Record<TransferStatus, { bg: string; color: string; border: string }> = {
  PENDING: {
    bg: 'oklch(0.55 0.15 78 / 0.10)',
    color: 'oklch(0.50 0.15 78)',
    border: 'oklch(0.55 0.15 78 / 0.25)',
  },
  COMPLETED: {
    bg: 'oklch(0.45 0.10 155 / 0.10)',
    color: 'oklch(0.40 0.10 155)',
    border: 'oklch(0.45 0.10 155 / 0.25)',
  },
  CANCELLED: {
    bg: 'oklch(0.56 0.225 27 / 0.10)',
    color: 'oklch(0.50 0.20 27)',
    border: 'oklch(0.56 0.225 27 / 0.25)',
  },
}

const FILTER_OPTIONS: { value: TransferStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function fmt(date: Date | string | null): string {
  return date ? format(new Date(date), 'MMM d, yyyy HH:mm') : '—'
}

export default function AdminTransfersClient({ transfers, currentFilter }: AdminTransfersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  function applyFilter(value: string) {
    const params = new URLSearchParams()
    if (value !== 'ALL') params.set('status', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleCancel(id: string) {
    setCancellingId(id)
    try {
      const res = await fetch(`/api/transfers/${id}/cancel`, { method: 'PUT' })
      if (res.ok) {
        toast.success('Transfer cancelled')
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to cancel transfer')
      }
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <Filter size={14} style={{ color: 'oklch(0.55 0.030 72)' }} />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => applyFilter(opt.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
            style={{
              backgroundColor: currentFilter === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.978 0.009 88)',
              color: currentFilter === opt.value
                ? 'oklch(0.978 0.009 88)'
                : 'oklch(0.45 0.035 72)',
              borderColor: currentFilter === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.876 0.016 88)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {transfers.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No transfers found
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Magazine', 'From', 'To', 'Qty', 'Status', 'Initiated By', 'Date', 'Actions'].map((h) => (
                  <TableHead
                    key={h}
                    className={`font-semibold ${h === 'Actions' ? 'text-right' : ''}`}
                    style={{ color: 'oklch(0.30 0.028 62)' }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => {
                const statusStyle = STATUS_COLORS[t.status]
                return (
                  <TableRow
                    key={t.id}
                    className="hover:bg-black/[0.02] transition-colors"
                    style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                  >
                    <TableCell>
                      <span
                        className="font-medium"
                        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                      >
                        {t.magazine.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                        {t.fromBranch.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                        {t.toBranch.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                        {t.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                          borderColor: statusStyle.border,
                        }}
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.45 0.028 62)' }}>
                        {t.initiatedBy.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                        {fmt(t.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleCancel(t.id)}
                          disabled={cancellingId === t.id}
                          style={{ color: 'oklch(0.56 0.225 27)', borderColor: 'oklch(0.56 0.225 27 / 0.3)' }}
                        >
                          <XCircle size={12} /> {cancellingId === t.id ? 'Cancelling...' : 'Cancel'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Create admin transfers page**

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import type { TransferStatus, TransferWithDetails } from '@/types'
import AdminTransfersClient from '@/components/AdminTransfersClient'

export const metadata: Metadata = { title: 'Transfers — EPL Magazine Tracker' }

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminTransfersPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const statusFilter = (typeof params?.status === 'string' ? params.status : undefined) as TransferStatus | undefined

  const where: Record<string, unknown> = {}
  if (statusFilter) where.status = statusFilter

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
  }) as TransferWithDetails[]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Transfers
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
          {statusFilter && ` (${statusFilter.toLowerCase()})`}
        </p>
      </div>

      <AdminTransfersClient
        transfers={transfers}
        currentFilter={statusFilter || 'ALL'}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Open `/admin/transfers`. Confirm:
- Shows all transfers with filtering
- Cancel button works on pending transfers

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/admin/transfers/page.tsx components/AdminTransfersClient.tsx
git commit -m "feat(admin): add transfers management page with status filtering"
```

---

## Task 13: Sidebar — Add Transfers Nav Item + Collapsible

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add Transfers to admin nav items**

In `components/Sidebar.tsx`, add to the `adminItems` array:

```ts
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ScrollText,
  LogOut,
  ChevronRight,
  ChevronLeft,
  BookMarked,
  ArrowLeftRight,
} from 'lucide-react'
```

Add to `adminItems` array (after "Manage Magazines"):
```ts
{ href: '/admin/transfers', label: 'Transfers', icon: ArrowLeftRight },
```

- [ ] **Step 2: Add collapsed state with cookie persistence**

Add `useState` import (the component doesn't currently import it):
```ts
import { useState } from 'react'
```

Update `SidebarProps`:
```ts
export interface SidebarProps {
  user: AuthUser
  branches: Branch[]
  activeBranchId: string
  defaultCollapsed?: boolean
}
```

Add state and cookie logic at the top of the component:
```ts
const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

function toggleCollapsed() {
  const next = !collapsed
  setCollapsed(next)
  document.cookie = `epl-sidebar-collapsed=${next};path=/;max-age=${60 * 60 * 24 * 365}`
}
```

- [ ] **Step 3: Update the sidebar JSX for collapse support**

Replace the outer `<aside>` with collapse-aware rendering:

```tsx
return (
  <aside
    className="flex-shrink-0 flex flex-col h-full transition-all duration-300 relative"
    style={{ backgroundColor: FOREST, width: collapsed ? '64px' : '256px' }}
  >
    {/* Collapse toggle button */}
    <button
      onClick={toggleCollapsed}
      className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-colors cursor-pointer"
      style={{
        backgroundColor: FOREST,
        borderColor: 'oklch(0.30 0.055 158)',
        color: CREAM,
      }}
    >
      {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
    </button>

    {/* Logo */}
    <div className="px-5 py-5 border-b" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
      {collapsed ? (
        <span className="text-lg font-bold block text-center" style={{ color: CREAM }}>E</span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/epl-logo-white.png" alt="Edison Public Library" className="h-10 w-auto" />
      )}
    </div>

    {/* Main navigation */}
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {!collapsed && (
        <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
          Navigation
        </p>
      )}

      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group"
          style={{
            backgroundColor: isActive(href) ? FOREST_HOVER : 'transparent',
            color: isActive(href) ? CREAM : CREAM_MUTED,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
          title={collapsed ? label : undefined}
        >
          <Icon
            size={16}
            style={{ color: isActive(href) ? GOLD : CREAM_MUTED }}
            className={`flex-shrink-0 transition-all ${collapsed ? 'hover:scale-110' : ''}`}
          />
          {!collapsed && <span className="font-medium">{label}</span>}
          {!collapsed && isActive(href) && (
            <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
          )}
        </Link>
      ))}

      {/* Admin section */}
      {user.role === 'ADMIN' && (
        <>
          <div className="pt-4 pb-1">
            <Separator style={{ backgroundColor: 'oklch(0.30 0.055 158)' }} />
          </div>
          {!collapsed && (
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
              Administration
            </p>
          )}

          {adminItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all"
              style={{
                backgroundColor: isActive(href) ? FOREST_HOVER : 'transparent',
                color: isActive(href) ? CREAM : CREAM_MUTED,
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
              title={collapsed ? label : undefined}
            >
              <Icon
                size={16}
                style={{ color: isActive(href) ? GOLD : CREAM_MUTED }}
                className={`flex-shrink-0 ${collapsed ? 'hover:scale-110' : ''}`}
              />
              {!collapsed && <span className="font-medium">{label}</span>}
              {!collapsed && isActive(href) && (
                <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
              )}
            </Link>
          ))}
        </>
      )}
    </nav>

    {/* Branch selector + user info + logout */}
    {!collapsed && (
      <div className="border-t mt-auto" style={{ borderColor: 'oklch(0.30 0.04 158)' }}>
        <BranchSelector branches={branches} activeBranchId={activeBranchId} />
      </div>
    )}
    <div className="border-t p-4 space-y-3" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
      <Link
        href="/profile"
        className={`flex items-center gap-3 px-1 rounded-md transition-colors hover:bg-white/5 ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? user.name : undefined}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: 'oklch(0.30 0.065 158)', color: CREAM }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: CREAM }}>
              {user.name}
            </p>
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 border-0 font-medium"
              style={{
                backgroundColor: user.role === 'ADMIN'
                  ? 'oklch(0.60 0.128 79 / 0.20)'
                  : 'oklch(0.38 0.082 156 / 0.30)',
                color: user.role === 'ADMIN' ? GOLD : CREAM,
              }}
            >
              {user.role}
            </Badge>
          </div>
        )}
      </Link>

      <button
        onClick={handleLogout}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-black/10 cursor-pointer ${collapsed ? 'justify-center' : ''}`}
        style={{ color: CREAM_MUTED }}
        title={collapsed ? 'Sign out' : undefined}
      >
        <LogOut size={15} />
        {!collapsed && <span>Sign out</span>}
      </button>
    </div>
  </aside>
)
```

- [ ] **Step 4: Update layout to read sidebar cookie**

In `app/(dashboard)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/dal'
import { getActiveBranches, resolveActiveBranchId } from '@/lib/branch'
import Sidebar from '@/components/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: LayoutProps) {
  const [user, branches, activeBranchId, cookieStore] = await Promise.all([
    getUser(),
    getActiveBranches(),
    resolveActiveBranchId(),
    cookies(),
  ])

  const sidebarCollapsed = cookieStore.get('epl-sidebar-collapsed')?.value === 'true'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user}
        branches={branches}
        activeBranchId={activeBranchId}
        defaultCollapsed={sidebarCollapsed}
      />
      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Confirm:
- Sidebar has a round toggle button at top-right edge
- Clicking toggles between expanded (256px) and collapsed (64px)
- Collapsed: icon-only nav with hover scale, "E" logo, avatar-only user badge, no branch selector
- Preference persists across page reloads
- "Transfers" link visible in admin section
- Main content area smoothly expands/contracts

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat(sidebar): add collapsible sidebar with cookie persistence and Transfers nav"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Full flow test**

1. Log in as admin at Main branch
2. Go to `/admin/magazines` — verify column order and "Total Deliveries" label
3. Click transfer button on a magazine with qty >= 1 — transfer to North
4. Switch to North branch in sidebar
5. Go to `/dashboard` — see the transfer card in "Expected This Week"
6. Click "Received" on the transfer card — should complete
7. Switch back to Main branch, go to `/admin/transfers` — see completed transfer
8. Initiate another transfer, then cancel it from `/admin/transfers`
9. Go to `/magazines` — verify clickable names and transfer button
10. Toggle sidebar collapsed/expanded, reload — verify persistence

- [ ] **Step 2: Check audit log**

```bash
tail -5 logs/audit.log | python3 -m json.tool
```

Expected: TRANSFER_INITIATED, TRANSFER_COMPLETED, and/or TRANSFER_CANCELLED entries.

- [ ] **Step 3: Commit any remaining fixes**

Only if issues were found and fixed during verification.
