# Deployment

The app runs on Docker Compose. It is designed for **internal LAN only** -- it should never be exposed to the internet.

---

## Docker Compose Configuration

The `docker-compose.yml` file:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma:/app/prisma      # SQLite file persistence
      - ./logs:/app/logs          # Audit log persistence
    env_file:
      - .env.local
    restart: unless-stopped
```

### Field-by-field explanation

| Field               | Value                         | What it does                                                                 |
|---------------------|-------------------------------|-----------------------------------------------------------------------------|
| `build: .`          | Current directory             | Builds the Docker image using the `Dockerfile` in the project root          |
| `ports: "3000:3000"`| host:container                | Maps port 3000 on the host to port 3000 in the container                    |
| `volumes` (prisma)  | `./prisma:/app/prisma`        | Mounts the local `prisma/` directory into the container so `dev.db` persists |
| `volumes` (logs)    | `./logs:/app/logs`            | Mounts the local `logs/` directory so `audit.log` persists                   |
| `env_file`          | `.env.local`                  | Loads environment variables from the `.env.local` file                       |
| `restart`           | `unless-stopped`              | Auto-restarts the container if it crashes (unless manually stopped)          |

---

## Dockerfile

The Dockerfile uses a multi-stage build for a smaller production image:

```dockerfile
FROM node:20-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### Build stages

1. **deps** -- Installs `node_modules` using `npm ci` (clean install from lockfile). Uses `libc6-compat` for native modules like bcrypt.
2. **builder** -- Copies the source code, generates the Prisma client, and runs `npm run build` (Next.js production build).
3. **runner** -- The final slim image. Copies only what is needed to run: the standalone Next.js output, static files, Prisma client, and schema. Runs as a non-root user (`nextjs`).

The final image uses Next.js's standalone output mode (`output: 'standalone'` in `next.config.mjs`), which bundles only the necessary Node.js files -- much smaller than copying all of `node_modules`.

---

## Environment Variables

Create a `.env.local` file in the project root (never commit this file):

```bash
# Required: Secret key for signing session JWTs
SESSION_SECRET=<generate with: openssl rand -base64 32>

# Required: Path to the SQLite database file
DATABASE_URL="file:./prisma/dev.db"
```

| Variable         | Required | Description                                     |
|------------------|----------|-------------------------------------------------|
| `SESSION_SECRET` | Yes      | Base64 key for JWT signing. Generate a new one for each deployment. |
| `DATABASE_URL`   | Yes      | SQLite file path. The default `file:./prisma/dev.db` works for both dev and Docker. |

---

## Startup Sequence

When you run `docker compose up --build`:

1. Docker builds the image (installs deps, generates Prisma client, builds Next.js)
2. The container starts with `node server.js`
3. Next.js starts listening on port 3000
4. The SQLite database file at `prisma/dev.db` is used (created by the volume mount)
5. The `logs/` directory is mounted for audit log persistence

**First-time setup:** The database file will be empty on first run. You need to apply migrations and seed data:

```bash
# Apply all migrations
docker compose exec app npx prisma migrate deploy

# Seed with sample data
docker compose exec app node prisma/seed.js
```

Or, for development without Docker:

```bash
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

---

## Volume Mounts

Two directories are mounted as Docker volumes to persist data across container restarts and rebuilds:

### prisma/ (SQLite database)

```
Host: ./prisma/  -->  Container: /app/prisma/
```

Contains:
- `dev.db` -- the SQLite database file
- `migrations/` -- Prisma migration files (SQL)
- `schema.prisma` -- the schema definition

The database file is the most important thing to back up. Everything else can be regenerated from the source code.

### logs/ (Audit log)

```
Host: ./logs/  -->  Container: /app/logs/
```

Contains:
- `audit.log` -- JSON-lines file with all audit events

The `lib/logger.ts` module creates the `logs/` directory automatically if it does not exist.

---

## Backup Procedure

Since all persistent data is in two files, backups are simple file copies.

### Manual backup

```bash
# Stop writes (optional but safest for SQLite)
docker compose stop

# Copy the database
cp prisma/dev.db backups/dev.db.$(date +%Y%m%d)

# Copy the audit log
cp logs/audit.log backups/audit.log.$(date +%Y%m%d)

# Restart
docker compose start
```

### Automated backup (cron example)

```bash
# Add to crontab: daily backup at 2am
0 2 * * * cp /path/to/project/prisma/dev.db /path/to/backups/dev.db.$(date +\%Y\%m\%d)
0 2 * * * cp /path/to/project/logs/audit.log /path/to/backups/audit.log.$(date +\%Y\%m\%d)
```

### Restoring from backup

```bash
docker compose stop
cp backups/dev.db.20250315 prisma/dev.db
docker compose start
```

**Important:** SQLite is not designed for concurrent writes. With max 2-3 concurrent users on a LAN, this is not a concern, but do not run backup copies while the app is under heavy write load. Stopping the container first is the safest approach.

---

## Common Operations

### Rebuild and restart

```bash
docker compose up --build -d
```

### View logs

```bash
# Application logs (stdout)
docker compose logs -f app

# Audit log
tail -f logs/audit.log | python3 -m json.tool
```

### Open a shell in the container

```bash
docker compose exec app sh
```

### Run Prisma commands inside the container

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma studio
```

### Stop everything

```bash
docker compose down
```

This stops the container but preserves the volumes (database and logs). To also remove volumes:

```bash
docker compose down -v   # WARNING: this deletes the database!
```

---

## Network Considerations

The app is designed for internal LAN use only. The `docker-compose.yml` binds to all interfaces (`0.0.0.0:3000`), so any machine on the same network can access it.

- **No HTTPS:** The app uses plain HTTP. Since it is LAN-only, this is acceptable. If you need HTTPS, put a reverse proxy (nginx, Caddy) in front of it.
- **No rate limiting:** There is no built-in rate limiting. With 2-3 concurrent users, this is not needed.
- **Session cookie:** `secure: true` is only set when `NODE_ENV === 'production'`. In the Docker container, `NODE_ENV` is set to `production`, so the cookie requires HTTPS. If you are running production without HTTPS on a LAN, you may need to adjust this or add a TLS-terminating proxy.
