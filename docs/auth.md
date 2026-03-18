# Authentication & Sessions

This document explains how users log in, how sessions work, and how every route is protected.

---

## Overview

The app uses a **custom session cookie** system -- no third-party auth provider, no OAuth.
When a user logs in with their email and password, the server creates an encrypted JWT (JSON Web Token) stored as an HTTP-only cookie in the browser. Every subsequent request carries this cookie automatically.

Two layers protect routes:

1. **proxy.ts** (middleware) -- runs *before* any page loads; redirects unauthenticated visitors to `/login`.
2. **lib/dal.ts** (data access layer) -- runs *inside* Server Components and API routes; re-checks the session as defense in depth.

---

## Session Lifecycle

```
User submits email + password
        |
        v
POST /api/auth/login
        |
        v
  bcrypt.compare(password, user.passwordHash)
        |
        v
  createSession(userId, role) -- writes encrypted JWT cookie
        |
        v
  Browser stores cookie automatically (httpOnly -- JS cannot read it)
        |
        v
  Every request carries cookie --> proxy.ts checks it --> page loads
        |
        v
POST /api/auth/logout --> deleteSession() --> cookie is removed
```

### Cookie attributes

When `createSession()` writes the cookie, it sets these attributes:

| Attribute   | Value                                          | Why                                          |
|-------------|------------------------------------------------|----------------------------------------------|
| `httpOnly`  | `true`                                         | JavaScript cannot read or steal the cookie   |
| `secure`    | `true` in production, `false` in dev           | Requires HTTPS in production                 |
| `sameSite`  | `'lax'`                                        | Prevents CSRF from foreign sites             |
| `expires`   | 7 days from creation                           | Session auto-expires after one week          |
| `path`      | `'/'`                                          | Cookie is sent on every route                |

### Session duration

Sessions last **7 days** (hardcoded in `lib/session.ts` as `SESSION_DURATION_MS`). After 7 days the cookie expires and the user must log in again. There is no "remember me" or refresh token mechanism.

---

## SESSION_SECRET

The JWT is signed and encrypted using a secret key stored in the environment variable `SESSION_SECRET`.

**How to generate it:**

```bash
openssl rand -base64 32
```

Then put it in your `.env.local` file:

```bash
SESSION_SECRET=your-generated-secret-here
```

If `SESSION_SECRET` is not set, the app will throw an error on startup: `"SESSION_SECRET is not set"`.

---

## lib/session.ts -- API Reference

This file handles JWT creation and destruction. It uses the `jose` library (not `jsonwebtoken`).

### `encrypt(payload)`

Encrypts a session payload into a signed JWT string.

```ts
// payload shape:
interface SessionPayload {
  userId: string
  role: 'ADMIN' | 'STAFF'
  expiresAt: Date | string
}

// Usage (internal -- called by createSession):
const token = await encrypt({ userId: 'abc123', role: 'STAFF', expiresAt: new Date(...) })
// Returns: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQ..."
```

The JWT is signed with the `HS256` algorithm. The expiration is also embedded inside the JWT itself via `setExpirationTime('7d')`.

### `decrypt(session)`

Decrypts and verifies a JWT string. Returns the payload if valid, or `null` if the token is missing, expired, or tampered with.

```ts
const payload = await decrypt(cookieValue)
// Returns: { userId: 'abc123', role: 'STAFF', expiresAt: '...' } or null
```

### `createSession(userId, role)`

Creates the encrypted cookie and writes it to the browser. This is called from the login API route after successful password verification.

```ts
await createSession('cuid_abc123', 'ADMIN')
// Side effect: sets the 'session' cookie on the response
```

### `deleteSession()`

Deletes the session cookie, effectively logging the user out.

```ts
await deleteSession()
// Side effect: removes the 'session' cookie
```

---

## lib/dal.ts -- Data Access Layer

This file provides two functions that Server Components and API routes use to check who is logged in. Both functions use React's `cache()` so the database is only hit once per request, even if multiple components call them.

### `verifySession()`

Reads the session cookie, decrypts it, and returns the session user. If the session is missing or invalid, it **redirects to `/login`** (it does not return an error -- it throws a redirect).

```ts
// In a Server Component or API route:
const session = await verifySession()
// Returns: { userId: 'abc123', role: 'ADMIN' }
```

The return shape is `SessionUser`:

```ts
interface SessionUser {
  userId: string
  role: 'ADMIN' | 'STAFF'
}
```

### `getUser()`

Calls `verifySession()` first, then fetches the full user record from the database. If the user is inactive or does not exist, it redirects to `/login`.

```ts
const user = await getUser()
// Returns: { id: 'abc123', name: 'Jane', email: 'jane@library.org', role: 'STAFF', active: true }
```

The return shape is `AuthUser`:

```ts
interface AuthUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'STAFF'
  active: boolean
}
```

---

## proxy.ts -- Route Protection Middleware

This file runs **before** every page request (but not API routes or static files). It decides whether to let the request through, redirect to login, or redirect away from login.

### Logic

```
incoming request
    |
    v
Is the path a "public route" (/login)?
    |
    +-- YES: Is the user logged in?
    |         +-- YES: redirect to / (already authenticated)
    |         +-- NO:  let them see /login
    |
    +-- NO:  Is the user logged in?
              +-- YES: let them through
              +-- NO:  redirect to /login
```

### What it skips

The matcher config excludes these paths from middleware processing:

- `/api/*` -- API routes handle their own auth via `verifySession()`
- `/_next/static/*` -- Next.js static assets (CSS, JS bundles)
- `/_next/image/*` -- Next.js image optimization
- `/favicon.ico`

```ts
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

---

## Defense in Depth

Why does both `proxy.ts` AND `dal.ts` check the session?

- **proxy.ts** catches unauthenticated users early, before any page rendering starts. It is fast but lightweight -- it only checks if a valid JWT exists.
- **dal.ts `verifySession()`** runs inside the actual page rendering. It re-checks the JWT AND can verify the user still exists and is active in the database (via `getUser()`).

This means even if middleware had a bug, the page-level check would still catch unauthorized access. It also means that if an admin deactivates a user's account, the user is logged out on their next page load (because `getUser()` checks `user.active`).

---

## Role Permissions

| Action                          | STAFF | ADMIN |
|---------------------------------|-------|-------|
| View dashboard                  | Yes   | Yes   |
| Mark magazine received          | Yes   | Yes   |
| View receipt history            | Yes   | Yes   |
| Create / edit / delete magazine | No    | Yes   |
| Create / delete users           | No    | Yes   |
| View audit log                  | No    | Yes   |

Role checks happen in API routes:

```ts
const session = await verifySession()
if (session.role !== 'ADMIN') {
  return Response.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

## Passwords

Passwords are hashed with **bcrypt** at cost factor 10. The plaintext password is never stored.

```ts
// During user creation:
const passwordHash = await bcrypt.hash(password, 10)

// During login:
const match = await bcrypt.compare(password, user.passwordHash)
```

The seed file creates two default accounts:
- **Admin**: `admin@library.org` / `admin1234`
- **Staff**: `staff@library.org` / `staff1234`

Change these passwords after first login in a real deployment.
