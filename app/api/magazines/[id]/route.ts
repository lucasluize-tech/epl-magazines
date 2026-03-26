import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { updateMagazineSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/magazines/[id]
 * Returns a single magazine by ID. Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(magazine)
  } catch (err) {
    console.error('Get magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/magazines/[id]
 * Updates name, cadence, notes, and/or active status. ADMIN only.
 * Soft-delete is via PUT { active: false }.
 * Only fields present in the body are updated (partial update).
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const data = parsed.data
    const validFields: Record<string, unknown> = {}
    if (data.name !== undefined) validFields.name = data.name
    if (data.cadence !== undefined) validFields.cadence = data.cadence
    if (data.language !== undefined) {
      const lang = data.language.trim()
      validFields.language = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase()
    }
    if (data.notes !== undefined) validFields.notes = data.notes?.trim() || null
    if (data.active !== undefined) validFields.active = data.active

    const before = await db.magazine.findUnique({ where: { id } })
    if (!before) return Response.json({ error: 'Not found' }, { status: 404 })

    const magazine = await withRetry(() => db.magazine.update({ where: { id }, data: validFields }))

    // Build "field: old → new" for only the fields that actually changed
    const changes = Object.entries(validFields)
      .filter(([k]) => String(before[k as keyof typeof before]) !== String(validFields[k as keyof typeof validFields]))
      .map(([k, v]) => `${k}: ${before[k as keyof typeof before]} → ${v}`)
      .join(', ')

    auditLog(session.userId, 'MAGAZINE_UPDATED', { magazineName: before.name, changes: changes || 'no changes' })
    return Response.json(magazine)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
