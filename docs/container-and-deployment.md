# Container & Deployment

## Docker Image

The `Dockerfile` uses a multi-stage build on **Node.js 20-alpine**:

| Stage | Purpose |
|---|---|
| `deps` | Installs production dependencies (`npm ci`) |
| `builder` | Generates Prisma client, runs `next build` (standalone output) |
| `runner` | Production image — copies only built artifacts, runs as non-root user `nextjs` (UID 1001) |

The final image exposes port **3000** and starts with `node server.js` (Next.js standalone server).

## Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma:/app/prisma      # SQLite database
      - ./logs:/app/logs           # Audit log
    env_file:
      - .env.local
    restart: unless-stopped
```

**Persistent volumes** (must be backed up):

| Host Path | Container Path | Contents |
|---|---|---|
| `./prisma/` | `/app/prisma/` | SQLite database files (`dev.db`, `dev.db-shm`, `dev.db-wal`) |
| `./logs/` | `/app/logs/` | Audit log (`audit.log`) |

## Management Commands

```bash
# Start / stop / restart
docker compose up -d
docker compose down
docker compose restart

# View container logs (stdout/stderr)
docker compose logs -f app
docker compose logs --tail=100 app

# Rebuild after code changes
docker compose up -d --build

# Check container health
docker compose ps
docker inspect --format='{{.State.Status}}' epl-magazines-app-1

# Shell into running container
docker compose exec app sh
```

## Backup

Copy both persistent files while the container is running (SQLite WAL mode supports this):

```bash
cp prisma/dev.db backups/dev.db.$(date +%Y%m%d)
cp logs/audit.log backups/audit.log.$(date +%Y%m%d)
```

Always include the WAL files if they exist (`dev.db-shm`, `dev.db-wal`). These are temporary but contain uncommitted writes.
