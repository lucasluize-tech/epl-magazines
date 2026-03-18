import { PrismaClient } from '../app/generated/prisma/client'

/**
 * Prisma client singleton — prevents multiple instances in Next.js dev hot-reload.
 * `globalThis as unknown as { prisma: PrismaClient | undefined }` is intentional:
 * globalThis has no prisma key in its type definition.
 * // TODO: improve typing — track upstream Prisma/Next.js recommendation for this pattern
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

// Prisma 7's new prisma-client TypeScript types require constructor options,
// but the runtime resolves the database URL from DATABASE_URL env variable.
// TODO: improve typing — pass explicit adapter when Prisma 7 SQLite adapter is fully stable
const db: PrismaClient =
  globalForPrisma.prisma ??
  new (PrismaClient as unknown as new () => PrismaClient)()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
