import 'dotenv/config'
import Database from 'better-sqlite3'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

/**
 * Enable WAL (Write-Ahead Logging) mode on the SQLite database.
 * WAL allows concurrent reads while a write is in progress,
 * preventing report queries from blocking normal operations.
 */
function enableWalMode(url: string): void {
  const dbPath = url.replace(/^file:/, '')
  const raw = new Database(dbPath)
  raw.pragma('journal_mode = WAL')
  raw.close()
}

/**
 * Prisma client singleton — prevents multiple instances in Next.js dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env['DATABASE_URL']!
  enableWalMode(dbUrl)
  const adapter = new PrismaBetterSqlite3({ url: dbUrl })
  return new PrismaClient({ adapter })
}

const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
