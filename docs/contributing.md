# Contributing Guide

How to add features, fix bugs, and maintain consistency in this project.

---

## File Naming Conventions

| What                 | Convention             | Example                           |
|----------------------|------------------------|-----------------------------------|
| Pages                | `page.js` or `page.tsx` | `app/(dashboard)/magazines/page.js` |
| Layouts              | `layout.js`            | `app/(dashboard)/layout.js`       |
| API routes           | `route.ts`             | `app/api/magazines/route.ts`      |
| Components           | `PascalCase.js`        | `components/MagazineCard.js`      |
| shadcn/ui components | `kebab-case.tsx`       | `components/ui/badge.tsx`         |
| Library modules      | `camelCase.ts`         | `lib/cadence.ts`                  |
| Types                | `index.ts`             | `types/index.ts`                  |

### When to use .ts vs .js

- **`.ts`** -- library modules (`lib/`), API routes (`app/api/`), and the proxy/middleware. These benefit most from type safety.
- **`.js`** -- page components and custom components (`components/`). These are gradually being migrated to TypeScript. New components can be either `.js` or `.tsx`.
- **`.tsx`** -- shadcn/ui components (generated). Do not rename these.

---

## Adding a New Component

1. Create the file in `components/` using PascalCase:

```bash
# Example: components/OverdueAlert.js
```

2. Decide if it needs to be a **client** or **server** component:

   - **Client** (`'use client'` at top): needs hooks (`useState`, `useEffect`), event handlers (`onClick`), or browser APIs
   - **Server** (no directive): only renders UI from props, no interactivity

3. If it has props, document them with a comment or (if it is a `.tsx` file) with a TypeScript interface:

```tsx
// In a .tsx file:
interface OverdueAlertProps {
  magazineName: string
  daysOverdue: number
}

export default function OverdueAlert({ magazineName, daysOverdue }: OverdueAlertProps) {
  // ...
}
```

```js
// In a .js file, add a JSDoc comment:
/**
 * @param {{ magazineName: string, daysOverdue: number }} props
 */
export default function OverdueAlert({ magazineName, daysOverdue }) {
  // ...
}
```

4. Import and use it in a page or another component:

```jsx
import OverdueAlert from '@/components/OverdueAlert'
```

---

## Adding a New API Route

1. Create the directory structure under `app/api/`:

```
app/api/your-resource/
  route.ts          # GET, POST
  [id]/
    route.ts        # GET, PUT, DELETE
```

2. Export named functions for each HTTP method:

```ts
import type { NextRequest } from 'next/server'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import db from '@/lib/db'

export async function GET(): Promise<Response> {
  try {
    await verifySession()
    // ... fetch data
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

3. Follow these patterns from the existing routes:

   - **Always call `verifySession()`** at the top of every handler
   - **Check `session.role`** for admin-only operations
   - **Validate input** before using it
   - **Catch Prisma P2025** for update/delete on missing records:

     ```ts
     import { Prisma } from '@prisma/client'

     } catch (err) {
       if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
         return Response.json({ error: 'Not found' }, { status: 404 })
       }
       return Response.json({ error: 'Internal server error' }, { status: 500 })
     }
     ```

   - **Call `auditLog()`** for any data mutation
   - **Return consistent error shapes:** `{ error: "message" }` with an appropriate status code

4. If you need dynamic route parameters (like `[id]`):

```ts
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const { id } = await params
  // ...
}
```

Note: in Next.js 16, `params` is a Promise -- you must `await` it.

---

## Adding a New Library Function

1. Add it to the appropriate file in `lib/`, or create a new file if it is a new domain:

```ts
// lib/cadence.ts -- for cadence-related logic
// lib/session.ts -- for session/auth logic
// lib/dal.ts     -- for data access
// lib/logger.ts  -- for audit logging
// lib/db.ts      -- for database client (rarely changed)
```

2. **Add a TSDoc comment** on every exported function:

```ts
/**
 * Computes something useful.
 * @param input - Description of what this parameter is
 * @returns Description of the return value
 */
export function computeSomething(input: string): number {
  // ...
}
```

3. **Add the type** to `types/index.ts` if you introduce a new data shape:

```ts
/** Description of what this represents */
export interface NewThing {
  id: string
  name: string
}
```

4. Import using the `@/` alias:

```ts
import { computeSomething } from '@/lib/cadence'
import type { NewThing } from '@/types'
```

---

## Adding a New Type

All shared types live in `types/index.ts`. Keep them organized by section (the file has comment headers for Auth, API, Magazine, Receipts, Users, Audit).

```ts
// types/index.ts

// ---------------------------------------------------------------------------
// Your Section
// ---------------------------------------------------------------------------

/** Description of what this type represents */
export interface YourNewType {
  id: string
  // ...
}
```

Guidelines:
- Use `interface` for object shapes
- Use `type` for unions and aliases
- Add a TSDoc comment (`/** */`) on every exported type
- Use `string` for IDs (they are CUIDs)
- Use `Date` for timestamps (even though JSON serialization turns them into strings)

---

## Adding a shadcn/ui Component

shadcn/ui components are installed via the CLI, not written by hand:

```bash
npx shadcn@latest add <component-name>
```

Examples:

```bash
npx shadcn@latest add tooltip
npx shadcn@latest add tabs
npx shadcn@latest add sheet
```

This creates a file in `components/ui/` (e.g., `components/ui/tooltip.tsx`). **Do not edit these files directly** -- they are generated and may be overwritten by future updates.

To use the new component:

```jsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
```

Currently installed shadcn components:
- alert, badge, button, card, dialog, dropdown-menu, input, label, select, separator, sonner, table, textarea

---

## Adding a New Page

1. Create a directory and `page.js` file under the appropriate route group:

```
app/(dashboard)/your-page/page.js    # authenticated page
app/(auth)/your-page/page.js         # public page
```

2. Pages are **server components** by default. Fetch data directly:

```jsx
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'

export default async function YourPage() {
  await verifySession()
  const data = await db.someModel.findMany()

  return (
    <div>
      <h1>Your Page</h1>
      {/* render data */}
    </div>
  )
}
```

3. If the page needs admin access, check the role:

```jsx
import { getUser } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/')

  // ...
}
```

4. Pass data to client components via props:

```jsx
import YourClientComponent from '@/components/YourClientComponent'

export default async function YourPage() {
  const data = await fetchData()
  return <YourClientComponent data={data} />
}
```

---

## Database Schema Changes

1. Edit `prisma/schema.prisma`
2. Run the migration:

```bash
npx prisma migrate dev --name describe-your-change
```

3. If you added a new model or field, add the corresponding TypeScript type to `types/index.ts`
4. Update any API routes, components, or lib functions that use the changed model

**Important:** migrations are permanent SQL files. Once you push a migration, do not edit it -- create a new migration for further changes.

---

## Pre-Commit Checks

Before committing, run:

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build (catches runtime issues)
npm run build
```

### Type checking (`tsc --noEmit`)

This runs the TypeScript compiler without producing output files -- it only checks for type errors. Fix all errors before committing.

Common issues:
- Missing type annotations on new functions
- Passing the wrong type to a function
- Accessing a property that does not exist on a type

### Linting (`npm run lint`)

Runs ESLint with the Next.js configuration. Fix warnings and errors before committing.

### Build (`npm run build`)

Runs a full production build. This catches issues that type-checking alone might miss, like invalid imports or broken server/client component boundaries.

---

## Code Style Quick Reference

- **Indent:** 2 spaces (configured by the editor/ESLint)
- **Semicolons:** no (the project does not use semicolons)
- **Quotes:** single quotes for JS/TS, double quotes in JSX attributes
- **Imports:** use `@/` alias (maps to the project root)
- **Component exports:** `export default function ComponentName()` (not arrow functions)
- **Types:** prefer `interface` for objects, `type` for unions
- **Null vs undefined:** use `null` for database nullable fields, `undefined` for optional parameters
- **Error handling:** wrap API route bodies in `try/catch`, always return a JSON error response

---

## Where to Find Things

| Looking for...                | Location                          |
|-------------------------------|-----------------------------------|
| Database schema               | `prisma/schema.prisma`            |
| TypeScript types              | `types/index.ts`                  |
| Session/auth functions        | `lib/session.ts`, `lib/dal.ts`    |
| Cadence/business logic        | `lib/cadence.ts`                  |
| Audit logging                 | `lib/logger.ts`                   |
| Database client               | `lib/db.ts`                       |
| Route middleware              | `proxy.ts`                        |
| API endpoints                 | `app/api/`                        |
| Page components               | `app/(dashboard)/`, `app/(auth)/` |
| UI components                 | `components/`                     |
| shadcn primitives             | `components/ui/`                  |
| Documentation                 | `docs/`                           |
| Docker config                 | `Dockerfile`, `docker-compose.yml`|
| Environment variables         | `.env.local` (not in git)         |
