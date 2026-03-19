import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'

/**
 * GET /api/branches
 * Returns all active branches ordered by name. Requires any authenticated session.
 */
export async function GET(_request: NextRequest): Promise<Response> {
  try {
    await verifySession()
    const branches = await db.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true },
    })
    return Response.json(branches)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
