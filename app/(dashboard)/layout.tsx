import type { ReactNode } from 'react'
import { getUser } from '@/lib/dal'
import Sidebar from '@/components/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: LayoutProps) {
  const user = await getUser()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        {children}
      </main>
    </div>
  )
}
