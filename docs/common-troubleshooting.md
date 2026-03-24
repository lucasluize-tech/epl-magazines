# Common Troubleshooting

## Container Issues

| Symptom | Diagnosis | Fix |
|---|---|---|
| Container won't start | `docker compose logs app` | Check for missing env vars in `.env.local` |
| Port 3000 already in use | `lsof -i :3000` | Stop conflicting process or change port mapping |
| App starts but pages 500 | `docker compose logs -f app` | Usually missing `SESSION_SECRET` or database file |
| Container restarts in loop | `docker inspect --format='{{.State.ExitCode}}'` | Check build errors, missing dependencies |

## Database Issues

| Symptom | Diagnosis | Fix |
|---|---|---|
| "Database is busy" (503) | Multiple concurrent writes | Wait and retry; check for stuck processes |
| Database file missing | `ls -la prisma/dev.db` | Run `npx prisma migrate dev` to recreate |
| Schema out of sync | `npx prisma migrate status` | Run `npx prisma migrate deploy` |
| Prisma client errors | Generated client stale | Run `npx prisma generate` |
| Integrity errors | `sqlite3 prisma/dev.db "PRAGMA integrity_check;"` | If not "ok", restore from backup |
| WAL file very large | Heavy write activity | `sqlite3 prisma/dev.db "PRAGMA wal_checkpoint(TRUNCATE);"` |

## Authentication Issues

| Symptom | Diagnosis | Fix |
|---|---|---|
| Instant redirect to /login | Session cookie missing/expired | Log in again; check `SESSION_SECRET` hasn't changed |
| Login works then immediately logs out | `SESSION_SECRET` changed between requests | Ensure consistent `SESSION_SECRET` across restarts |
| "Unauthorized" on API calls | Cookie not sent | Check `SameSite`/`Secure` settings match deployment |
| Deactivated user can still browse | Session still valid | `verifySession()` checks `user.active`; should auto-redirect |

## Log Issues

| Symptom | Diagnosis | Fix |
|---|---|---|
| No audit.log file | `logs/` directory missing | Create `logs/` directory; app creates it on startup |
| Log file not updating | Winston transport error | Check file permissions; restart container |
| Log file too large | No rotation configured | Set up logrotate (see [Application Logs](application-logs.md)) |
| Malformed JSON in log | Concurrent write corruption | Rare with Winston; rotate and start fresh |

## Build & Development Issues

| Symptom | Diagnosis | Fix |
|---|---|---|
| Type errors after schema change | `npx tsc --noEmit` | Run `npx prisma generate` first |
| Middleware changes not taking effect | Stale `.next/` cache | Delete `.next/` and restart dev server |
| Seed script fails with env error | `.env.local` not loaded by `tsx` | Ensure `import 'dotenv/config'` at top of `prisma/seed.ts` |
| `prisma migrate reset` fails | AI safety gate | Set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var |
| Worktree branch merged but Prisma errors | Generated client not carried over | Run `npx prisma generate` after merge |
