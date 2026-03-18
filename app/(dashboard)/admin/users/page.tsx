import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import AdminUsersClient from '@/components/AdminUsersClient'

export const metadata: Metadata = { title: 'Manage Users — EPL Magazine Tracker' }

export default async function AdminUsersPage() {
  const currentUser = await getUser()
  if (currentUser.role !== 'ADMIN') redirect('/dashboard')

  const users = await db.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { receipts: true } },
    },
  })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Manage Users
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {users.length} account{users.length !== 1 ? 's' : ''}
        </p>
      </div>

      <AdminUsersClient users={users} currentUserId={currentUser.id} />
    </div>
  )
}
