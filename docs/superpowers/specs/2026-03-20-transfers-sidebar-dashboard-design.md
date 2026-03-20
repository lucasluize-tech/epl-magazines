# Branch-to-Branch Transfers, Collapsible Sidebar, and Dashboard Changes

**Date:** 2026-03-20
**Status:** Approved

---

## 1. Transfer Data Model

### Problem

There is no way to move physical magazine copies between branches. Branches may receive magazines intended for other branches, or need to redistribute inventory.

### Design

Add a new Prisma model and enum:

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
  createdAt      DateTime       @default(now())
  completedAt    DateTime?
}
```

Reverse relations must be added to `Magazine`, `Branch`, and `User` models.

New audit actions: `TRANSFER_INITIATED`, `TRANSFER_COMPLETED`, `TRANSFER_CANCELLED`.

---

## 2. Transfer Initiation

### Who Can Initiate

Any authenticated user (STAFF or ADMIN).

### UI Entry Points

**Admin magazines inventory page (`/admin/magazines`):**
- New send icon button (`SendHorizontal` from Lucide) in the Actions column.

**Staff magazines list page (`/magazines`):**
- Magazine name becomes a clickable link to `/magazines/[id]` (underline on hover, pointer cursor).
- The old "History" button slot becomes a Transfer button (send icon).

Both open the same `TransferDialog` component.

### TransferDialog

- Magazine name displayed (read-only)
- Branch dropdown: all active branches **except** the current (sending) branch
- Quantity input: min 1, max = sender's `BranchMagazine.quantity`. Validation enforced — cannot transfer more copies than the branch holds.

### API

`POST /api/transfers`

- Body: `{ magazineId, toBranchId, quantity }`
- `fromBranchId` resolved server-side from the active branch cookie
- Validates:
  - `quantity` <= sender's `BranchMagazine.quantity`
  - `fromBranchId` != `toBranchId`
  - Magazine exists
  - Both branches exist and are active
- On success:
  - Decrease sender's `BranchMagazine.quantity` by `quantity`
  - Create `Transfer` record with status = PENDING
  - Audit log: `TRANSFER_INITIATED` with magazineId, fromBranchId, toBranchId, quantity
- Multiple pending transfers for the same magazine to the same branch are allowed, as long as sender has sufficient quantity each time.

---

## 3. Transfer Completion (Mark Received)

### Flow

When the receiving branch marks a pending transfer as received:

1. Create `IssueReceipt` — magazineId, branchId = toBranchId, receivedById = current user, receivedDate = now. This counts as fulfilling a cadence cycle (delivery arrived).
2. Check if `BranchMagazine` exists for magazine + toBranch:
   - **Exists** (branch already has a subscription): `quantity += transfer.quantity`
   - **Does not exist**: create `BranchMagazine` with `active = false`, `quantity = transfer.quantity`
3. Update `Transfer`: status = COMPLETED, completedById = current user, completedAt = now
4. Audit log: `TRANSFER_COMPLETED`

### API

`PUT /api/transfers/[id]/complete`

- Validates: transfer exists, status is PENDING, current user's active branch = toBranchId
- Any authenticated user can complete

---

## 4. Transfer Cancellation

Admin can cancel a pending transfer. This restores the sender's `BranchMagazine.quantity` and marks the transfer as CANCELLED.

### API

`PUT /api/transfers/[id]/cancel`

- ADMIN only
- Validates: transfer exists, status is PENDING
- On success:
  - Increase `fromBranch`'s `BranchMagazine.quantity` by `transfer.quantity`
  - Update transfer: status = CANCELLED
  - Audit log: `TRANSFER_CANCELLED`

---

## 5. Dashboard Changes

### Problem

The dashboard currently has 4 buckets (Overdue, Expected This Week, Upcoming, Never Received) and does not account for transfers. The title is static.

### Design

**Title:** "Magazine Dashboard" becomes "Magazine Dashboard [Branch Name]" where the branch name is resolved dynamically from the active branch.

**Buckets reduced to 2:**

1. **Expected This Week** (shown first) — magazines where `nextExpectedDate` falls within the current calendar week (Sunday through Saturday). Not a rolling +7 day window.
2. **Overdue** — magazines where `nextExpectedDate` has passed without a receipt for that cadence cycle.

Remove "Upcoming" and "Never Received" buckets entirely.

**Pending transfers on dashboard:**

Query `Transfer` records where `toBranchId` = active branch AND `status` = PENDING. These render as cards in the "Expected This Week" section with the text:

> "Will be delivered from [branch name] soon"

Instead of showing Last Received / Next Expected dates. Transfer cards have a "Received" button that triggers the transfer completion flow (Section 3).

**Suppression rule:** For each pending transfer, if the receiving branch has an active `BranchMagazine` subscription for the same `magazineId`, suppress that magazine's subscription card from **all** dashboard buckets (Expected This Week and Overdue). The transfer card replaces it — the magazine is no longer "overdue" because it's being delivered by another branch.

---

## 6. Collapsible Sidebar

### Problem

The fixed `w-64` sidebar takes significant horizontal space, reducing the main content area.

### Design

**Toggle button:** Round button positioned at the **top-right edge** of the sidebar, overlapping into the main content area. Animated chevron: `<` when expanded, `>` when collapsed.

**Collapsed state (w-16):**
- Smaller/icon-only logo (e.g., just the "E" initial or a compact mark)
- Navigation items show only icons — no labels
- Each icon has a **hover scale-up animation** (`hover:scale-110` with smooth transition) for easy navigation
- Branch selector hidden (too complex for collapsed view)
- User badge shows only the avatar circle (no name/role text), still clickable to `/profile`
- Logout shows only the icon

**Expanded state (w-64):** Current behavior, unchanged.

**State persistence:** Store collapsed/expanded preference in a cookie so it persists across page loads and sessions.

**Main content area:** Expands to fill the freed space when sidebar collapses. Smooth transition animation on both the sidebar width and the main content margin.

---

## 7. Column and Label Changes

### Admin Magazines Inventory Table

- **Swap columns:** Notes moves before Status (Switch). New order: Name, Cadence, Qty, Total Deliveries, Last Received, Next Expected, Notes, Status, Actions.
- **Rename column:** "Total Issues" → "Total Deliveries". This reflects cadence cycles fulfilled (how many times a delivery was received), not physical copy count.

### Staff Magazines List Page (`/magazines`)

- **Magazine name:** Becomes a clickable `<Link>` to `/magazines/[id]`. On hover: underline text, pointer cursor.
- **Transfer button:** The slot previously occupied by the "History" button becomes a Transfer button (send icon) that opens `TransferDialog`.

---

## Technical Notes

- **Schema migration required.** New `Transfer` model and `TransferStatus` enum. Reverse relations added to `Magazine`, `Branch`, and `User`.
- **New API routes:** `POST /api/transfers`, `PUT /api/transfers/[id]/complete`, `PUT /api/transfers/[id]/cancel`
- **New components:** `TransferDialog` (shared between admin and staff pages)
- **Modified pages:** Dashboard (buckets, title, transfer cards), `/magazines` (clickable names, transfer button), `/admin/magazines` (column swap, rename, transfer button)
- **Modified layout:** Sidebar collapse with cookie persistence
- **New audit actions:** `TRANSFER_INITIATED`, `TRANSFER_COMPLETED`, `TRANSFER_CANCELLED`
- **Terminology change:** "Total Issues" → "Total Deliveries" across the UI
- **Calendar week:** Sunday through Saturday for "Expected This Week" calculation
