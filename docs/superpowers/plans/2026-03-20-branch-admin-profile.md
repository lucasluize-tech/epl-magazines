# Branch-Aware Admin, User Profile, and UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin magazines branch-aware (inventory view), add user profile page, fix toggle UX, add branch selection at login, resolve IDs in audit log.

**Architecture:** Rewrite admin magazines page to query `BranchMagazine` by active branch. Add `Switch` component for toggles. New profile page + API route. Login page gets server-side branch list passed to client form. Audit log resolves magazine/branch IDs at display time.

**Tech Stack:** Next.js App Router, TypeScript, Prisma v7 + SQLite, shadcn/ui (Switch), date-fns, bcrypt, jose

**Spec:** `docs/superpowers/specs/2026-03-19-branch-admin-profile-design.md`

---

## File Structure

### New Files
- `components/ui/switch.tsx` — shadcn Switch component (generated)
- `app/(dashboard)/profile/page.tsx` — User profile server component
- `components/ProfileClient.tsx` — Profile client component (name + password forms)
- `app/api/users/profile/route.ts` — Profile API (PUT name/password)
- `components/AdminMagazineDeleteDialog.tsx` — Two-option delete dialog (remove from branch vs delete entirely)

### Modified Files
- `app/api/magazines/[id]/route.ts` — Fix DELETE cascade (add BranchMagazine deletion)
- `app/api/branches/[id]/magazines/[magazineId]/route.ts` — Change DELETE from soft to hard delete
- `types/index.ts` — Add `BranchMagazineWithDetails` type, `AuditAction` entries
- `app/(dashboard)/admin/magazines/page.tsx` — Rewrite to query BranchMagazine with pagination
- `components/AdminMagazinesClient.tsx` — Rewrite for branch inventory view with Switch + disable pattern
- `components/CreateMagazineDialog.tsx` — Add quantity field + branchId prop for two-step create
- `components/EditMagazineDialog.tsx` — Rewrite: global fields + branch fields (quantity, lastReceivedDate)
- `components/AdminUsersClient.tsx` — Replace toggle icons with Switch + add disable pattern
- `app/(auth)/login/page.tsx` — Pass branches from server to client
- `components/LoginForm.tsx` — Add required branch dropdown, set cookie on login
- `components/Sidebar.tsx` — Make user badge a clickable Link to /profile
- `app/(dashboard)/log/page.tsx` — Resolve magazine/branch IDs to names

---

## Task 1: Add shadcn Switch Component

**Files:**
- Create: `components/ui/switch.tsx`

- [ ] **Step 1: Install Switch component**

```bash
npx shadcn@latest add switch --yes
```

- [ ] **Step 2: Verify the file was created**

```bash
ls components/ui/switch.tsx
```

Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add components/ui/switch.tsx
git commit -m "feat(ui): add shadcn Switch component"
```

---

## Task 2: Fix API DELETE Cascades

**Files:**
- Modify: `app/api/magazines/[id]/route.ts:78-82`
- Modify: `app/api/branches/[id]/magazines/[magazineId]/route.ts:56-78`

- [ ] **Step 1: Fix magazine DELETE to cascade BranchMagazine records**

In `app/api/magazines/[id]/route.ts`, the DELETE handler (line 80-82) only deletes `issueReceipt` before deleting the magazine. Add `branchMagazine` deletion between them. Replace lines 80-82:

```ts
    // Delete related records first (manual cascade)
    await db.branchMagazine.deleteMany({ where: { magazineId: id } })
    await db.issueReceipt.deleteMany({ where: { magazineId: id } })
    const magazine = await db.magazine.delete({ where: { id } })
```

- [ ] **Step 2: Change branch magazine DELETE from soft delete to hard delete**

In `app/api/branches/[id]/magazines/[magazineId]/route.ts`, replace the `update` call (lines 65-68) with a `delete`:

```ts
    await db.branchMagazine.delete({
      where: { branchId_magazineId: { branchId: id, magazineId } },
    })
```

- [ ] **Step 3: Verify the dev server starts without errors**

```bash
npx next build --no-lint 2>&1 | tail -5
```

Expected: no type errors in modified files

- [ ] **Step 4: Commit**

```bash
git add app/api/magazines/[id]/route.ts app/api/branches/[id]/magazines/[magazineId]/route.ts
git commit -m "fix(api): cascade BranchMagazine on magazine delete, hard-delete branch subscription"
```

---

## Task 3: Add New Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add BranchMagazineWithDetails type and new audit actions**

Add after the `BranchMagazine` interface (after line 133):

```ts
/** Branch magazine subscription enriched with magazine data and receipt stats for admin inventory view */
export interface BranchMagazineWithDetails {
  id: string
  branchId: string
  magazineId: string
  quantity: number
  active: boolean
  createdAt: Date
  magazine: Magazine
  totalIssues: number
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
}
```

Add to `AuditAction` union (after line 172):

```ts
  | 'USER_NAME_CHANGED'
  | 'USER_PASSWORD_CHANGED'
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add BranchMagazineWithDetails type and profile audit actions"
```

---

## Task 4: Replace Toggle Icons with Switch on Admin Users Page

**Files:**
- Modify: `components/AdminUsersClient.tsx`

- [ ] **Step 1: Add Switch import and loading state**

Replace the import line for `UserX, UserCheck` icons (line 8) — remove them since they won't be needed. Add Switch import:

```ts
import { Plus, Trash2, Users } from 'lucide-react'
```

Add at top of imports:

```ts
import { Switch } from '@/components/ui/switch'
```

Add a loading state inside the component (after line 25):

```ts
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
```

- [ ] **Step 2: Wrap toggleActive with disable pattern**

Replace the `toggleActive` function (lines 27-39):

```ts
  async function toggleActive(user: AdminUser) {
    setTogglingId(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      })
      if (res.ok) {
        toast.success(`${user.name} ${user.active ? 'deactivated' : 'activated'}`)
        router.refresh()
      } else {
        toast.error('Failed to update user')
      }
    } finally {
      setTogglingId(null)
    }
  }
```

- [ ] **Step 3: Wrap deleteUser with disable pattern**

Replace the `deleteUser` function (lines 41-51):

```ts
  async function deleteUser(user: AdminUser) {
    setDeletingId(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`${user.name} deleted`)
        setDeleteTarget(null)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to delete user')
      }
    } finally {
      setDeletingId(null)
    }
  }
```

- [ ] **Step 4: Replace toggle icon buttons with Switch in the Actions cell**

Replace the toggle button and delete button block (lines 159-183). **IMPORTANT:** Preserve the `{user.id !== currentUserId && (...)}` guard that prevents admins from deactivating or deleting themselves:

```tsx
                      {user.id !== currentUserId && (
                        <>
                          <Switch
                            checked={user.active}
                            onCheckedChange={() => toggleActive(user)}
                            disabled={togglingId === user.id}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setDeleteTarget(user)}
                            title="Delete"
                            disabled={deletingId === user.id}
                          >
                            <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
                          </Button>
                        </>
                      )}
```

- [ ] **Step 5: Remove the Status column (now redundant with Switch)**

The Status column (badge showing Active/Inactive) is now redundant since the Switch visually shows the state. Remove the Status `<TableHead>` from the headers array (line 78) — change from:

```ts
                {['Name', 'Email', 'Role', 'Status', 'Receipts', 'Joined', 'Actions'].map((h) => (
```

to:

```ts
                {['Name', 'Email', 'Role', 'Receipts', 'Joined', 'Actions'].map((h) => (
```

And remove the Status `<TableCell>` block (lines 134-146).

- [ ] **Step 6: Verify dev server compiles**

```bash
npx next build --no-lint 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add components/AdminUsersClient.tsx
git commit -m "feat(ui): replace user toggle icons with Switch component, add disable pattern"
```

---

## Task 5: Rewrite Admin Magazines Page (Server Component)

> **NOTE:** Tasks 6, 7, and 8 (dialog rewrites) MUST be completed before Task 9 (AdminMagazinesClient rewrite), because Task 9 imports the new dialog props defined in those tasks.

**Files:**
- Modify: `app/(dashboard)/admin/magazines/page.tsx`

- [ ] **Step 1: Rewrite the server component to query BranchMagazine with pagination**

Replace the entire file content:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import { getActiveBranchId, getActiveBranches } from '@/lib/branch'
import db from '@/lib/db'
import { computeNextExpectedDate } from '@/lib/cadence'
import AdminMagazinesClient from '@/components/AdminMagazinesClient'
import type { BranchMagazineWithDetails } from '@/types'

export const metadata: Metadata = { title: 'Manage Magazines — EPL Magazine Tracker' }

const PAGE_SIZE = 10

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminMagazinesPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const branchId = await getActiveBranchId()
  if (!branchId) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, parseInt((typeof params?.page === 'string' ? params.page : undefined) || '1', 10))

  const branches = await getActiveBranches()
  const currentBranch = branches.find((b) => b.id === branchId)

  // Count total subscriptions for pagination (include inactive so admin can toggle them)
  const totalCount = await db.branchMagazine.count({
    where: { branchId },
  })
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Fetch paginated subscriptions with magazine data
  const subscriptions = await db.branchMagazine.findMany({
    where: { branchId },
    orderBy: [{ active: 'desc' }, { magazine: { name: 'asc' } }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      magazine: true,
    },
  })

  // Current year boundaries for Total Issues count
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1)

  // Enrich each subscription with receipt stats
  const enriched: BranchMagazineWithDetails[] = await Promise.all(
    subscriptions.map(async (sub) => {
      const [totalIssues, lastReceipt] = await Promise.all([
        db.issueReceipt.count({
          where: {
            magazineId: sub.magazineId,
            branchId,
            receivedDate: { gte: yearStart, lt: yearEnd },
          },
        }),
        db.issueReceipt.findFirst({
          where: { magazineId: sub.magazineId, branchId },
          orderBy: { createdAt: 'desc' },
          select: { receivedDate: true },
        }),
      ])

      const lastReceivedDate = lastReceipt?.receivedDate ?? null
      const nextExpectedDate = lastReceivedDate
        ? computeNextExpectedDate(lastReceivedDate, sub.magazine.cadence)
        : null

      return {
        id: sub.id,
        branchId: sub.branchId,
        magazineId: sub.magazineId,
        quantity: sub.quantity,
        active: sub.active,
        createdAt: sub.createdAt,
        magazine: sub.magazine,
        totalIssues,
        lastReceivedDate,
        nextExpectedDate,
      }
    })
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Manage Magazines
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalCount} subscription{totalCount !== 1 ? 's' : ''} at {currentBranch?.name ?? 'this branch'}
        </p>
      </div>

      <AdminMagazinesClient
        magazines={enriched}
        branchId={branchId}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/admin/magazines/page.tsx
git commit -m "feat(admin): rewrite magazines page to query BranchMagazine with pagination"
```

---

## Task 6: Create AdminMagazineDeleteDialog

**Files:**
- Create: `components/AdminMagazineDeleteDialog.tsx`

- [ ] **Step 1: Create the two-option delete dialog**

```tsx
'use client'

import { useState } from 'react'
import { Loader2, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export interface AdminMagazineDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  magazineName: string
  onRemoveFromBranch: () => Promise<void>
  onDeleteEntirely: () => Promise<void>
}

export default function AdminMagazineDeleteDialog({
  open,
  onOpenChange,
  magazineName,
  onRemoveFromBranch,
  onDeleteEntirely,
}: AdminMagazineDeleteDialogProps) {
  const [loading, setLoading] = useState<'branch' | 'global' | null>(null)

  async function handleAction(action: 'branch' | 'global') {
    setLoading(action)
    try {
      if (action === 'branch') {
        await onRemoveFromBranch()
      } else {
        await onDeleteEntirely()
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>
            Remove &quot;{magazineName}&quot;?
          </DialogTitle>
          <DialogDescription>
            Choose how to remove this magazine.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => handleAction('branch')}
            disabled={loading !== null}
          >
            {loading === 'branch' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Unlink size={15} />
            )}
            Remove from this branch
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start gap-2"
            onClick={() => handleAction('global')}
            disabled={loading !== null}
          >
            {loading === 'global' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            Delete magazine entirely
          </Button>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AdminMagazineDeleteDialog.tsx
git commit -m "feat(ui): add two-option delete dialog for admin magazines"
```

---

## Task 9: Rewrite AdminMagazinesClient for Branch Inventory View

> **DEPENDENCY:** Complete Tasks 6, 7, and 8 first. This task imports the new dialog components/props defined in those tasks.

**Files:**
- Modify: `components/AdminMagazinesClient.tsx`

- [ ] **Step 1: Rewrite the entire component**

Replace the full file content with the branch-aware inventory view. This is a complete rewrite — the old component operated on `MagazineWithCount[]` and the new one operates on `BranchMagazineWithDetails[]`.

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { BranchMagazineWithDetails } from '@/types'
import { Plus, Pencil, BookMarked } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CADENCE_LABELS } from '@/lib/cadence'
import CreateMagazineDialog from './CreateMagazineDialog'
import EditMagazineDialog from './EditMagazineDialog'
import AdminMagazineDeleteDialog from './AdminMagazineDeleteDialog'

export interface AdminMagazinesClientProps {
  magazines: BranchMagazineWithDetails[]
  branchId: string
  page: number
  totalPages: number
}

export default function AdminMagazinesClient({ magazines, branchId, page, totalPages }: AdminMagazinesClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function toggleActive(sub: BranchMagazineWithDetails) {
    setTogglingId(sub.id)
    try {
      const res = await fetch(`/api/branches/${branchId}/magazines/${sub.magazineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !sub.active }),
      })
      if (res.ok) {
        toast.success(`${sub.magazine.name} ${sub.active ? 'deactivated' : 'activated'}`)
        router.refresh()
      } else {
        toast.error('Failed to update status')
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function removeFromBranch(sub: BranchMagazineWithDetails) {
    const res = await fetch(`/api/branches/${branchId}/magazines/${sub.magazineId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${sub.magazine.name} removed from branch`)
      setDeleteTarget(null)
      router.refresh()
    } else {
      toast.error('Failed to remove subscription')
    }
  }

  async function deleteEntirely(sub: BranchMagazineWithDetails) {
    const res = await fetch(`/api/magazines/${sub.magazineId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${sub.magazine.name} deleted entirely`)
      setDeleteTarget(null)
      router.refresh()
    } else {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error || 'Failed to delete magazine')
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <Plus size={16} /> Add Magazine
        </Button>
      </div>

      {magazines.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookMarked size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No magazines at this branch
          </p>
          <p className="text-sm mt-1">Click &quot;Add Magazine&quot; to subscribe one.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Name', 'Cadence', 'Qty', 'Total Issues', 'Last Received', 'Next Expected', 'Status', 'Notes', 'Actions'].map((h) => (
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
              {magazines.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{
                    borderColor: 'oklch(0.900 0.012 88)',
                    opacity: sub.active ? 1 : 0.55,
                  }}
                >
                  <TableCell>
                    <span
                      className="font-medium"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {sub.magazine.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                        color: 'oklch(0.38 0.082 156)',
                        borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                      }}
                    >
                      {CADENCE_LABELS[sub.magazine.cadence]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {sub.quantity}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {sub.totalIssues}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.lastReceivedDate
                        ? format(new Date(sub.lastReceivedDate), 'MMM d, yyyy')
                        : 'Never'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.nextExpectedDate
                        ? format(new Date(sub.nextExpectedDate), 'MMM d, yyyy')
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={sub.active}
                      onCheckedChange={() => toggleActive(sub)}
                      disabled={togglingId === sub.id}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm italic" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.magazine.notes || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditTarget(sub)}
                        title="Edit"
                      >
                        <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(sub)}
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.56 0.225 27)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <a
              href={`?page=${page - 1}`}
              className="px-4 py-2 rounded-md text-sm border transition-colors hover:bg-black/[0.04]"
              style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.38 0.082 156)' }}
            >
              ← Previous
            </a>
          )}
          <span className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`?page=${page + 1}`}
              className="px-4 py-2 rounded-md text-sm border transition-colors hover:bg-black/[0.04]"
              style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.38 0.082 156)' }}
            >
              Next →
            </a>
          )}
        </div>
      )}

      <CreateMagazineDialog open={createOpen} onOpenChange={setCreateOpen} branchId={branchId} />

      {editTarget && (
        <EditMagazineDialog
          subscription={editTarget}
          branchId={branchId}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        />
      )}

      {deleteTarget && (
        <AdminMagazineDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
          magazineName={deleteTarget.magazine.name}
          onRemoveFromBranch={() => removeFromBranch(deleteTarget)}
          onDeleteEntirely={() => deleteEntirely(deleteTarget)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AdminMagazinesClient.tsx
git commit -m "feat(admin): rewrite magazines client for branch inventory view with Switch + pagination"
```

---

## Task 7: Rewrite CreateMagazineDialog with Quantity + Branch

**Files:**
- Modify: `components/CreateMagazineDialog.tsx`

- [ ] **Step 1: Rewrite the dialog to include quantity and two-step create**

Replace the entire file:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { CADENCE_LABELS } from '@/lib/cadence'

export interface CreateMagazineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: string
}

const CADENCES = Object.entries(CADENCE_LABELS)

export default function CreateMagazineDialog({ open, onOpenChange, branchId }: CreateMagazineDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [notes, setNotes] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)

  function reset() {
    setName('')
    setCadence('')
    setNotes('')
    setQuantity(1)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cadence) return
    setLoading(true)

    try {
      // Step 1: Create the global magazine record
      const magRes = await fetch('/api/magazines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cadence, notes: notes.trim() || null }),
      })

      const magData = (await magRes.json()) as { id?: string; error?: string }
      if (!magRes.ok) {
        toast.error(magData.error || 'Failed to create magazine')
        return
      }

      // Step 2: Subscribe to the active branch
      const subRes = await fetch(`/api/branches/${branchId}/magazines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magazineId: magData.id, quantity }),
      })

      if (!subRes.ok) {
        toast.error('Magazine created but failed to subscribe to branch. You can retry from the edit view.')
      } else {
        toast.success(`${name} added to the collection`)
      }

      onOpenChange(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Add New Magazine</DialogTitle>
          <DialogDescription>Add a periodical to this branch&apos;s collection.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="mag-name">Magazine Name</Label>
            <Input
              id="mag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Economist"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-cadence">Delivery Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v ?? '')} required>
              <SelectTrigger id="mag-cadence">
                <SelectValue placeholder="Select cadence…" />
              </SelectTrigger>
              <SelectContent>
                {CADENCES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-quantity">Quantity</Label>
            <Input
              id="mag-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="mag-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this publication…"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !cadence}
              className="gap-2"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                <><Plus size={15} /> Add Magazine</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CreateMagazineDialog.tsx
git commit -m "feat(admin): add quantity field and two-step create (global + branch subscription)"
```

---

## Task 8: Rewrite EditMagazineDialog with Branch-Specific Fields

**Files:**
- Modify: `components/EditMagazineDialog.tsx`

- [ ] **Step 1: Rewrite the dialog to include global + branch fields**

Replace the entire file:

```tsx
'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Loader2, Save } from 'lucide-react'
import type { BranchMagazineWithDetails } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { CADENCE_LABELS } from '@/lib/cadence'

export interface EditMagazineDialogProps {
  subscription: BranchMagazineWithDetails
  branchId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CADENCES = Object.entries(CADENCE_LABELS)

export default function EditMagazineDialog({ subscription, branchId, open, onOpenChange }: EditMagazineDialogProps) {
  const router = useRouter()

  // Global fields
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [notes, setNotes] = useState('')

  // Branch-specific fields
  const [quantity, setQuantity] = useState(1)
  const [lastReceivedDate, setLastReceivedDate] = useState('')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (subscription) {
      setName(subscription.magazine.name)
      setCadence(subscription.magazine.cadence)
      setNotes(subscription.magazine.notes || '')
      setQuantity(subscription.quantity)
      setLastReceivedDate(
        subscription.lastReceivedDate
          ? format(new Date(subscription.lastReceivedDate), 'yyyy-MM-dd')
          : ''
      )
    }
  }, [subscription])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    try {
      // Update global magazine fields
      const magRes = await fetch(`/api/magazines/${subscription.magazineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cadence, notes: notes.trim() || null }),
      })

      if (!magRes.ok) {
        const data = (await magRes.json()) as { error?: string }
        toast.error(data.error || 'Failed to update magazine')
        return
      }

      // Update branch subscription (quantity)
      const subRes = await fetch(`/api/branches/${branchId}/magazines/${subscription.magazineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })

      if (!subRes.ok) {
        toast.error('Magazine updated but failed to update branch subscription')
      }

      // If lastReceivedDate changed, insert a new receipt
      const originalDate = subscription.lastReceivedDate
        ? format(new Date(subscription.lastReceivedDate), 'yyyy-MM-dd')
        : ''
      if (lastReceivedDate && lastReceivedDate !== originalDate) {
        const receiptRes = await fetch(`/api/magazines/${subscription.magazineId}/receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivedDate: new Date(lastReceivedDate).toISOString(),
            branchId,
            notes: 'Manually adjusted by admin',
          }),
        })

        if (!receiptRes.ok) {
          toast.error('Magazine updated but failed to set last received date')
        }
      }

      toast.success(`${name} updated`)
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Edit Magazine</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Global magazine fields */}
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Magazine Details
          </p>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CADENCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Separator />

          {/* Branch-specific fields */}
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Branch Subscription
          </p>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Last Received Date</Label>
            <Input
              type="date"
              value={lastReceivedDate}
              onChange={(e) => setLastReceivedDate(e.target.value)}
            />
            <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Changing this will create a new receipt record.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gap-2"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              {loading ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/EditMagazineDialog.tsx
git commit -m "feat(admin): edit dialog with global + branch fields and last received date"
```

---

## Task 10: Branch Selection at Login

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `components/LoginForm.tsx`

- [ ] **Step 1: Pass branches from server component to LoginForm**

Replace `app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from 'next'
import db from '@/lib/db'
import LoginForm from '@/components/LoginForm'
import type { Branch } from '@/types'

export const metadata: Metadata = { title: 'Sign In — EPL Magazine Tracker' }

export default async function LoginPage() {
  const branches = await db.branch.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, active: true, createdAt: true },
  }) as Branch[]

  return (
    <div className="min-h-screen flex">
      {/* Left panel — library identity */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12"
        style={{ backgroundColor: 'oklch(0.215 0.058 158)' }}
      >
        <div>
          <div className="mb-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/epl-logo-white.png"
              alt="Edison Public Library"
              className="h-14 w-auto"
            />
          </div>

          <h1
            className="text-4xl font-bold leading-tight mb-6"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.978 0.009 88)' }}
          >
            Keeping the collection current
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'oklch(0.72 0.025 155)' }}>
            Track magazine arrivals, flag overdue issues, and know exactly what to expect each week — all in one place.
          </p>
        </div>

        <div className="border-t pt-8" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
          <p className="text-sm italic" style={{ color: 'oklch(0.62 0.025 155)' }}>
            &quot;A library is not a luxury but one of the necessities of life.&quot;
          </p>
          <p className="text-xs mt-2" style={{ color: 'oklch(0.50 0.025 155)' }}>
            — Henry Ward Beecher
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/epl-logo-white.png"
              alt="Edison Public Library"
              className="h-10 w-auto brightness-0"
            />
          </div>

          <h2
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            Welcome back
          </h2>
          <p className="text-sm mb-8" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Sign in to manage the magazine collection
          </p>

          <LoginForm branches={branches} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add branch dropdown to LoginForm**

Replace `components/LoginForm.tsx`:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Branch } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'

export interface LoginFormProps {
  branches: Branch[]
}

export default function LoginForm({ branches }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (!branchId) {
      setError('Please select a branch')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      // Set the branch cookie (same mechanism as BranchSelector)
      document.cookie = `epl-active-branch=${branchId}; path=/; max-age=${365 * 24 * 60 * 60}`

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert variant="destructive" className="py-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email" style={{ color: 'oklch(0.30 0.028 62)' }}>
          Email address
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@edisonpubliclibrary.org"
          required
          autoComplete="email"
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" style={{ color: 'oklch(0.30 0.028 62)' }}>
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="branch" style={{ color: 'oklch(0.30 0.028 62)' }}>
          Branch
        </Label>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger id="branch" className="h-11">
            <SelectValue placeholder="Select your branch…" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-medium gap-2"
        disabled={loading}
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> Signing in…</>
        ) : (
          <><LogIn size={16} /> Sign In</>
        )}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/login/page.tsx components/LoginForm.tsx
git commit -m "feat(auth): add required branch selection at login"
```

---

## Task 11: User Profile Page + API

**Files:**
- Create: `app/api/users/profile/route.ts`
- Create: `app/(dashboard)/profile/page.tsx`
- Create: `components/ProfileClient.tsx`

- [ ] **Step 1: Create the profile API route**

```ts
import type { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

interface UpdateProfileBody {
  name?: string
  currentPassword?: string
  newPassword?: string
}

/**
 * PUT /api/users/profile
 * Updates the current user's name and/or password.
 * Password change requires current password verification.
 */
export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const session = await verifySession()
    const body = (await request.json()) as UpdateProfileBody

    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

    const updates: { name?: string; passwordHash?: string } = {}
    const auditDetails: string[] = []

    // Name update
    if (body.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
      updates.name = trimmed
      auditDetails.push('name')
    }

    // Password update
    if (body.currentPassword && body.newPassword) {
      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
      if (!valid) return Response.json({ error: 'Current password is incorrect' }, { status: 400 })

      if (body.newPassword.length < 8) {
        return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      updates.passwordHash = await bcrypt.hash(body.newPassword, 10)
      auditDetails.push('password')
    } else if (body.currentPassword || body.newPassword) {
      return Response.json({ error: 'Both currentPassword and newPassword are required' }, { status: 400 })
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No changes provided' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data: updates,
      select: { id: true, name: true, email: true, role: true, active: true },
    })

    for (const detail of auditDetails) {
      if (detail === 'name') {
        auditLog(session.userId, 'USER_NAME_CHANGED', { oldName: user.name, newName: updates.name })
      } else if (detail === 'password') {
        auditLog(session.userId, 'USER_PASSWORD_CHANGED', {})
      }
    }

    return Response.json(updated)
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the ProfileClient component**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { AuthUser } from '@/types'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export interface ProfileClientProps {
  user: AuthUser
}

export default function ProfileClient({ user }: ProfileClientProps) {
  const router = useRouter()

  // Name form
  const [name, setName] = useState(user.name)
  const [nameSaving, setNameSaving] = useState(false)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const passwordsMatch = newPassword === confirmPassword
  const passwordValid = newPassword.length >= 8

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setNameSaving(true)

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to update name')
        return
      }

      toast.success('Name updated')
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setNameSaving(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!passwordsMatch || !passwordValid) return
    setPasswordSaving(true)

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to update password')
        return
      }

      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* User info */}
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
          style={{ backgroundColor: 'oklch(0.38 0.082 156 / 0.12)', color: 'oklch(0.38 0.082 156)' }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-medium" style={{ color: 'oklch(0.15 0.028 62)' }}>{user.name}</p>
          <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>{user.email}</p>
          <Badge
            variant="outline"
            className="text-xs mt-1 border-0"
            style={{
              backgroundColor: user.role === 'ADMIN'
                ? 'oklch(0.95 0.06 85)'
                : 'oklch(0.92 0.050 155)',
              color: user.role === 'ADMIN'
                ? 'oklch(0.45 0.15 78)'
                : 'oklch(0.38 0.082 156)',
            }}
          >
            {user.role}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Change name */}
      <form onSubmit={handleNameSubmit} className="space-y-3">
        <h2
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Change Name
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={nameSaving || name.trim() === user.name}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          {nameSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Name</>}
        </Button>
      </form>

      <Separator />

      {/* Change password */}
      <form onSubmit={handlePasswordSubmit} className="space-y-3">
        <h2
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Change Password
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">Current Password</Label>
          <Input
            id="current-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New Password</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {newPassword && !passwordValid && (
            <p className="text-xs text-red-500">Must be at least 8 characters</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-pw">Confirm New Password</Label>
          <Input
            id="confirm-pw"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={passwordSaving || !passwordsMatch || !passwordValid || !currentPassword}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          {passwordSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Update Password</>}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Create the profile page server component**

```tsx
import type { Metadata } from 'next'
import { getUser } from '@/lib/dal'
import ProfileClient from '@/components/ProfileClient'

export const metadata: Metadata = { title: 'Profile — EPL Magazine Tracker' }

export default async function ProfilePage() {
  const user = await getUser()

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Profile
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          Manage your account settings
        </p>
      </div>

      <ProfileClient user={user} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/users/profile/route.ts components/ProfileClient.tsx app/(dashboard)/profile/page.tsx
git commit -m "feat: add user profile page with name and password change"
```

---

## Task 12: Make Sidebar User Badge Clickable

**Files:**
- Modify: `components/Sidebar.tsx:148-173`

- [ ] **Step 1: Wrap the user badge section with a Link**

In `components/Sidebar.tsx`, replace the user info `<div>` block (lines 149-173) with a Link:

```tsx
        <Link
          href="/profile"
          className="flex items-center gap-3 px-1 rounded-md transition-colors hover:bg-white/5"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: 'oklch(0.30 0.065 158)', color: CREAM }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
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
        </Link>
```

Note: `Link` is already imported at line 4.

- [ ] **Step 2: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(ui): make sidebar user badge clickable, links to /profile"
```

---

## Task 13: Resolve Magazine/Branch IDs in Audit Log

**Files:**
- Modify: `app/(dashboard)/log/page.tsx:80-86`

- [ ] **Step 1: Add magazine and branch ID resolution**

After the existing user name resolution block (lines 81-85), add magazine and branch resolution:

```ts
  // Resolve magazine names for visible log entries
  const magazineIds = [...new Set(
    logs.flatMap((e) => [e.magazineId as string | undefined]).filter(Boolean)
  )] as string[]
  const magazines = magazineIds.length > 0
    ? await db.magazine.findMany({ where: { id: { in: magazineIds } }, select: { id: true, name: true } })
    : []
  const magazineNameMap = new Map(magazines.map((m) => [m.id, m.name]))

  // Resolve branch names for visible log entries
  const branchIds = [...new Set(
    logs.flatMap((e) => [e.branchId as string | undefined]).filter(Boolean)
  )] as string[]
  const branchesForLog = branchIds.length > 0
    ? await db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
    : []
  const branchNameMap = new Map(branchesForLog.map((b) => [b.id, b.name]))
```

- [ ] **Step 2: Replace IDs with names in the details column**

Replace the `detailStr` construction (lines 130-132) with a version that resolves IDs:

```ts
                  const detailStr = Object.entries(details)
                    .filter(([k]) => !k.endsWith('Id'))
                    .map(([k, v]) => {
                      if (k === 'magazineName') return `magazine: ${v}`
                      if (k === 'branchName') return `branch: ${v}`
                      return `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`
                    })
                    .join('  ·  ')

                  // Resolve any remaining IDs that have name maps
                  const resolvedParts: string[] = []
                  if (details.magazineId && !details.magazineName) {
                    const name = magazineNameMap.get(details.magazineId as string)
                    if (name) resolvedParts.push(`magazine: ${name}`)
                  }
                  if (details.branchId && !details.branchName) {
                    const name = branchNameMap.get(details.branchId as string)
                    if (name) resolvedParts.push(`branch: ${name}`)
                  }
                  const fullDetails = [...resolvedParts, detailStr].filter(Boolean).join('  ·  ')
```

Then update the Details cell to render `fullDetails` instead of `detailStr`:

```tsx
                      <TableCell>
                        <span className="text-xs" style={{ color: 'oklch(0.45 0.030 72)' }}>
                          {fullDetails || '—'}
                        </span>
                      </TableCell>
```

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/log/page.tsx
git commit -m "feat(log): resolve magazine and branch IDs to names in audit log display"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Build the project to check for type errors**

```bash
npx next build --no-lint 2>&1 | tail -20
```

Expected: Build succeeds with no type errors.

- [ ] **Step 2: Start the dev server and manually verify**

```bash
npm run dev
```

Verify in browser:
1. Login page shows branch dropdown (required)
2. Admin magazines page shows branch inventory with all columns
3. Pagination works on admin magazines
4. Create magazine includes quantity field
5. Edit magazine shows global + branch sections
6. Delete offers two options
7. Toggle switches animate on both admin pages
8. Buttons disable during API calls
9. Sidebar user badge links to /profile
10. Profile page allows name + password change
11. Audit log shows names instead of IDs

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address any build or runtime issues from integration"
```
