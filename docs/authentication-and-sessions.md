# Authentication & Sessions

## Session Architecture

| Component | Technology | File |
|---|---|---|
| Password hashing | bcrypt (cost factor 10) | `lib/session.ts` |
| JWT signing | jose (HS256) | `lib/session.ts` |
| Cookie management | Next.js `cookies()` | `lib/session.ts` |
| Route protection | Edge middleware | `proxy.ts` |
| Server-side verification | Cached per-request | `lib/dal.ts` |

## Session Cookie

| Property | Value |
|---|---|
| Name | `session` |
| Contents | Encrypted JWT (`{ userId, role, expiresAt }`) |
| Expiry | 7 days from creation |
| HttpOnly | `true` (not accessible via JavaScript) |
| Secure | `true` in production, `false` in development |
| SameSite | `lax` |
| Path | `/` |

## Defense in Depth

Authentication is enforced at two layers:

1. **Edge middleware** (`proxy.ts`): Checks for valid session cookie on every page navigation. Redirects to `/login` if missing. Runs on all routes except `/api`, static assets, and `/login`.

2. **API routes and Server Components** (`lib/dal.ts`): Every data-fetching operation calls `verifySession()` which decrypts the JWT, validates expiry, and checks that the user is still active in the database. This prevents deactivated users from continuing to use an existing session.

## Branch Context

The active branch is stored in a separate cookie (`epl-active-branch`). This determines which branch's data the user sees and which branch receipts are recorded against. Falls back to the Main Library branch if the cookie is missing.
