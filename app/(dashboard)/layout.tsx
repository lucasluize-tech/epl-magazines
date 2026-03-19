import type { ReactNode } from 'react'
import { getUser } from '@/lib/dal'
import { getActiveBranches, resolveActiveBranchId } from '@/lib/branch'
import Sidebar from '@/components/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: LayoutProps) {
  const [user, branches, activeBranchId] = await Promise.all([
    getUser(),
    getActiveBranches(),
    resolveActiveBranchId(),
  ])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} branches={branches} activeBranchId={activeBranchId} />
      <main
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        {children}
      </main>
    </div>
  )
}
