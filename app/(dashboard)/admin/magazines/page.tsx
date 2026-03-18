import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import AdminMagazinesClient from '@/components/AdminMagazinesClient'

export const metadata: Metadata = { title: 'Manage Magazines — EPL Magazine Tracker' }

export default async function AdminMagazinesPage() {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const magazines = await db.magazine.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { receipts: true } },
    },
  })

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Manage Magazines
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {magazines.length} magazine{magazines.length !== 1 ? 's' : ''} in the collection
        </p>
      </div>

      <AdminMagazinesClient magazines={magazines} />
    </div>
  )
}
