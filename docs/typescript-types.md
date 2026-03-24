# TypeScript Types

## Location

All shared types are defined in `types/index.ts` and imported as `@/types`.

## Core Type Definitions

```typescript
// Roles
type UserRole = 'ADMIN' | 'STAFF'

// Magazine cadence
type CadenceType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'

// Dashboard status buckets
type MagazineStatus = 'overdue' | 'this_week' | 'upcoming' | 'never_received'

// Transfer lifecycle
type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

// Branch codes
type BranchCode = 'MAIN' | 'NORTH' | 'CB' | 'MOBILE'

// Audit log actions (18 total)
type AuditAction =
  | 'LOGIN' | 'LOGOUT'
  | 'MAGAZINE_CREATED' | 'MAGAZINE_UPDATED' | 'MAGAZINE_DELETED'
  | 'RECEIPT_CREATED' | 'RECEIPT_EDITED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED'
  | 'USER_NAME_CHANGED' | 'USER_PASSWORD_CHANGED'
  | 'BRANCH_MAGAZINE_ADDED' | 'BRANCH_MAGAZINE_UPDATED' | 'BRANCH_MAGAZINE_REMOVED'
  | 'TRANSFER_INITIATED' | 'TRANSFER_COMPLETED' | 'TRANSFER_CANCELLED'
```

## Type Conventions

- `strict: true` with zero `any` usage
- Enriched response types use suffixes: `WithDetails`, `WithStatus`, `WithCount`
- All exported functions in `lib/` and `types/` have TSDoc comments
- Path alias `@/*` maps to the project root (e.g., `@/types`, `@/lib/session`)

## Type Checking

```bash
# Run type checker (no build output — check only)
npx tsc --noEmit

# Watch mode for continuous checking during development
npx tsc --noEmit --watch
```
