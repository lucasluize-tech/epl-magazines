'use client'

import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import type { Branch } from '@/types'

export interface BranchSelectorProps {
  branches: Branch[]
  activeBranchId: string
}

/**
 * Dropdown for selecting the active library branch.
 * Sets a cookie and refreshes the page so server components re-render with the new branch filter.
 */
export default function BranchSelector({ branches, activeBranchId }: BranchSelectorProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const branchId = e.target.value
    document.cookie = `epl-active-branch=${branchId};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`
    router.refresh()
  }

  const activeBranch = branches.find(b => b.id === activeBranchId)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <MapPin size={12} style={{ color: 'oklch(0.65 0.06 156)' }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(0.55 0.04 158)' }}
        >
          Branch
        </span>
      </div>
      <select
        value={activeBranchId}
        onChange={handleChange}
        className="w-full rounded-md border-0 text-sm font-medium py-1.5 px-2 cursor-pointer focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'oklch(0.28 0.05 158)',
          color: 'oklch(0.90 0.02 158)',
        }}
        title={`Current branch: ${activeBranch?.name ?? 'Unknown'}`}
      >
        {branches.map(branch => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  )
}
