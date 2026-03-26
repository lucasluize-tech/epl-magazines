import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createMagazineSchema } from '@/lib/validations'

/**
 * GET /api/magazines
 * Returns all active magazines ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const magazines = await db.magazine.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
    return Response.json(magazines)
  } catch (err) {
    console.error('List magazines error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/magazines
 * Creates a new magazine. ADMIN only. Body: { name, cadence, language?, notes? }.
 * Returns 201 with the created magazine, or 400/403 on validation/auth failure.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    const parsed = createMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name, cadence, language, notes } = parsed.data

    /** Normalize language: "hindi" → "Hindi", "GUJARATI" → "Gujarati" */
    const normalizedLanguage = language?.trim()
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : 'English'

    const magazine = await withRetry(() => db.magazine.create({
      data: { name: name.trim(), cadence, language: normalizedLanguage, notes: notes?.trim() || null },
    }))

    auditLog(session.userId, 'MAGAZINE_CREATED', { name: magazine.name })
    return Response.json(magazine, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
