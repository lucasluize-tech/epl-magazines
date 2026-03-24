# API Routes

## Auth

| Method | Route | Auth | Admin | Description |
|---|---|---|---|---|
| POST | `/api/auth/login` | No | No | Validate credentials, create session |
| POST | `/api/auth/logout` | No | No | Clear session cookie |

## Magazines

| Method | Route | Auth | Admin | Description |
|---|---|---|---|---|
| GET | `/api/magazines` | Yes | No | List all active magazines |
| POST | `/api/magazines` | Yes | Yes | Create a magazine |
| GET | `/api/magazines/[id]` | Yes | No | Get magazine details |
| PUT | `/api/magazines/[id]` | Yes | Yes | Update magazine |
| DELETE | `/api/magazines/[id]` | Yes | Yes | Delete magazine and all receipts |
| GET | `/api/magazines/[id]/receipts` | Yes | No | List receipts (filterable by `branchId`) |
| POST | `/api/magazines/[id]/receipts` | Yes | No | Record a new receipt |
| PUT | `/api/magazines/[id]/receipts` | Yes | Yes | Edit most recent receipt date |

## Branches

| Method | Route | Auth | Admin | Description |
|---|---|---|---|---|
| GET | `/api/branches` | Yes | No | List all active branches |
| GET | `/api/branches/[id]/magazines` | Yes | No | List subscribed magazines for branch |
| POST | `/api/branches/[id]/magazines` | Yes | Yes | Add magazine subscription |
| PUT | `/api/branches/[id]/magazines/[magazineId]` | Yes | Yes | Update subscription (quantity, active) |
| DELETE | `/api/branches/[id]/magazines/[magazineId]` | Yes | Yes | Remove subscription |

## Transfers

| Method | Route | Auth | Admin | Description |
|---|---|---|---|---|
| GET | `/api/transfers` | Yes | No | List transfers (filter by status, branchId) |
| POST | `/api/transfers` | Yes | No | Initiate transfer from active branch |
| PUT | `/api/transfers/[id]/complete` | Yes | No | Complete transfer (receiving branch) |
| PUT | `/api/transfers/[id]/cancel` | Yes | Yes | Cancel pending transfer |

## Users

| Method | Route | Auth | Admin | Description |
|---|---|---|---|---|
| GET | `/api/users` | Yes | Yes | List all users |
| POST | `/api/users` | Yes | Yes | Create user |
| PUT | `/api/users/[id]` | Yes | Yes | Update user role/status |
| DELETE | `/api/users/[id]` | Yes | Yes | Delete user |
| PUT | `/api/users/profile` | Yes | No | Update own name/password |

## Error Responses

All API routes return consistent error shapes:

| Status | Meaning | Common Causes |
|---|---|---|
| 400 | Bad Request | Missing required fields, invalid input |
| 401 | Unauthorized | Missing or invalid session cookie |
| 403 | Forbidden | Non-admin attempting admin action |
| 404 | Not Found | Resource doesn't exist (Prisma P2025) |
| 409 | Conflict | Duplicate entry (e.g., duplicate subscription) |
| 503 | Service Unavailable | `SQLITE_BUSY` / `SQLITE_LOCKED` after retries exhausted |
