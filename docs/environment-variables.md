# Environment Variables

## Required

| Variable | Purpose | Example |
|---|---|---|
| `SESSION_SECRET` | JWT signing key (32+ chars) | Output of `openssl rand -base64 32` |
| `DATABASE_URL` | SQLite database path | `file:./prisma/dev.db` |

## Optional

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | Runtime mode | `development` (dev) / `production` (build) |
| `PORT` | Server port | `3000` |

## Setup

```bash
# Create .env.local (never commit this file)
echo "SESSION_SECRET=$(openssl rand -base64 32)" > .env.local
echo 'DATABASE_URL="file:./prisma/dev.db"' >> .env.local
```
