# Data Flows

## Magazine Receipt Flow

```
Staff selects branch → Views magazine list → Clicks "Mark Received"
  │
  ├─ POST /api/magazines/[id]/receipts
  │    ├─ Verifies session (lib/dal.ts)
  │    ├─ Resolves active branch from cookie (lib/branch.ts)
  │    ├─ Creates IssueReceipt record (with retry on SQLITE_BUSY)
  │    ├─ Logs RECEIPT_CREATED to audit.log
  │    └─ Returns 201 with receipt data
  │
  └─ Dashboard recalculates status:
       ├─ Fetches latest receipt per magazine per branch
       ├─ Computes next expected date (lib/cadence.ts)
       └─ Buckets into: Overdue | This Week | Upcoming | Never Received
```

## Transfer Flow

```
Staff at Branch A initiates transfer → Admin or Branch B completes it
  │
  ├─ POST /api/transfers (initiate)
  │    ├─ Creates Transfer record (status: PENDING)
  │    ├─ Decrements sender's BranchMagazine quantity
  │    └─ Logs TRANSFER_INITIATED
  │
  ├─ PUT /api/transfers/[id]/complete (receiving branch)
  │    ├─ Sets status → COMPLETED
  │    ├─ Increments receiver's BranchMagazine quantity
  │    ├─ Creates IssueReceipt at receiving branch
  │    └─ Logs TRANSFER_COMPLETED
  │
  └─ PUT /api/transfers/[id]/cancel (admin only)
       ├─ Sets status → CANCELLED
       ├─ Restores sender's BranchMagazine quantity
       └─ Logs TRANSFER_CANCELLED
```

## Authentication Flow

```
User submits login form → POST /api/auth/login
  │
  ├─ Validates email + password (bcrypt compare)
  ├─ Creates encrypted JWT cookie (jose, 7-day expiry)
  ├─ Logs LOGIN to audit.log
  └─ Redirects to /dashboard

Every subsequent request:
  │
  ├─ proxy.ts (Edge middleware): checks session cookie exists + is valid
  │    └─ Redirects to /login if missing/invalid
  │
  └─ API routes / Server Components: call verifySession() from lib/dal.ts
       ├─ Decrypts JWT, validates expiry
       ├─ Checks user.active === true in database
       └─ Returns { userId, role } or redirects to /login
```

## Dashboard Computation

```
For each active BranchMagazine at the selected branch:
  │
  ├─ Query: most recent IssueReceipt for (magazine, branch)
  │
  ├─ If no receipt exists → "Never received — status unknown"
  │
  └─ If receipt exists:
       ├─ nextExpected = computeNextExpectedDate(lastReceivedDate, cadence)
       │    ├─ WEEKLY:     + 7 days
       │    ├─ BI_WEEKLY:  + 14 days
       │    ├─ MONTHLY:    + 1 calendar month
       │    ├─ BI_MONTHLY: + 2 calendar months
       │    └─ SEASONAL:   + 3 calendar months
       │
       └─ Status:
            ├─ nextExpected < today         → OVERDUE
            ├─ today ≤ nextExpected ≤ +7d   → EXPECTED THIS WEEK
            └─ nextExpected > today + 7d    → UPCOMING
```
