# TypeScript Primer for Non-TS Peers

This project recently migrated from JavaScript to TypeScript. If you are comfortable with JavaScript but have never used TypeScript, this guide will walk you through everything you need to know -- using real examples from this codebase.

---

## What Is TypeScript?

TypeScript is JavaScript with **type annotations**. You write the same code you already know, but you add hints about what shape your data has. The TypeScript compiler checks these hints at build time and catches bugs before the code ever runs.

A `.ts` file is TypeScript. A `.tsx` file is TypeScript with JSX (React components).

**Key point:** TypeScript is removed at build time. The browser (or Node.js) never sees TypeScript -- it runs the plain JavaScript that TypeScript compiles into.

---

## Types vs Interfaces

These are the two ways to define the shape of an object in TypeScript. In this project, we use both.

### Interface

An interface describes the shape of an object:

```ts
// From types/index.ts:
interface SessionPayload {
  userId: string
  role: UserRole
  expiresAt: Date | string
}
```

This says: "A `SessionPayload` is an object with three properties: `userId` (a string), `role` (a `UserRole`), and `expiresAt` (either a `Date` or a string)."

### Type

A type alias can describe anything -- not just objects:

```ts
// From types/index.ts:
type UserRole = 'ADMIN' | 'STAFF'

type CadenceType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'

type MagazineStatus = 'overdue' | 'this_week' | 'upcoming' | 'never_received'
```

The `|` means "or" -- `UserRole` can be the string `'ADMIN'` or the string `'STAFF'`, nothing else.

### When to use which?

In this project:
- **`interface`** for object shapes (things with properties)
- **`type`** for unions (this-or-that values), simple aliases, and utility types

Both work similarly for objects. The convention is a style choice.

---

## Type Annotations on Variables

In JavaScript, you write:

```js
const name = 'Jane'
const count = 42
```

TypeScript can usually **infer** the type, so you do not need to annotate simple variables. But when the type is not obvious, you add an annotation:

```ts
// TypeScript infers this is a string:
const name = 'Jane'

// But sometimes you want to be explicit:
const role: UserRole = 'STAFF'
```

---

## Type Annotations on Functions

This is where TypeScript shines. You declare what a function accepts and what it returns:

```ts
// From lib/cadence.ts:
export function computeNextExpectedDate(
  lastReceivedDate: Date | string | null,  // parameter types
  cadence: CadenceType
): Date | null {                            // return type
  if (!lastReceivedDate) return null
  return CADENCE_OFFSETS[cadence](new Date(lastReceivedDate))
}
```

Reading this signature tells you everything:
- `lastReceivedDate` can be a `Date`, a string, or `null`
- `cadence` must be one of the `CadenceType` values
- The function returns a `Date` or `null`

If you pass a number or forget an argument, TypeScript will show an error before you even run the code.

### Async functions

For async functions, the return type is wrapped in `Promise<>`:

```ts
// From lib/session.ts:
export async function encrypt(payload: SessionPayload): Promise<string> {
  // ...
}
```

This means `encrypt` returns a Promise that resolves to a string.

### Void return

Functions that do not return anything use `void`:

```ts
// From lib/logger.ts:
export function auditLog(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown> = {}
): void {
  logger.info({ userId, action, ...details })
}
```

---

## Common TypeScript Syntax in This Project

### The `?` (optional) marker

A `?` after a property name means it is optional:

```ts
interface Magazine {
  notes: string | null      // required, but can be null
}

interface UpdateMagazineBody {
  name?: string             // optional -- may not be present at all
  cadence?: CadenceType
  notes?: string
  active?: boolean
}
```

The difference:
- `notes: string | null` -- the property must exist, but its value can be `null`
- `name?: string` -- the property may be absent entirely

### The `|` (union) operator

Means "one of these types":

```ts
type UserRole = 'ADMIN' | 'STAFF'

expiresAt: Date | string    // can be a Date object OR a string
```

### The `as` keyword (type assertion / cast)

Sometimes TypeScript does not know what type something is, and you need to tell it. The `as` keyword does this:

```ts
// From app/api/auth/login/route.ts:
const { email, password } = (await request.json()) as LoginBody
```

`request.json()` returns `any` (TypeScript does not know what the JSON body looks like). By writing `as LoginBody`, we tell TypeScript: "trust me, this JSON has `email` and `password` fields."

**Warning:** `as` does NOT validate the data at runtime. If the JSON body is actually `{ "foo": 123 }`, TypeScript will not catch that -- it only checks at compile time. The API routes still need to validate inputs manually (checking `if (!email || !password)`).

A more aggressive cast uses `as unknown as T`:

```ts
// From lib/db.ts:
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
```

This is a two-step cast: first to `unknown` (TypeScript's "I don't know" type), then to the target type. It is needed when TypeScript refuses a direct cast because the types are too different. In this project, these casts are marked with `// TODO: improve typing` comments.

### `Record<K, V>`

A built-in TypeScript utility type that means "an object whose keys are type K and values are type V":

```ts
// From lib/cadence.ts:
const CADENCE_OFFSETS: Record<CadenceType, (d: Date) => Date> = {
  WEEKLY:    (d) => addDays(d, 7),
  BI_WEEKLY: (d) => addDays(d, 14),
  // ...
}
```

This says: `CADENCE_OFFSETS` is an object where every key is a `CadenceType` and every value is a function that takes a `Date` and returns a `Date`.

### `Partial<T>`

Makes all properties of a type optional:

```ts
// From app/api/users/[id]/route.ts:
const validFields: Partial<UpdateUserBody> = {}
```

`Partial<UpdateUserBody>` means all fields of `UpdateUserBody` become optional. This is useful when building up an object field by field.

---

## Generics

Generics are like function parameters, but for types. They let you write reusable type definitions.

### The `<T>` syntax

```ts
// From types/index.ts:
type ApiResponse<T = undefined> =
  | { success: true; data?: T }
  | { error: string }
```

The `<T>` is a type parameter. When you use `ApiResponse`, you fill in `T`:

```ts
// A response carrying a Magazine:
type MagazineResponse = ApiResponse<Magazine>
// This means: { success: true; data?: Magazine } | { error: string }

// A response carrying nothing (using the default):
type SimpleResponse = ApiResponse
// This means: { success: true; data?: undefined } | { error: string }
```

The `= undefined` part is a default -- if you do not specify `T`, it defaults to `undefined`.

### `Promise<T>`

`Promise<string>` means "a Promise that will eventually resolve to a string." This is a generic -- `Promise` takes a type parameter that describes what it resolves to:

```ts
async function encrypt(payload: SessionPayload): Promise<string> { ... }
// When you await this: const token = await encrypt(payload) -- token is a string
```

---

## The `import type` Syntax

You will see two kinds of imports in this project:

```ts
import { addDays } from 'date-fns'           // imports a runtime value (a function)
import type { CadenceType } from '@/types'    // imports ONLY a type
```

`import type` tells TypeScript: "I only need this for type-checking. Do not include it in the compiled JavaScript." This makes the output slightly smaller and avoids circular dependency issues.

If you forget the `type` keyword, the code still works -- but the linter may warn you.

---

## The `extends` Keyword (for Interfaces)

```ts
// From types/index.ts:
interface MagazineWithStatus extends Magazine {
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
  status: MagazineStatus
  lastReceivedBy?: string | null
}
```

`extends` means "this interface has everything `Magazine` has, plus these extra fields." It is like inheritance for types. `MagazineWithStatus` has all of `Magazine`'s fields (`id`, `name`, `cadence`, etc.) plus the four new ones.

---

## The `unknown` Type

`unknown` is TypeScript's safe "I don't know" type. Unlike `any`, you cannot do anything with an `unknown` value without first checking what it is:

```ts
// From types/index.ts:
interface AuditLogEntry {
  timestamp: string
  level: string
  userId: string
  action: AuditAction | string
  [key: string]: unknown   // any other properties are unknown
}
```

The `[key: string]: unknown` part means "this object can have any other string keys, and their values are `unknown`." This is called an **index signature**.

---

## Common TypeScript Errors and What They Mean

### "Property 'X' does not exist on type 'Y'"

You are trying to access a property that is not declared in the type:

```ts
const user: AuthUser = await getUser()
user.passwordHash  // ERROR: 'passwordHash' does not exist on type 'AuthUser'
```

**Fix:** Either add the property to the type, or use a different type that includes it.

### "Type 'string' is not assignable to type 'UserRole'"

You are passing a generic string where a specific string union is expected:

```ts
const role: UserRole = someVariable  // ERROR if someVariable is type 'string'
```

**Fix:** Cast it or validate it:

```ts
const role: UserRole = someVariable as UserRole  // cast (unsafe)
// or validate:
if (someVariable === 'ADMIN' || someVariable === 'STAFF') {
  const role: UserRole = someVariable  // OK -- TypeScript narrows the type
}
```

### "Argument of type 'X | undefined' is not assignable to type 'X'"

You have a value that might be undefined, but the function expects a definite value:

```ts
const cookie = cookieStore.get('session')?.value  // type: string | undefined
await decrypt(cookie)  // decrypt accepts string | undefined, so this is OK
```

**Fix:** Check for undefined first, or design the function to accept `undefined` (like `decrypt` does).

### "Object is possibly 'null'"

You are accessing a property on something that might be null:

```ts
const session = await decrypt(cookie)  // type: SessionPayload | null
session.userId  // ERROR: session might be null
```

**Fix:** Check for null first:

```ts
if (!session?.userId) {
  redirect('/login')
}
// After this check, TypeScript knows session is not null
```

---

## TSDoc Comments

This project uses TSDoc (`/** */`) comments on all exported functions. These show up in your editor when you hover over a function:

```ts
/**
 * Computes the next expected delivery date from the last received date and cadence.
 * Returns `null` when the magazine has never been received.
 * @param lastReceivedDate - The most recent IssueReceipt.receivedDate, or null
 * @param cadence - Publication cadence
 */
export function computeNextExpectedDate(
  lastReceivedDate: Date | string | null,
  cadence: CadenceType
): Date | null {
```

The `@param` tags describe each parameter. Your editor (VS Code, etc.) will display this documentation when you hover over the function or use autocomplete.

---

## Quick Reference Table

| Syntax                   | What it means                                              | Example from this project                     |
|--------------------------|------------------------------------------------------------|-----------------------------------------------|
| `x: string`              | x is a string                                              | `userId: string`                              |
| `x: string \| null`      | x is a string or null                                      | `notes: string \| null`                       |
| `x?: string`             | x is optional (may be absent)                              | `notes?: string`                              |
| `type X = 'a' \| 'b'`   | X is one of these literal values                           | `type UserRole = 'ADMIN' \| 'STAFF'`          |
| `interface X { ... }`    | X is an object with these properties                       | `interface SessionPayload { ... }`            |
| `X extends Y`            | X has everything Y has, plus more                          | `MagazineWithStatus extends Magazine`         |
| `Record<K, V>`           | Object with keys of type K and values of type V            | `Record<CadenceType, string>`                 |
| `Partial<X>`             | All properties of X become optional                        | `Partial<UpdateUserBody>`                     |
| `Promise<X>`             | A Promise that resolves to X                               | `Promise<string>`                             |
| `as X`                   | Type assertion -- "trust me, this is type X"               | `(await request.json()) as LoginBody`         |
| `import type { X }`      | Import only the type (not at runtime)                      | `import type { CadenceType } from '@/types'`  |
| `[key: string]: unknown` | Object can have any other string keys                      | `AuditLogEntry` index signature               |
