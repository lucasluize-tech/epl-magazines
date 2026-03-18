# Components Reference

All custom components live in `components/`. The `components/ui/` subdirectory contains shadcn/ui primitives (Button, Input, Dialog, etc.) that are not documented here -- see [shadcn/ui docs](https://ui.shadcn.com/) for those.

---

## Quick Reference

| Component                  | File                            | Client/Server | Description                                  |
|----------------------------|---------------------------------|---------------|----------------------------------------------|
| `LoginForm`                | `components/LoginForm.js`       | Client        | Email + password form on the login page      |
| `Sidebar`                  | `components/Sidebar.js`         | Client        | Dashboard navigation sidebar with logout     |
| `MagazineCard`             | `components/MagazineCard.js`    | Client        | Dashboard card showing magazine status       |
| `MagazineStatusBadge`      | `components/MagazineStatusBadge.js` | Server    | Colored badge showing overdue/upcoming/etc   |
| `MagazineDetailActions`    | `components/MagazineDetailActions.js` | Client  | "Mark Received" button on magazine detail    |
| `MagazinesClientControls`  | `components/MagazinesClientControls.js` | Client | Filter bar + row-level actions on mag list   |
| `MarkReceivedDialog`       | `components/MarkReceivedDialog.js` | Client     | Dialog to record a magazine receipt          |
| `AdminMagazinesClient`     | `components/AdminMagazinesClient.js` | Client   | Admin table for managing magazines           |
| `AdminUsersClient`         | `components/AdminUsersClient.js` | Client       | Admin table for managing users               |
| `CreateMagazineDialog`     | `components/CreateMagazineDialog.js` | Client   | Dialog form to add a new magazine            |
| `EditMagazineDialog`       | `components/EditMagazineDialog.js` | Client     | Dialog form to edit an existing magazine     |
| `CreateUserDialog`         | `components/CreateUserDialog.js` | Client       | Dialog form to add a new user                |
| `DeleteConfirmDialog`      | `components/DeleteConfirmDialog.js` | Client    | Reusable "are you sure?" confirmation dialog |

---

## Detailed Component Documentation

### LoginForm

**File:** `components/LoginForm.js`
**Type:** Client component (`'use client'`)

The login form shown on the `/login` page. Handles email/password input, shows/hides password, displays errors, and redirects to `/dashboard` on success.

**Props:** none

**Usage:**

```jsx
// In app/(auth)/login/page.js:
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return <LoginForm />
}
```

**Behavior:**
- Submits credentials to `POST /api/auth/login`
- Shows a destructive `Alert` if login fails
- Shows a loading spinner while waiting for the response
- Redirects to `/dashboard` and calls `router.refresh()` on success

---

### Sidebar

**File:** `components/Sidebar.js`
**Type:** Client component (`'use client'`)

The left sidebar rendered inside the dashboard layout. Shows navigation links, admin-only links (if the user is an admin), the user's name/role badge, and a logout button.

**Props:**

| Prop   | Type       | Description                               |
|--------|------------|-------------------------------------------|
| `user` | `AuthUser` | The currently logged-in user object        |

The `AuthUser` shape is:

```ts
interface AuthUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'STAFF'
  active: boolean
}
```

**Usage:**

```jsx
// In app/(dashboard)/layout.js:
import Sidebar from '@/components/Sidebar'
import { getUser } from '@/lib/dal'

export default async function DashboardLayout({ children }) {
  const user = await getUser()
  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <main>{children}</main>
    </div>
  )
}
```

**Behavior:**
- Highlights the active nav link based on `usePathname()`
- Admin links (Manage Magazines, Manage Users, Audit Log) only appear when `user.role === 'ADMIN'`
- Logout button sends `POST /api/auth/logout` then redirects to `/login`

---

### MagazineCard

**File:** `components/MagazineCard.js`
**Type:** Client component (`'use client'`)

A card that displays one magazine on the dashboard. Shows the magazine name, cadence badge, last received date, next expected date, and a "Mark Received" button. The card's border and background color change based on the magazine's status (overdue = red, this week = yellow, upcoming = green, never received = gray).

**Props:**

| Prop       | Type                  | Description                                      |
|------------|-----------------------|--------------------------------------------------|
| `magazine` | `MagazineWithStatus`  | Magazine with computed status and dates           |

The `MagazineWithStatus` shape is:

```ts
interface MagazineWithStatus {
  id: string
  name: string
  cadence: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'
  active: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
  status: 'overdue' | 'this_week' | 'upcoming' | 'never_received'
  lastReceivedBy?: string | null
}
```

**Usage:**

```jsx
{magazines.map((mag) => (
  <MagazineCard key={mag.id} magazine={mag} />
))}
```

**Behavior:**
- Opens a `MarkReceivedDialog` when "Mark Received" is clicked
- Links to the magazine detail page `/magazines/[id]`
- Shows "Never received -- status unknown" when `nextExpectedDate` is null

---

### MagazineStatusBadge

**File:** `components/MagazineStatusBadge.js`
**Type:** Server component (no `'use client'` directive)

A small colored badge that displays the magazine's status as a human-readable label.

**Props:**

| Prop     | Type              | Description                                       |
|----------|-------------------|---------------------------------------------------|
| `status` | `MagazineStatus`  | One of: `'overdue'`, `'this_week'`, `'upcoming'`, `'never_received'` |

**Usage:**

```jsx
<MagazineStatusBadge status="overdue" />
// Renders: a red badge reading "Overdue"

<MagazineStatusBadge status="this_week" />
// Renders: a yellow badge reading "Expected This Week"

<MagazineStatusBadge status="upcoming" />
// Renders: a green badge reading "Upcoming"

<MagazineStatusBadge status="never_received" />
// Renders: a gray badge reading "Never Received"
```

---

### MagazineDetailActions

**File:** `components/MagazineDetailActions.js`
**Type:** Client component (`'use client'`)

A "Mark Received" button used on the magazine detail page (`/magazines/[id]`). Clicking it opens a `MarkReceivedDialog`.

**Props:**

| Prop       | Type     | Description                  |
|------------|----------|------------------------------|
| `magazine` | `object` | Must have `id` and `name`    |

**Usage:**

```jsx
<MagazineDetailActions magazine={{ id: 'clx123', name: 'The Economist' }} />
```

---

### MagazinesClientControls

**File:** `components/MagazinesClientControls.js`
**Type:** Client component (`'use client'`)

A dual-purpose component used on the magazines list page. It renders either a **filter bar** or **row-level actions** depending on the `mode` prop.

**Props:**

| Prop            | Type     | Description                                        |
|-----------------|----------|----------------------------------------------------|
| `mode`          | `string` | `'filter-bar'` or `'row-actions'`                  |
| `currentFilter` | `string` | Current status filter (only for filter-bar mode)    |
| `magazineId`    | `string` | Magazine ID (only for row-actions mode)             |
| `magazine`      | `object` | Full magazine object (only for row-actions mode)    |

**Usage as filter bar:**

```jsx
<MagazinesClientControls mode="filter-bar" currentFilter="all" />
```

Renders filter pills: All, Overdue, This Week, Upcoming, Never Received. Clicking a filter updates the URL query string (`?status=overdue`).

**Usage as row actions:**

```jsx
<MagazinesClientControls mode="row-actions" magazineId={mag.id} magazine={mag} />
```

Renders a small "Received" button that opens the mark-received dialog.

---

### MarkReceivedDialog

**File:** `components/MarkReceivedDialog.js`
**Type:** Client component (`'use client'`)

A modal dialog for recording that a magazine issue was received. Contains a date picker (defaulting to today) and an optional notes field.

**Props:**

| Prop           | Type       | Description                                |
|----------------|------------|--------------------------------------------|
| `magazine`     | `object`   | Must have `id` and `name`                  |
| `open`         | `boolean`  | Whether the dialog is visible              |
| `onOpenChange` | `function` | Callback when dialog open state changes    |

**Usage:**

```jsx
const [dialogOpen, setDialogOpen] = useState(false)

<MarkReceivedDialog
  magazine={magazine}
  open={dialogOpen}
  onOpenChange={setDialogOpen}
/>
```

**Behavior:**
- Submits to `POST /api/magazines/[id]/receipts`
- Shows a success toast on completion
- Calls `router.refresh()` to update the page data
- The date input's `max` is set to today (no future dates)

---

### AdminMagazinesClient

**File:** `components/AdminMagazinesClient.js`
**Type:** Client component (`'use client'`)

The main UI for the admin magazines management page (`/admin/magazines`). Displays a table of all magazines (including inactive ones) with actions to create, edit, toggle active/inactive, and delete.

**Props:**

| Prop        | Type                   | Description                             |
|-------------|------------------------|-----------------------------------------|
| `magazines` | `MagazineWithCount[]`  | All magazines with receipt counts       |

The `MagazineWithCount` shape is:

```ts
interface MagazineWithCount {
  id: string
  name: string
  cadence: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'
  active: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
  _count: { receipts: number }
}
```

**Usage:**

```jsx
// In app/(dashboard)/admin/magazines/page.js:
const magazines = await db.magazine.findMany({
  orderBy: { name: 'asc' },
  include: { _count: { select: { receipts: true } } },
})

return <AdminMagazinesClient magazines={magazines} />
```

**Behavior:**
- "Add Magazine" button opens `CreateMagazineDialog`
- Edit icon opens `EditMagazineDialog` for that magazine
- Toggle icon calls `PUT /api/magazines/[id]` to flip `active`
- Trash icon opens `DeleteConfirmDialog`, which calls `DELETE /api/magazines/[id]`
- Inactive magazines are shown at reduced opacity

---

### AdminUsersClient

**File:** `components/AdminUsersClient.js`
**Type:** Client component (`'use client'`)

The main UI for the admin users management page (`/admin/users`). Displays a table of all users with actions to create, toggle active/inactive, and delete.

**Props:**

| Prop            | Type           | Description                                    |
|-----------------|----------------|------------------------------------------------|
| `users`         | `AdminUser[]`  | All users with receipt counts                  |
| `currentUserId` | `string`       | The ID of the logged-in admin (to prevent self-delete) |

The `AdminUser` shape is:

```ts
interface AdminUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'STAFF'
  active: boolean
  createdAt: Date
  _count: { receipts: number }
}
```

**Usage:**

```jsx
const session = await verifySession()
const users = await db.user.findMany({
  orderBy: { name: 'asc' },
  include: { _count: { select: { receipts: true } } },
})

return <AdminUsersClient users={users} currentUserId={session.userId} />
```

**Behavior:**
- "Add User" button opens `CreateUserDialog`
- Toggle icon calls `PUT /api/users/[id]` to flip `active`
- Trash icon opens `DeleteConfirmDialog`, which calls `DELETE /api/users/[id]`
- The current user's row shows "(you)" and has no action buttons (cannot self-delete/deactivate)

---

### CreateMagazineDialog

**File:** `components/CreateMagazineDialog.js`
**Type:** Client component (`'use client'`)

A modal dialog with a form to create a new magazine. Contains fields for name, cadence (dropdown), and optional notes.

**Props:**

| Prop           | Type       | Description                                |
|----------------|------------|--------------------------------------------|
| `open`         | `boolean`  | Whether the dialog is visible              |
| `onOpenChange` | `function` | Callback when dialog open state changes    |

**Usage:**

```jsx
<CreateMagazineDialog open={createOpen} onOpenChange={setCreateOpen} />
```

**Behavior:**
- Submits to `POST /api/magazines`
- Shows a toast on success ("The Economist added to the collection")
- Resets the form fields on close
- The cadence dropdown uses `CADENCE_LABELS` from `lib/cadence.ts`

---

### EditMagazineDialog

**File:** `components/EditMagazineDialog.js`
**Type:** Client component (`'use client'`)

A modal dialog to edit an existing magazine's name, cadence, and notes.

**Props:**

| Prop           | Type       | Description                                |
|----------------|------------|--------------------------------------------|
| `magazine`     | `object`   | The magazine to edit (must have `id`, `name`, `cadence`, `notes`) |
| `open`         | `boolean`  | Whether the dialog is visible              |
| `onOpenChange` | `function` | Callback when dialog open state changes    |

**Usage:**

```jsx
<EditMagazineDialog
  magazine={editTarget}
  open={!!editTarget}
  onOpenChange={(v) => { if (!v) setEditTarget(null) }}
/>
```

**Behavior:**
- Pre-fills form fields from the `magazine` prop via `useEffect`
- Submits to `PUT /api/magazines/[id]`
- Shows a toast on success

---

### CreateUserDialog

**File:** `components/CreateUserDialog.js`
**Type:** Client component (`'use client'`)

A modal dialog to create a new user account. Contains fields for name, email, password, and role.

**Props:**

| Prop           | Type       | Description                                |
|----------------|------------|--------------------------------------------|
| `open`         | `boolean`  | Whether the dialog is visible              |
| `onOpenChange` | `function` | Callback when dialog open state changes    |

**Usage:**

```jsx
<CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
```

**Behavior:**
- Submits to `POST /api/users`
- Password must be at least 8 characters (enforced both client-side via `minLength` and server-side)
- Role defaults to STAFF; admin can select ADMIN from the dropdown
- Shows a toast on success

---

### DeleteConfirmDialog

**File:** `components/DeleteConfirmDialog.js`
**Type:** Client component (`'use client'`)

A reusable confirmation dialog used before any destructive action (deleting a magazine or user).

**Props:**

| Prop           | Type       | Description                                           |
|----------------|------------|-------------------------------------------------------|
| `open`         | `boolean`  | Whether the dialog is visible                         |
| `onOpenChange` | `function` | Callback when dialog open state changes               |
| `title`        | `string`   | Dialog title (e.g. `'Delete "The Economist"?'`)       |
| `description`  | `string`   | Explanation text (e.g. `'This will permanently...'`)  |
| `onConfirm`    | `function` | Async callback invoked when user clicks "Delete"      |

**Usage:**

```jsx
<DeleteConfirmDialog
  open={!!deleteTarget}
  onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
  title={`Delete "${deleteTarget.name}"?`}
  description="This will permanently delete the magazine and all receipt records."
  onConfirm={() => deleteMagazine(deleteTarget)}
/>
```

**Behavior:**
- Shows a loading spinner while `onConfirm` is executing
- Cancel button closes the dialog without calling `onConfirm`
- Uses the destructive button variant (red)

---

## shadcn/ui Components

The following shadcn/ui components are installed in `components/ui/`:

| Component        | File                       | Usage                                          |
|------------------|----------------------------|-------------------------------------------------|
| `Alert`          | `components/ui/alert.tsx`  | Error messages on the login form                |
| `Badge`          | `components/ui/badge.tsx`  | Status badges, role badges, cadence labels      |
| `Button`         | `components/ui/button.tsx` | All buttons throughout the app                  |
| `Card`           | `components/ui/card.tsx`   | Dashboard magazine cards                        |
| `Dialog`         | `components/ui/dialog.tsx` | All modal dialogs                               |
| `DropdownMenu`   | `components/ui/dropdown-menu.tsx` | Context menus                             |
| `Input`          | `components/ui/input.tsx`  | Text inputs, email inputs, date inputs          |
| `Label`          | `components/ui/label.tsx`  | Form field labels                               |
| `Select`         | `components/ui/select.tsx` | Cadence picker, role picker                     |
| `Separator`      | `components/ui/separator.tsx` | Visual dividers in the sidebar              |
| `Sonner`         | `components/ui/sonner.tsx` | Toast notification provider                     |
| `Table`          | `components/ui/table.tsx`  | Admin tables (magazines, users)                 |
| `Textarea`       | `components/ui/textarea.tsx` | Notes fields in dialogs                       |

These are generated files -- do not edit them directly. To add a new shadcn component:

```bash
npx shadcn@latest add <component-name>
```

---

## Server vs Client Components

**Server components** (no `'use client'` at the top) render on the server. They can directly access the database, read cookies, and use `async/await`. They cannot use React hooks (`useState`, `useEffect`, etc.) or browser APIs.

**Client components** (have `'use client'` at the top) render in the browser. They can use hooks, handle click events, and manage form state. They cannot directly access the database -- they must call API routes via `fetch()`.

In this project, most components are **client** components because they need interactive state (form inputs, dialog open/close, loading spinners). The data-fetching happens in **server** page components, which then pass the data down as props to client components.
