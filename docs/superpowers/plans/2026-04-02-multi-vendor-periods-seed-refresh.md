# Multi-Vendor Subscription Periods & Seed Data Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support N parallel subscription periods with independent lifecycles, refresh seed data from Jan 2025+ across all branches.

**Architecture:** Rewrite the period system from "one active period globally" to "N active periods, one per magazine." Remove sidebar period selector; auto-deactivate expired periods on page load; move period filtering to individual pages. Refresh all seed data from EBSCO invoices and spreadsheets.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/SQLite, shadcn/ui, Tailwind CSS, Zod, date-fns, Python (openpyxl for extraction)

**Spec:** `docs/superpowers/specs/2026-04-02-multi-vendor-periods-seed-refresh-design.md`

---

## File Map

### Modified Files

| File | Responsibility |
|---|---|
| `types/index.ts` | Add new audit actions |
| `lib/period.ts` | Remove cookie logic, add `deactivateExpiredPeriods()`, add `getActivePeriods()` |
| `lib/validations.ts` | Add `copyFromPeriodId` to create schema |
| `lib/cadence.ts` | No changes (already supports per-magazine period start) |
| `lib/reports.ts` | Add magazine name filter to `parseReportFilters()` and all query functions |
| `app/(dashboard)/layout.tsx` | Call `deactivateExpiredPeriods()`, remove period selector props, add warning banner |
| `components/Sidebar.tsx` | Remove PeriodSelector import and rendering |
| `app/(dashboard)/dashboard/page.tsx` | Multi-period progress bars, combined Expected/Overdue with badges |
| `app/api/subscription-periods/route.ts` | Remove auto-activate, remove overlap check, add "Same as" copy |
| `app/api/subscription-periods/[id]/route.ts` | Replace global deactivation with per-magazine conflict check, bulk activate/deactivate subscriptions |
| `components/CreatePeriodDialog.tsx` | Replace with vendor-neutral dialog, add "Same as" dropdown |
| `components/SubscriptionManagement.tsx` | Add conflict check awareness to add/toggle actions |
| `app/(dashboard)/admin/subscriptions/page.tsx` | Pass periods list to CreatePeriodDialog |
| `app/(dashboard)/admin/subscriptions/[id]/page.tsx` | Add activate/deactivate button |
| `app/(dashboard)/admin/magazines/page.tsx` | Add Period column, period dropdown in edit form |
| `app/(dashboard)/magazines/[id]/page.tsx` | Period badge, scope receipts to magazine's period |
| `components/ReportsClient.tsx` | Move period dropdown onto page, add magazine name search filter |
| `prisma/seed.ts` | Create two periods, assign magazines correctly |
| `prisma/extract-receipts.py` | Parse CB files, change date cutoff to Jan 2025 |

### Deleted Files

| File | Reason |
|---|---|
| `components/PeriodSelector.tsx` | Global period selector removed |

---

## Task 1: Types & Audit Actions

**Files:**
- Modify: `types/index.ts:246-272`

- [ ] **Step 1: Add new audit actions to AuditAction type**

Add to the `AuditAction` type union:

```typescript
| 'PERIOD_ACTIVATED'
| 'PERIOD_DEACTIVATED'
| 'PERIOD_AUTO_DEACTIVATED'
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add period lifecycle audit actions"
```

---

## Task 2: Period Lifecycle — `lib/period.ts`

**Files:**
- Modify: `lib/period.ts`

- [ ] **Step 1: Remove cookie-based functions, add new exports**

Remove:
- `getActivePeriodId()` (reads cookie)
- `resolveActivePeriodId()` (cookie fallback logic)
- `resolveActivePeriod()` (returns single period)
- `PERIOD_COOKIE` constant

Keep:
- `getSubscriptionPeriods()` — still needed

Add new functions:

```typescript
import { withRetry } from '@/lib/db-retry'
import { auditLog } from '@/lib/logger'

/** Returns all currently active subscription periods. */
export async function getActivePeriods(): Promise<SubscriptionPeriod[]> {
  const periods = await prisma.subscriptionPeriod.findMany({
    where: { active: true },
    orderBy: { startDate: 'desc' },
  })
  return periods
}

/**
 * Auto-deactivates periods whose endDate has passed.
 * Also bulk-deactivates all MagazineSubscription records for those periods.
 * Called in dashboard layout before data fetching.
 */
export async function deactivateExpiredPeriods(): Promise<void> {
  const now = new Date()
  const expired = await prisma.subscriptionPeriod.findMany({
    where: { active: true, endDate: { lt: now } },
  })

  for (const period of expired) {
    await withRetry(async () => {
      await prisma.$transaction([
        prisma.subscriptionPeriod.update({
          where: { id: period.id },
          data: { active: false },
        }),
        prisma.magazineSubscription.updateMany({
          where: { periodId: period.id },
          data: { active: false },
        }),
      ])
    })
    auditLog('system', 'PERIOD_AUTO_DEACTIVATED' as AuditAction, {
      periodName: period.name,
      periodId: period.id,
      endDate: period.endDate,
    })
  }
}

/**
 * Checks if any magazines in a period conflict with other active periods.
 * Returns array of {magazineId, magazineName, conflictingPeriodName}.
 */
export async function checkPeriodActivationConflicts(periodId: string): Promise<
  { magazineId: string; magazineName: string; conflictingPeriodName: string }[]
> {
  const subscriptions = await prisma.magazineSubscription.findMany({
    where: { periodId },
    include: { magazine: { select: { id: true, name: true } } },
  })

  const conflicts: { magazineId: string; magazineName: string; conflictingPeriodName: string }[] = []

  for (const sub of subscriptions) {
    const existing = await prisma.magazineSubscription.findFirst({
      where: {
        magazineId: sub.magazineId,
        active: true,
        period: { active: true },
        NOT: { periodId },
      },
      include: { period: { select: { name: true } } },
    })
    if (existing) {
      conflicts.push({
        magazineId: sub.magazineId,
        magazineName: sub.magazine.name,
        conflictingPeriodName: existing.period.name,
      })
    }
  }
  return conflicts
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/period.ts
git commit -m "feat: multi-period lifecycle functions, remove cookie-based period selection"
```

---

## Task 3: API Route — POST Subscription Periods

**Files:**
- Modify: `app/api/subscription-periods/route.ts:35-138`
- Modify: `lib/validations.ts:121-125`

- [ ] **Step 1: Update create schema to accept optional `copyFromPeriodId`**

In `lib/validations.ts`, update `createSubscriptionPeriodSchema`:

```typescript
export const createSubscriptionPeriodSchema = z.object({
  name: z.string().min(1, 'Name required').max(50),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  copyFromPeriodId: z.string().optional(),
})
```

- [ ] **Step 2: Rewrite POST handler**

Replace the POST handler in `app/api/subscription-periods/route.ts`:

Key changes:
- Remove overlapping date range validation (lines 56-66)
- Remove auto-activation of new period (create as `active: false`)
- Remove deactivation of previous active period
- Implement "Same as" copy: if `copyFromPeriodId` provided, bulk-copy subscriptions as inactive
- All copied `MagazineSubscription` records get `active: false`

```typescript
// POST handler outline:
// 1. Validate input with createSubscriptionPeriodSchema
// 2. Normalize dates to noon UTC
// 3. Transaction:
//    a. Create period with active: false
//    b. If copyFromPeriodId, fetch source subscriptions
//    c. Bulk-create copied subscriptions (all active: false)
// 4. Audit log: PERIOD_CREATED (and SUBSCRIPTIONS_BULK_COPIED if copied)
// 5. Return 201
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Manual test — create period with "Same as"**

1. Go to `/admin/subscriptions`
2. Create a new period with "Same as" = existing period
3. Verify: new period is inactive, subscriptions are copied as inactive
4. Create a period with "Same as" = None
5. Verify: new period is inactive, no subscriptions

- [ ] **Step 5: Commit**

```bash
git add app/api/subscription-periods/route.ts lib/validations.ts
git commit -m "feat: period creation with 'Same as' copy, remove auto-activation"
```

---

## Task 4: API Route — PUT Subscription Period (Activate/Deactivate)

**Files:**
- Modify: `app/api/subscription-periods/[id]/route.ts:41-114`

- [ ] **Step 1: Rewrite PUT handler activation/deactivation logic**

Replace the current "deactivate all other periods" behavior:

Key changes:
- When `active: true` (activation):
  1. Call `checkPeriodActivationConflicts(id)` from `lib/period.ts`
  2. If conflicts, return 409 with conflict details
  3. If clean, in a transaction: set period active, bulk-set all subscriptions active
  4. Audit log: PERIOD_ACTIVATED
- When `active: false` (deactivation):
  1. In a transaction: set period inactive, bulk-set all subscriptions inactive
  2. Audit log: PERIOD_DEACTIVATED
- Remove overlapping date range check from name/date updates
- Keep other update fields (name, startDate, endDate) as-is

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Manual test — activate period with conflicts**

1. Have two periods with the same magazine
2. Activate first period (should succeed)
3. Try to activate second period (should return 409 with conflict list)
4. Remove conflicting magazine from second period
5. Activate second period (should succeed)

- [ ] **Step 4: Manual test — deactivate period**

1. Deactivate an active period
2. Verify all its MagazineSubscription records are now inactive

- [ ] **Step 5: Commit**

```bash
git add app/api/subscription-periods/[id]/route.ts
git commit -m "feat: per-magazine conflict check on period activation, bulk deactivate"
```

---

## Task 5: API Route — Subscription Conflict Check on Add/Toggle

**Files:**
- Modify: `app/api/subscription-periods/[id]/subscriptions/route.ts:53-107`
- Modify: `app/api/subscription-periods/[id]/subscriptions/[subId]/route.ts:15-82`

- [ ] **Step 1: Add conflict check to POST (add magazine to period)**

In the POST handler for adding a subscription, after checking for duplicates:
- If the period is active, check if the magazine already has an active subscription in another active period
- If conflict, return 409 with details
- If period is inactive, skip check (inactive subscriptions don't conflict)

- [ ] **Step 2: Add conflict check to PUT (toggle active)**

In the PUT handler for updating a subscription:
- If setting `active: true`, check for conflicts with other active periods
- If conflict, return 409

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/subscription-periods/[id]/subscriptions/route.ts app/api/subscription-periods/[id]/subscriptions/[subId]/route.ts
git commit -m "feat: conflict check when adding or reactivating magazine subscriptions"
```

---

## Task 6: Sidebar & Layout — Remove Period Selector, Add Auto-Deactivation

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/Sidebar.tsx`
- Delete: `components/PeriodSelector.tsx`

- [ ] **Step 1: Update dashboard layout**

In `app/(dashboard)/layout.tsx`:
- Remove `resolveActivePeriodId()` from the parallel fetch
- Remove `getSubscriptionPeriods()` from the parallel fetch (no longer needed by sidebar)
- Add `deactivateExpiredPeriods()` call at the top of the function (before other fetches)
- Add `getActivePeriods()` fetch for warning banner check
- Remove `periods` and `activePeriodId` props from Sidebar
- Add warning banner JSX when `activePeriods.length === 0`:

```tsx
{activePeriods.length === 0 && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-800 text-sm">
    No active subscription periods. Contact an admin to create or activate one.
  </div>
)}
```

- [ ] **Step 2: Update Sidebar component**

In `components/Sidebar.tsx`:
- Remove `PeriodSelector` import
- Remove `periods` and `activePeriodId` from props interface
- Remove PeriodSelector rendering (around line 215)

- [ ] **Step 3: Delete PeriodSelector**

Delete `components/PeriodSelector.tsx`.

- [ ] **Step 4: Fix ALL remaining imports of removed functions**

Search for imports of `resolveActivePeriodId`, `resolveActivePeriod`, `getActivePeriodId`, `PERIOD_COOKIE` across the codebase. **Every file below must be stubbed to maintain a compilable state** (each will be fully rewritten in its own later task):

- `app/(dashboard)/dashboard/page.tsx` — uses `resolveActivePeriod()`. Stub: replace with `getActivePeriods()` returning an empty array, comment `// TODO: Task 8 rewrites this`
- `app/(dashboard)/magazines/page.tsx` — may import period functions. Stub: remove period import and usage, comment `// TODO: Task 11 scopes to per-magazine period`
- `app/(dashboard)/magazines/[id]/page.tsx` — uses `resolveActivePeriod()`. Stub: remove import, hardcode period to null, comment `// TODO: Task 11 rewrites this`
- `app/(dashboard)/admin/reports/page.tsx` — uses period functions for report scoping. Stub: remove period prop, comment `// TODO: Task 12 adds per-page period filter`
- `components/ReportsClient.tsx` — may reference period cookie. Stub if needed, comment `// TODO: Task 12 rewrites this`

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove sidebar period selector, add auto-deactivation and warning banner"
```

---

## Task 7: CreatePeriodDialog — "Same as" Dropdown

**Files:**
- Modify: `components/CreatePeriodDialog.tsx`
- Modify: `app/(dashboard)/admin/subscriptions/page.tsx`

- [ ] **Step 1: Update admin subscriptions page to pass periods list**

In `app/(dashboard)/admin/subscriptions/page.tsx`:
- The page already fetches periods — pass the full list to `CreatePeriodDialog`

- [ ] **Step 2: Rewrite CreatePeriodDialog**

Replace the dialog content:
- Remove EBSCO-specific language ("Define a new EBSCO billing cycle period")
- Replace with vendor-neutral: "Create a new subscription period"
- Add props: `periods: SubscriptionPeriod[]`
- Fields:
  - `name` — placeholder: `e.g., Ebsco-25/26, Wtcox-25`
  - `startDate`, `endDate` — date pickers (keep existing)
  - **"Same as" Select**: options = `[None, ...periods.map(p => p.name)]`
    - Value: `copyFromPeriodId` (the selected period's ID, or empty)
- Remove the info box about auto-copying
- Add info text when "Same as" is selected: "Subscriptions from {periodName} will be copied as inactive."
- Submit sends: `{ name, startDate, endDate, copyFromPeriodId }` to POST endpoint

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Manual test**

1. Open create dialog, verify "Same as" dropdown shows all periods
2. Select "None" — create period, verify empty
3. Select an existing period — create, verify subscriptions copied as inactive
4. Verify placeholder text shows on name field

- [ ] **Step 5: Commit**

```bash
git add components/CreatePeriodDialog.tsx app/(dashboard)/admin/subscriptions/page.tsx
git commit -m "feat: vendor-neutral period creation with 'Same as' copy dropdown"
```

---

## Task 8: Dashboard — Multi-Period Progress & Combined Cards

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

This is the largest UI change. The dashboard must show:
1. Progress bars per active period (top)
2. Combined Expected This Week + Overdue sections with period badges

- [ ] **Step 1: Rewrite dashboard data fetching**

Replace the single-period query with multi-period logic:

```typescript
// Fetch all active periods
const activePeriods = await getActivePeriods()
const activeBranchId = await resolveActiveBranchId()

// For each active period, compute progress + per-magazine status
const periodData = await Promise.all(activePeriods.map(async (period) => {
  // Fetch magazines subscribed at this branch for this period
  const subscriptions = await prisma.magazineSubscription.findMany({
    where: {
      periodId: period.id,
      active: true,
      magazine: {
        branches: { some: { branchId: activeBranchId, active: true } },
      },
    },
    include: {
      magazine: {
        include: {
          receipts: {
            where: { branchId: activeBranchId },
            orderBy: { receivedDate: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  // Compute status for each magazine
  let totalIssues = 0
  let totalReceived = 0
  const magazineCards = []

  for (const sub of subscriptions) {
    const receiptCount = await prisma.issueReceipt.count({
      where: {
        magazineId: sub.magazineId,
        branchId: activeBranchId,
        receivedDate: { gte: period.startDate, lte: period.endDate },
      },
    })
    totalIssues += sub.issuesPerYear
    totalReceived += receiptCount

    const lastReceipt = sub.magazine.receipts[0] ?? null
    const status = getSubscriptionAwareStatus(
      lastReceipt?.receivedDate ?? null,
      sub.magazine.cadence,
      receiptCount,
      sub.issuesPerYear,
      period.startDate,
    )

    if (status === 'overdue' || status === 'this_week') {
      magazineCards.push({
        magazine: sub.magazine,
        status,
        periodName: period.name,
        lastReceivedDate: lastReceipt?.receivedDate ?? null,
        nextExpectedDate: computeNextExpectedDate(
          lastReceipt?.receivedDate ?? period.startDate,
          sub.magazine.cadence,
        ),
      })
    }
  }

  return {
    period,
    totalIssues,
    totalReceived,
    magazineCards,
  }
}))
```

- [ ] **Step 2: Render progress bars**

One card per active period at the top of the dashboard:

```tsx
{periodData.map(({ period, totalIssues, totalReceived }) => (
  <div key={period.id} className="...">
    <div className="flex justify-between text-sm">
      <span>Subscription Progress — {period.name}</span>
      <span>{totalReceived}/{totalIssues}</span>
    </div>
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.min(100, (totalReceived / totalIssues) * 100)}%` }}
      />
    </div>
  </div>
))}
```

- [ ] **Step 3: Render combined Expected/Overdue with period badges**

Combine all `magazineCards` from all periods, sort by status then date:

```tsx
// Combine and sort
const allOverdue = periodData.flatMap(d => d.magazineCards.filter(c => c.status === 'overdue'))
const allThisWeek = periodData.flatMap(d => d.magazineCards.filter(c => c.status === 'this_week'))

// Each card renders with a period badge
<Badge variant="outline" className="text-xs">{card.periodName}</Badge>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Manual test**

1. With two active periods, verify two progress bars appear
2. Verify Expected This Week combines magazines from both periods
3. Verify Overdue combines magazines from both periods
4. Verify period badges appear on each card
5. With zero active periods, verify warning banner shows

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx
git commit -m "feat: multi-period dashboard with progress bars and period badges"
```

---

## Task 9: Admin Subscriptions Detail — Activate/Deactivate Button

**Files:**
- Modify: `app/(dashboard)/admin/subscriptions/[id]/page.tsx`

- [ ] **Step 1: Add activate/deactivate UI**

Add a button next to the period status display:
- If period is inactive: green "Activate" button
- If period is active: red "Deactivate" button
- Both trigger a `PUT /api/subscription-periods/[id]` with `{ active: true/false }`
- On 409 (conflicts): show a dialog listing conflicting magazines and which periods they're in
- On success: `router.refresh()` and toast

This should be a small client component (e.g., `PeriodActivationButton`) embedded in the server page, receiving `periodId`, `isActive`, and initial conflict data as props.

- [ ] **Step 2: Update SubscriptionManagement.tsx to handle 409 conflicts**

In `components/SubscriptionManagement.tsx`:
- When the add-subscription or toggle-active API calls return 409, parse the conflict details from the response body
- Show a meaningful error toast: "Magazine {name} is already active in period {periodName}"
- Don't show generic error for 409 — show the specific conflict

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Manual test**

1. Activate an inactive period with no conflicts — succeeds
2. Activate a period with conflicts — shows conflict dialog
3. Deactivate an active period — succeeds, subscriptions go inactive
4. Try to add/reactivate a magazine that conflicts — meaningful error shown

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/admin/subscriptions/[id]/page.tsx components/SubscriptionManagement.tsx
git commit -m "feat: activate/deactivate button on period detail page with conflict handling"
```

---

## Task 10: Admin Magazines — Period Column & Assignment

**Files:**
- Modify: `app/(dashboard)/admin/magazines/page.tsx`

- [ ] **Step 1: Add Period column to magazine list**

In the magazine query, include the magazine's most recent subscription with period:

```typescript
const magazineSub = await prisma.magazineSubscription.findFirst({
  where: { magazineId: magazine.id },
  orderBy: { createdAt: 'desc' },
  include: { period: { select: { name: true, active: true } } },
})
```

Add a "Period" column showing `magazineSub?.period.name` as a badge, or "—" if none.

- [ ] **Step 2: Add period dropdown to magazine edit form**

In `AdminMagazinesClient`, add a "Subscription Period" select to the edit dialog:
- Options: all periods + "None"
- On change: creates or removes a `MagazineSubscription` via API
- If assigning to an active period and conflict exists, show error from 409 response

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Manual test**

1. Verify Period column shows in magazine list
2. Edit a magazine — change its period assignment
3. Try assigning to an active period that conflicts — error shown

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/admin/magazines/page.tsx
git commit -m "feat: period column and assignment dropdown on admin magazines"
```

---

## Task 11: Magazine Detail — Period Badge & Scoped Receipts

**Files:**
- Modify: `app/(dashboard)/magazines/[id]/page.tsx`

- [ ] **Step 1: Fetch magazine's active subscription period**

Replace the single `resolveActivePeriod()` call. Instead:

```typescript
// Find this magazine's active subscription (if any)
const activeSub = await prisma.magazineSubscription.findFirst({
  where: {
    magazineId: id,
    active: true,
    period: { active: true },
  },
  include: { period: true },
})
```

- [ ] **Step 2: Render period badge**

Near the magazine title, show:
- If `activeSub`: badge with `activeSub.period.name`
- If no active sub: "Not currently subscribed" muted text

- [ ] **Step 3: Scope receipt history to period**

If `activeSub` exists, use `activeSub.period.startDate` and `activeSub.period.endDate` as the receipt query date range (same as current logic but using per-magazine period instead of global period).

If no active subscription, show "No active subscription" message instead of receipt history. Direct users to Reports for historical data.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Manual test**

1. View a magazine with an active subscription — period badge shows, receipts scoped
2. View a magazine with no active subscription — "Not currently subscribed" shows

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/magazines/[id]/page.tsx
git commit -m "feat: per-magazine period badge and scoped receipt history"
```

---

## Task 12: Reports — Period Filter on Page & Magazine Name Filter

**Files:**
- Modify: `components/ReportsClient.tsx`
- Modify: `lib/reports.ts`

- [ ] **Step 1: Add magazine name filter to report filters**

In `lib/reports.ts`:
- Add `magazineId` to `ReportFilters` type
- Update `parseReportFilters()` to parse `magazineId` from URL params
- Update all query functions to filter by `magazineId` when provided:
  - `getReceiptSummary()`: add `WHERE magazineId = ?`
  - `getOverdueReport()` / `getOverdueReportForPeriod()`: filter magazine list
  - `getSubscriptionOverview()` / `getSubscriptionOverviewForPeriod()`: filter
  - `getReceiptTimeline()`: add WHERE clause
  - `getTransferReport()`: add WHERE clause

- [ ] **Step 2: Move period dropdown into ReportsClient**

The period dropdown currently uses the sidebar's global period selection. Instead:
- Fetch all periods server-side and pass to `ReportsClient` as a prop
- Render a "Subscription Period" dropdown on the reports page itself
- Default: "All Periods"
- On change: navigate with `buildUrl({ periodId })` (existing pattern)
- When "All Periods" selected and no custom dates, use a sensible default range (e.g., last 12 months)

- [ ] **Step 3: Add magazine name search/autocomplete**

Add a magazine search input to the filter bar:
- Fetch all magazine names server-side, pass as prop
- Render a searchable select/combobox for magazine name
- On change: navigate with `buildUrl({ magazineId })`
- Server-side: `magazineId` param flows to `parseReportFilters()` and into queries

- [ ] **Step 4: Update admin reports page to pass new props**

In `app/(dashboard)/admin/reports/page.tsx`:
- Fetch periods and magazine names
- Pass to ReportsClient

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Manual test**

1. Select a specific period in reports — data scopes to period dates
2. Select "All Periods" — shows all data
3. Search for a magazine by name — all tabs filter to that magazine
4. Combine period + branch + magazine — drill down works

- [ ] **Step 7: Commit**

```bash
git add components/ReportsClient.tsx lib/reports.ts app/(dashboard)/admin/reports/page.tsx
git commit -m "feat: period and magazine name filters on reports page"
```

---

## Task 13: Seed Data — Extract Receipts from All Spreadsheets

**Files:**
- Modify: `prisma/extract-receipts.py`

- [ ] **Step 1: Add CB spreadsheet parsing**

Add the two CB files to the extraction:
- `docs/Ebsco CB 2025-2026 Magazine List.xlsx` (sheets: "2025", "2026")
- `docs/Ebsco CB 2025-2026 Childrens Magazine List.xlsx` (sheet: "Sheet1")
- Branch code: `CB`
- Format: same as Main — TITLE column + month columns

- [ ] **Step 2: Add CB magazine name mappings to NAME_MAP**

Add mappings for CB-specific titles, especially children's magazines:
- `ASK` -> `Ask`
- `BABY BUG` -> `Babybug`
- `HIGHLIGHTS` -> `Highlights`
- `HIGHLIGHTS HIGH 5` -> `Highlights High Five`
- `HUMPTY DUMPTY` -> `Humpty Dumpty`
- `LADYBUG` -> `Ladybug`
- `NATIONAL GEO. KIDS` -> `National Geographic Kids`
- `NAT GEO LITTLE KIDS` -> `National Geographic Little Kids`
- `RANGER RICK` -> `Ranger Rick`
- `RANGER RICK JR.` -> `Ranger Rick Jr.`
- `SPIDER?` -> `Spider` (or verify name)
- `SPORTS ILLUSTRATED KIDS` -> `Sports Illustrated Kids`
- `THE WEEK JUNIOR` -> `The Week Junior`
- (Also add mappings for CB adult magazines from the other spreadsheet)

- [ ] **Step 3: Change date cutoff from June to January 2025**

Update the date filtering to include all data from `2025-01-01` onward instead of `2025-06-01`.

- [ ] **Step 4: Add NE spreadsheet parsing for Jan 2025+**

Parse `docs/Ebsco NE 2025-2026 Magazine List.xlsx`:
- This file has one sheet per month (e.g., "Jan 25", "Feb 25", etc.)
- Different format from Main/CB — magazine names in column A, dates/marks in subsequent columns
- Only process sheets from "Jan 25" onward
- Branch code: `NORTH`

- [ ] **Step 5: Run extraction and verify**

Run: `python3 prisma/extract-receipts.py`

Verify:
- `prisma/seed-receipts.json` is regenerated
- Contains receipts from Jan 2025 for all branches (MAIN, NORTH, CB)
- CB receipts are present
- Ananda Vikatan has pre-June receipts

- [ ] **Step 6: Commit**

```bash
git add prisma/extract-receipts.py prisma/seed-receipts.json
git commit -m "feat: extract receipts from all spreadsheets, Jan 2025+, including CB"
```

---

## Task 14: Seed Data — Invoice-Based Magazine Master List

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Read all 16 invoice images and extract magazine data**

From the EBSCO invoices in `docs/0000.jpg` through `docs/0015.jpg`, extract:
- Magazine name (canonical)
- Issues per year
- Quantity (1=ML, 2=ML+NE, 3=ML+NE+CB, 5=2ML+2NE+1CB)
- Coverage dates
- Skip entries marked "Membership"

Cross-reference with existing magazine list in `seed.ts` and update:
- Correct any `issuesPerYear` values
- Correct any branch distributions
- Add missing magazines
- Remove any that aren't on the invoices (unless they're non-EBSCO titles)

- [ ] **Step 2: Create two subscription periods in seed**

Replace the single period creation with:

```typescript
const ebscoPeriod = await prisma.subscriptionPeriod.create({
  data: {
    name: 'Ebsco-25/26',
    startDate: new Date('2025-06-01T12:00:00Z'),
    endDate: new Date('2026-05-31T12:00:00Z'),
    active: true,
  },
})

const wtcoxPeriod = await prisma.subscriptionPeriod.create({
  data: {
    name: 'Wtcox-25',
    startDate: new Date('2025-01-01T12:00:00Z'),
    endDate: new Date('2025-12-31T12:00:00Z'),
    active: true,
  },
})
```

- [ ] **Step 3: Assign magazines to correct periods**

- Standing orders (e.g., Ananda Vikatan) and magazines with Jan 1 start date -> `Wtcox-25`
- All other EBSCO standard subscriptions -> `Ebsco-25/26`
- Use invoice-derived `issuesPerYear` values
- Set `MagazineSubscription.active = true` for both periods (they're active)

- [ ] **Step 4: Test full seed**

```bash
rm prisma/dev.db && npx prisma migrate dev && npm run seed
```

Verify:
- Two periods exist and are active
- Magazines are assigned to correct periods
- Ananda Vikatan is in Wtcox-25
- Receipt counts look correct
- No duplicate magazine assignments

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: two subscription periods in seed, invoice-verified magazine data"
```

---

## Task 15: Cleanup & Integration Test

**Files:**
- Various

- [ ] **Step 1: Search for stale references**

Search codebase for any remaining references to:
- `resolveActivePeriod` (removed)
- `resolveActivePeriodId` (removed)
- `getActivePeriodId` (removed)
- `PERIOD_COOKIE` (removed)
- `epl-active-period` (cookie name)
- `PeriodSelector` (deleted component)

Fix or remove each one.

- [ ] **Step 2: Full type check**

Run: `npx tsc --noEmit`

Fix any remaining type errors.

- [ ] **Step 3: Full seed + manual integration test**

```bash
rm prisma/dev.db && npx prisma migrate dev && npm run seed
npm run dev
```

Test the complete flow:
1. Login as admin
2. Dashboard shows two progress bars (Ebsco-25/26, Wtcox-25)
3. Expected/Overdue cards have period badges
4. No period selector in sidebar
5. `/admin/subscriptions` lists both periods
6. Create a new period with "Same as Ebsco-25/26" — created as inactive
7. Activate the new period — should show conflicts since magazines are in Ebsco-25/26
8. `/admin/magazines` shows Period column
9. `/magazines/[id]` shows period badge, scoped receipts
10. Reports: period dropdown works, magazine name filter works
11. Deactivate Wtcox-25 manually — subscriptions go inactive
12. Wait for auto-deactivation (or set endDate to past) — verify auto-deactivation

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: cleanup stale references and integration fixes"
```

---

## Execution Order & Dependencies

```
Task 1 (Types) ─────────────────────────────────────────────┐
Task 2 (lib/period.ts) ─────────────────────────────────────┤
                                                             ├─→ Task 6 (Sidebar/Layout)
Task 3 (POST API) ──────────────────────────────────────────┤   Task 7 (CreatePeriodDialog)
Task 4 (PUT API) ───────────────────────────────────────────┤   Task 8 (Dashboard)
Task 5 (Subscription conflict APIs) ────────────────────────┤   Task 9 (Activate/Deactivate)
                                                             │   Task 10 (Admin Magazines)
                                                             │   Task 11 (Magazine Detail)
                                                             │   Task 12 (Reports)
                                                             │
Task 13 (Extract receipts) ──── independent ────────────────┤
Task 14 (Seed update) ──── depends on Task 13 ──────────────┤
                                                             │
Task 15 (Cleanup) ──── depends on all above ────────────────┘
```

**Parallelizable:** Tasks 1-5 are backend-only and can be done sequentially fast. Tasks 6-12 are UI changes that depend on backend being done but are independent of each other. Tasks 13-14 (seed data) are fully independent of everything else.
