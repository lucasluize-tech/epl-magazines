import db from '@/lib/db'
import { verifySessionForApi } from '@/lib/dal'

/**
 * GET /api/branches
 * Returns all active branches ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const branches = await db.branch.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true },
    })
    return Response.json(branches)
  } catch (err) {
    console.error('List branches error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
