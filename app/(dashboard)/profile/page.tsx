import type { Metadata } from 'next'
import { getUser } from '@/lib/dal'
import ProfileClient from '@/components/ProfileClient'

export const metadata: Metadata = { title: 'Profile — EPL Magazine Tracker' }

export default async function ProfilePage() {
  const user = await getUser()

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Profile
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          Manage your account settings
        </p>
      </div>

      <ProfileClient user={user} />
    </div>
  )
}
