# Business Logic

This document explains the core business rules: how the app decides when a magazine is overdue, expected soon, or upcoming. All the logic lives in `lib/cadence.ts`.

---

## The Core Idea

Every magazine has a **cadence** (how often it arrives: weekly, monthly, etc.). Every time staff receive an issue, they record it as a **receipt**. The app uses the **most recent receipt date** plus the **cadence interval** to compute when the next issue should arrive.

There is no "subscription start date" -- everything is anchored to the last received date.

---

## Cadence Enum

The `Cadence` enum (defined in `prisma/schema.prisma` and mirrored as `CadenceType` in `types/index.ts`) has five values:

| Cadence      | Human Label  | Interval Added         | Example                                  |
|-------------|--------------|------------------------|------------------------------------------|
| `WEEKLY`     | Weekly       | +7 days                | Received Jan 1 --> next expected Jan 8   |
| `BI_WEEKLY`  | Bi-Weekly    | +14 days               | Received Jan 1 --> next expected Jan 15  |
| `MONTHLY`    | Monthly      | +1 calendar month      | Received Jan 15 --> next expected Feb 15 |
| `BI_MONTHLY` | Bi-Monthly   | +2 calendar months     | Received Jan 15 --> next expected Mar 15 |
| `SEASONAL`   | Seasonal     | +3 calendar months     | Received Jan 15 --> next expected Apr 15 |

Calendar month arithmetic is handled by `date-fns`'s `addMonths()`, which correctly handles edge cases like end-of-month dates (e.g., Jan 31 + 1 month = Feb 28).

---

## Exports from lib/cadence.ts

The file exports 4 items:

### 1. `CADENCE_LABELS`

A lookup table mapping each cadence value to a human-readable label. Used in the UI for badges and dropdowns.

```ts
export const CADENCE_LABELS: Record<CadenceType, string> = {
  WEEKLY:     'Weekly',
  BI_WEEKLY:  'Bi-Weekly',
  MONTHLY:    'Monthly',
  BI_MONTHLY: 'Bi-Monthly',
  SEASONAL:   'Seasonal',
}
```

**Usage in components:**

```js
import { CADENCE_LABELS } from '@/lib/cadence'

// In a badge:
<Badge>{CADENCE_LABELS[magazine.cadence]}</Badge>
// Renders: "Weekly" or "Monthly" etc.

// In a dropdown:
Object.entries(CADENCE_LABELS).map(([value, label]) => (
  <SelectItem key={value} value={value}>{label}</SelectItem>
))
```

### 2. `computeNextExpectedDate(lastReceivedDate, cadence)`

Given the last received date and a cadence, returns the date when the next issue is expected.

**Parameters:**
- `lastReceivedDate` -- a `Date`, a date string, or `null`
- `cadence` -- one of `'WEEKLY'`, `'BI_WEEKLY'`, `'MONTHLY'`, `'BI_MONTHLY'`, `'SEASONAL'`

**Returns:** a `Date` object, or `null` if `lastReceivedDate` is null.

**Examples:**

```js
import { computeNextExpectedDate } from '@/lib/cadence'

// Weekly magazine received on March 1:
computeNextExpectedDate('2025-03-01', 'WEEKLY')
// Returns: Date for March 8, 2025

// Monthly magazine received on January 31:
computeNextExpectedDate('2025-01-31', 'MONTHLY')
// Returns: Date for February 28, 2025 (date-fns handles month-end)

// Never received:
computeNextExpectedDate(null, 'WEEKLY')
// Returns: null
```

### 3. `isOverdue(nextExpectedDate)`

Returns `true` if the next expected date is in the past (i.e., the magazine is late).

**Parameters:**
- `nextExpectedDate` -- a `Date` or `null`

**Returns:** `boolean`

**Examples:**

```js
import { isOverdue } from '@/lib/cadence'

// Expected yesterday:
isOverdue(new Date('2025-03-17'))  // today is March 18
// Returns: true

// Expected tomorrow:
isOverdue(new Date('2025-03-19'))
// Returns: false

// Never received (null):
isOverdue(null)
// Returns: false (not overdue -- status unknown)
```

### 4. `getMagazineStatus(lastReceivedDate, cadence)`

The main function used by the dashboard. Classifies a magazine into one of four status buckets.

**Parameters:**
- `lastReceivedDate` -- a `Date`, a date string, or `null`
- `cadence` -- a `CadenceType` value

**Returns:** one of `'overdue'`, `'this_week'`, `'upcoming'`, `'never_received'`

**Logic flow:**

```
lastReceivedDate is null?
    |
    +-- YES --> return 'never_received'
    |
    +-- NO --> compute nextExpectedDate
                |
                v
          Is nextExpectedDate in the past?
                |
                +-- YES --> return 'overdue'
                |
                +-- NO --> Is nextExpectedDate within the next 7 days?
                            |
                            +-- YES --> return 'this_week'
                            |
                            +-- NO --> return 'upcoming'
```

**Examples:**

```js
import { getMagazineStatus } from '@/lib/cadence'

// Weekly magazine received 10 days ago (overdue by 3 days):
getMagazineStatus('2025-03-08', 'WEEKLY')
// Returns: 'overdue'

// Weekly magazine received 3 days ago (expected in 4 days):
getMagazineStatus('2025-03-15', 'WEEKLY')
// Returns: 'this_week'

// Monthly magazine received yesterday (expected in ~30 days):
getMagazineStatus('2025-03-17', 'MONTHLY')
// Returns: 'upcoming'

// Never received:
getMagazineStatus(null, 'WEEKLY')
// Returns: 'never_received'
```

---

## Dashboard Bucketing

The dashboard page groups all active magazines into four sections:

### 1. Overdue / Missing (red)

Magazines whose next expected date has already passed. These need attention -- the issue might be lost in the mail, the subscription might have lapsed, etc.

**Condition:** `nextExpectedDate < today`

### 2. Expected This Week (yellow)

Magazines whose next issue should arrive within the next 7 days (including today).

**Condition:** `today <= nextExpectedDate <= today + 7 days`

### 3. Upcoming (green)

Magazines whose next issue is more than 7 days away. No action needed.

**Condition:** `nextExpectedDate > today + 7 days`

### 4. Never Received (gray)

Magazines that have zero receipt records. The system cannot compute a next expected date because there is no anchor date. These show a message: "Never received -- status unknown."

**Condition:** `lastReceivedDate is null`

---

## The "Never Received" Case

When a magazine is first created, it has no receipts. The system does not know when the first issue will arrive because there is no start date.

- `computeNextExpectedDate(null, cadence)` returns `null`
- `isOverdue(null)` returns `false`
- `getMagazineStatus(null, cadence)` returns `'never_received'`

The magazine card shows "Never received -- status unknown" in gray. Once staff record the first receipt, the system can compute the next expected date and the magazine moves into one of the other three buckets.

---

## isExpectedThisWeek(nextExpectedDate)

This is an internal helper used by `getMagazineStatus`. It checks whether a date falls within the next 7 days (inclusive of today but not past dates).

```ts
export function isExpectedThisWeek(nextExpectedDate: Date | null): boolean {
  if (!nextExpectedDate) return false
  const now = new Date()
  const weekFromNow = addDays(now, 7)
  const next = new Date(nextExpectedDate)
  return next >= now && next <= weekFromNow
}
```

The boundary conditions:
- A magazine expected **today** is classified as `this_week` (not overdue), because `next >= now` is true when they are the same moment. In practice, dates are compared at the timestamp level, so a magazine expected at midnight today might briefly show as overdue during the day. For a library application, this precision is acceptable.
- A magazine expected exactly 7 days from now is included in `this_week`.

---

## Audit Logging

Every receipt creation is logged:

```ts
auditLog(session.userId, 'RECEIPT_CREATED', {
  magazineId: id,
  magazineName: magazine.name,
  receiptId: receipt.id,
  receivedDate,
})
```

See [api.md](./api.md) for the full list of audited actions.
