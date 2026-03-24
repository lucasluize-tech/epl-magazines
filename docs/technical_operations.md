# EPL Magazine Tracker — Technical Operations Guide

Reference document for IT staff responsible for deploying, maintaining, and troubleshooting the EPL Magazine Tracker application.

## Tech Stack Summary

| Component | Technology |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript (`strict: true`) |
| Database | SQLite via Prisma v7 (WAL mode, file-based) |
| Auth | JWT sessions (jose + bcrypt, 7-day expiry) |
| Logging | Winston (JSON lines to `logs/audit.log`) |
| Container | Docker (Node 20-alpine, multi-stage build) |
| Styling | Tailwind CSS + shadcn/ui |

## Sections

| Topic | Document |
|---|---|
| Docker image, Compose, management commands, backups | [Container & Deployment](container-and-deployment.md) |
| Audit log format, logged actions, reading & rotating logs | [Application Logs](application-logs.md) |
| SQLite files, Prisma connection, schema models, migrations | [Database](database.md) |
| Receipt, transfer, auth, and dashboard computation flows | [Data Flows](data-flows.md) |
| Full API inventory (22 endpoints), auth requirements, errors | [API Routes](api-routes.md) |
| Session cookie, JWT, Edge middleware, defense in depth | [Authentication & Sessions](authentication-and-sessions.md) |
| Core type definitions, conventions, type checking | [TypeScript Types](typescript-types.md) |
| Project structure, rendering model, retry logic, linting | [Application Code Logic](application-code-logic.md) |
| Required and optional env vars, setup instructions | [Environment Variables](environment-variables.md) |
| Diagnostic tables for container, DB, auth, log, and build issues | [Common Troubleshooting](common-troubleshooting.md) |
