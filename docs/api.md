# API Reference

All API routes live under `app/api/`. They are standard Next.js Route Handlers -- each file exports functions named after HTTP methods (`GET`, `POST`, `PUT`, `DELETE`).

---

## Route Table

| Method   | Path                              | Auth Required | Role Required | Request Body                                            | Success Response                        |
|----------|-----------------------------------|---------------|---------------|---------------------------------------------------------|-----------------------------------------|
| `POST`   | `/api/auth/login`                 | No            | --            | `{ email, password }`                                   | `{ success: true }`                     |
| `POST`   | `/api/auth/logout`                | No*           | --            | (none)                                                  | `{ success: true }`                     |
| `GET`    | `/api/magazines`                  | Yes           | Any           | --                                                      | `Magazine[]`                            |
| `POST`   | `/api/magazines`                  | Yes           | ADMIN         | `{ name, cadence, notes? }`                             | `Magazine` (status 201)                 |
| `GET`    | `/api/magazines/[id]`             | Yes           | Any           | --                                                      | `Magazine`                              |
| `PUT`    | `/api/magazines/[id]`             | Yes           | ADMIN         | `{ name?, cadence?, notes?, active? }`                  | `Magazine`                              |
| `DELETE` | `/api/magazines/[id]`             | Yes           | ADMIN         | --                                                      | `{ success: true }`                     |
| `GET`    | `/api/magazines/[id]/receipts`    | Yes           | Any           | --                                                      | `ReceiptWithReceiver[]`                 |
| `POST`   | `/api/magazines/[id]/receipts`    | Yes           | Any           | `{ receivedDate, notes? }`                              | `ReceiptWithReceiver` (status 201)      |
| `GET`    | `/api/users`                      | Yes           | ADMIN         | --                                                      | `User[]` (without passwordHash)         |
| `POST`   | `/api/users`                      | Yes           | ADMIN         | `{ name, email, password, role? }`                      | `User` (status 201, without hash)       |
| `PUT`    | `/api/users/[id]`                 | Yes           | ADMIN         | `{ active?, role? }`                                    | `{ success: true }`                     |
| `DELETE` | `/api/users/[id]`                 | Yes           | ADMIN         | --                                                      | `{ success: true }`                     |

*Logout always returns success even if no session exists.

---

## Response Shapes

### Standard success

```json
{ "success": true }
```

Or a data object/array directly (magazines, users, receipts).

### Standard error

```json
{ "error": "Human-readable error message" }
```

Every error response includes an appropriate HTTP status code:

| Status | Meaning                           | When it happens                                              |
|--------|-----------------------------------|--------------------------------------------------------------|
| 400    | Bad Request                       | Missing required fields, password too short                  |
| 401    | Unauthorized                      | Not logged in, or invalid credentials                        |
| 403    | Forbidden                         | Logged in as STAFF but trying an ADMIN-only action           |
| 404    | Not Found                         | Magazine or user ID does not exist                           |
| 409    | Conflict                          | Email already exists (when creating a user)                  |
| 500    | Internal Server Error             | Unexpected server error                                      |

---

## Detailed Route Documentation

### POST /api/auth/login

Validates email and password, creates an encrypted session cookie.

**Request body:**

```json
{
  "email": "admin@library.org",
  "password": "admin1234"
}
```

**What it does:**
1. Looks up the user by email (case-insensitive, trimmed)
2. Checks that the user exists and is active
3. Compares the password against the stored bcrypt hash
4. On success, calls `createSession(userId, role)` to set the cookie
5. Logs the action to the audit log

**Error responses:**
- `400` -- `"Email and password are required"`
- `401` -- `"Invalid email or password"` (same message for wrong email or wrong password, to prevent user enumeration)

---

### POST /api/auth/logout

Clears the session cookie. Reads the current session first to log the action, then deletes the cookie.

**Request body:** none

Always returns `{ "success": true }` regardless of whether a session existed.

---

### GET /api/magazines

Returns all **active** magazines, sorted alphabetically by name.

**Response example:**

```json
[
  {
    "id": "clx123abc",
    "name": "The Economist",
    "cadence": "WEEKLY",
    "active": true,
    "notes": "International edition",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-03-01T14:30:00.000Z"
  }
]
```

---

### POST /api/magazines

Creates a new magazine. ADMIN only.

**Request body:**

```json
{
  "name": "Scientific American",
  "cadence": "MONTHLY",
  "notes": "Optional notes about this publication"
}
```

**Cadence must be one of:** `WEEKLY`, `BI_WEEKLY`, `MONTHLY`, `BI_MONTHLY`, `SEASONAL`

**Error responses:**
- `400` -- `"Name and cadence are required"` or `"Invalid cadence"`
- `403` -- `"Forbidden"` (not an admin)

---

### GET /api/magazines/[id]

Returns a single magazine by its ID.

**Error responses:**
- `404` -- `"Not found"`

---

### PUT /api/magazines/[id]

Partially updates a magazine. Only fields present in the request body are changed. ADMIN only.

**Request body (all fields optional):**

```json
{
  "name": "New Name",
  "cadence": "BI_WEEKLY",
  "notes": "Updated notes",
  "active": false
}
```

**Error responses:**
- `403` -- `"Forbidden"`
- `404` -- `"Not found"` (Prisma P2025 error -- see below)

---

### DELETE /api/magazines/[id]

Deletes a magazine and **all its receipt records**. ADMIN only. This is a destructive, non-reversible action.

**Cascade delete:** The route manually deletes all `IssueReceipt` records for the magazine first, then deletes the magazine itself. This is done explicitly rather than relying on database-level cascades.

```ts
// From app/api/magazines/[id]/route.ts:
await db.issueReceipt.deleteMany({ where: { magazineId: id } })
const magazine = await db.magazine.delete({ where: { id } })
```

**Error responses:**
- `403` -- `"Forbidden"`
- `404` -- `"Not found"`

---

### GET /api/magazines/[id]/receipts

Returns all receipts for a specific magazine, sorted newest first. Each receipt includes the name of the person who recorded it.

**Response example:**

```json
[
  {
    "id": "clx456def",
    "magazineId": "clx123abc",
    "receivedById": "clx789ghi",
    "receivedDate": "2025-03-10T00:00:00.000Z",
    "notes": "Received in good condition",
    "createdAt": "2025-03-10T09:15:00.000Z",
    "receivedBy": {
      "name": "Jane Smith"
    }
  }
]
```

---

### POST /api/magazines/[id]/receipts

Records that a magazine issue was received. Any authenticated user (STAFF or ADMIN) can do this.

**Request body:**

```json
{
  "receivedDate": "2025-03-10",
  "notes": "Optional notes about this issue"
}
```

`receivedDate` is an ISO date string. The receipt is attributed to the currently logged-in user.

**Error responses:**
- `400` -- `"receivedDate is required"`
- `404` -- `"Magazine not found"`

---

### GET /api/users

Returns all users (without password hashes), sorted by name. ADMIN only.

**Response example:**

```json
[
  {
    "id": "clx789ghi",
    "name": "Jane Smith",
    "email": "jane@library.org",
    "role": "STAFF",
    "active": true,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### POST /api/users

Creates a new user account. ADMIN only.

**Request body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@library.org",
  "password": "securepassword",
  "role": "STAFF"
}
```

- `role` defaults to `"STAFF"` if omitted
- `password` must be at least 8 characters
- `email` is stored lowercase and must be unique

**Error responses:**
- `400` -- `"Name, email, and password are required"` or `"Password must be at least 8 characters"`
- `403` -- `"Forbidden"`
- `409` -- `"A user with this email already exists"`

---

### PUT /api/users/[id]

Updates a user's active status and/or role. ADMIN only. Admins cannot modify their own account through this endpoint.

**Request body (all fields optional):**

```json
{
  "active": false,
  "role": "ADMIN"
}
```

**Error responses:**
- `400` -- `"Cannot modify your own account here"`
- `403` -- `"Forbidden"`
- `404` -- `"Not found"`

---

### DELETE /api/users/[id]

Deletes a user account. ADMIN only. Admins cannot delete their own account. Note: the user's receipt records remain in the database -- only the user account is deleted.

**Error responses:**
- `400` -- `"Cannot delete your own account"`
- `403` -- `"Forbidden"`
- `404` -- `"Not found"`

---

## Prisma P2025 Error Pattern

Several routes catch a specific Prisma error code to return a 404. Here is the pattern used throughout the codebase:

```ts
import { Prisma } from '@prisma/client'

try {
  await db.magazine.update({ where: { id }, data: validFields })
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
```

Prisma throws `P2025` when an `update()` or `delete()` targets a record that does not exist. Instead of doing a `findUnique()` check first and then updating (two queries), we attempt the operation directly and catch the specific error. This is both simpler and avoids race conditions.

---

## Audit Logging

Every mutating API route logs the action to `logs/audit.log` via `auditLog()`. See [business-logic.md](./business-logic.md) for the full list of logged actions. The logged events are:

- `LOGIN` -- user authenticated
- `LOGOUT` -- user logged out
- `MAGAZINE_CREATED` -- new magazine added
- `MAGAZINE_UPDATED` -- magazine details changed
- `MAGAZINE_DELETED` -- magazine removed
- `RECEIPT_CREATED` -- issue receipt recorded
- `USER_CREATED` -- new user account
- `USER_UPDATED` -- user status/role changed
- `USER_DELETED` -- user account removed
