# Onboarding Guide

Step-by-step instructions to get the EPL Magazine Tracker running on your local machine.

---

## Prerequisites

Make sure you have these installed before starting:

| Tool       | Version  | How to check           | Install from                          |
|------------|----------|------------------------|---------------------------------------|
| Node.js    | 20+      | `node --version`       | https://nodejs.org/ (LTS)             |
| npm        | 10+      | `npm --version`        | Comes with Node.js                    |
| Git        | Any      | `git --version`        | https://git-scm.com/                  |
| Docker*    | 24+      | `docker --version`     | https://docs.docker.com/get-docker/   |

*Docker is only needed for production deployment. For local development, Node.js is enough.

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd epl-magazines
```

---

## Step 2: Set Up Environment Variables

Create a `.env.local` file in the project root:

```bash
# Generate a secure session secret
openssl rand -base64 32
```

Then create the file:

```bash
# .env.local
SESSION_SECRET=<paste the generated secret here>
DATABASE_URL="file:./prisma/dev.db"
```

**Never commit `.env.local` to git.** It is already in `.gitignore`.

---

## Step 3: Install Dependencies

```bash
npm install
```

This installs all packages listed in `package.json`, including:
- **next** -- the web framework
- **prisma** -- database ORM
- **bcrypt** -- password hashing
- **jose** -- JWT sessions
- **date-fns** -- date math
- **winston** -- audit logging
- **tailwindcss** / **shadcn** -- UI styling

---

## Step 4: Generate the Prisma Client

```bash
npx prisma generate
```

This generates the TypeScript database client from the schema in `prisma/schema.prisma`. The output goes to `app/generated/prisma/`.

You need to re-run this whenever the schema changes or after a fresh `npm install`.

---

## Step 5: Create and Migrate the Database

```bash
npx prisma migrate dev
```

This does two things:
1. Creates the SQLite database file at `prisma/dev.db`
2. Applies all migration SQL files to set up the tables

If prompted for a migration name, you can enter anything (e.g., "init"). If all migrations are already applied, it will say "Already in sync."

---

## Step 6: Seed Sample Data

```bash
node prisma/seed.js
```

This creates:
- **Admin account:** `admin@library.org` / `admin1234`
- **Staff account:** `staff@library.org` / `staff1234`
- **8 sample magazines** with random receipt history

You should see:

```
Seeding database...
Seed complete
  Admin: admin@library.org / admin1234
  Staff: staff@library.org / staff1234
```

---

## Step 7: Start the Development Server

```bash
npm run dev
```

The app starts at **http://localhost:3000**.

Next.js watches your files for changes and hot-reloads the browser automatically. You do not need to restart the server when you edit code.

---

## Step 8: Log In

Open http://localhost:3000 in your browser. You will be redirected to the login page.

Use one of the seed accounts:

| Role  | Email               | Password     |
|-------|---------------------|--------------|
| Admin | admin@library.org   | admin1234    |
| Staff | staff@library.org   | staff1234    |

**Admin** accounts can see the full sidebar (Dashboard, Magazines, Manage Magazines, Manage Users, Audit Log).

**Staff** accounts can see Dashboard and Magazines only.

---

## Step 9: Explore the App

### Dashboard (/)

Shows all active magazines grouped by status:
- **Overdue** (red) -- expected delivery date has passed
- **Expected This Week** (yellow) -- due within 7 days
- **Upcoming** (green) -- more than 7 days away
- **Never Received** (gray) -- no receipts recorded yet

### Magazines (/magazines)

A list of all active magazines with filters. Click "Received" to record a new receipt. Click the detail link to see the receipt history.

### Magazine Detail (/magazines/[id])

Shows the full receipt history for one magazine and a "Mark Received" button.

### Admin: Manage Magazines (/admin/magazines)

Create, edit, activate/deactivate, and delete magazines. Admin only.

### Admin: Manage Users (/admin/users)

Create new user accounts, activate/deactivate users, and delete users. Admin only. You cannot delete or deactivate your own account.

### Audit Log (/log)

View all actions logged to `logs/audit.log`. Admin only.

---

## Useful Development Commands

| Command                                    | What it does                                       |
|--------------------------------------------|----------------------------------------------------|
| `npm run dev`                              | Start the dev server with hot reload               |
| `npm run build`                            | Build for production                               |
| `npm run lint`                             | Run ESLint                                         |
| `npx prisma studio`                        | Open a visual database browser at localhost:5555   |
| `npx prisma generate`                      | Regenerate Prisma client after schema changes      |
| `npx prisma migrate dev --name <name>`     | Create and apply a new migration                   |
| `node prisma/seed.js`                      | Re-seed the database with sample data              |
| `npx shadcn@latest add <component>`        | Add a new shadcn/ui component                      |

---

## Project Structure at a Glance

```
epl-magazines/
  app/              # Next.js pages, layouts, and API routes
    api/             # REST API endpoints
    (auth)/          # Login page (unauthenticated routes)
    (dashboard)/     # Dashboard, magazines, admin pages (authenticated routes)
    generated/       # Prisma generated client (do not edit)
  components/        # React components
    ui/              # shadcn/ui primitives (do not edit directly)
  lib/               # Shared utilities (session, db, cadence, logging)
  types/             # TypeScript type definitions
  prisma/            # Database schema, migrations, seed script
  docs/              # This documentation
  logs/              # Audit log output (git-ignored)
```

---

## Troubleshooting

### "SESSION_SECRET is not set"

You forgot to create `.env.local` or the variable is missing. See Step 2.

### "Cannot find module '@prisma/client'"

Run `npx prisma generate` to generate the Prisma client. See Step 4.

### Database is empty / no tables

Run `npx prisma migrate dev` to create the tables. See Step 5.

### Login says "Invalid email or password"

Make sure you ran the seed script (`node prisma/seed.js`). Check the email is exactly `admin@library.org` or `staff@library.org`.

### Port 3000 is already in use

Another process is using port 3000. Either stop it or start the dev server on a different port:

```bash
PORT=3001 npm run dev
```

### Changes to schema.prisma are not reflected

After editing the schema, you need to:
1. `npx prisma migrate dev --name describe-change` (creates and applies migration)
2. The Prisma client is regenerated automatically as part of this command

---

## Next Steps

- Read [auth.md](./auth.md) to understand how sessions and login work
- Read [api.md](./api.md) for the full API reference
- Read [business-logic.md](./business-logic.md) to understand the cadence and overdue logic
- Read [typescript.md](./typescript.md) if you are new to TypeScript
- Read [contributing.md](./contributing.md) for guidelines on making changes
