'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'

/** A conflict returned by the API when activating a period that has magazine clashes */
interface PeriodConflict {
  magazineId: string
  magazineName: string
  conflictingPeriodName: string
}

export interface PeriodActivationControlProps {
  /** Subscription period ID */
  periodId: string
  /** Whether the period is currently active */
  active: boolean
  /** Human-readable name, used in confirm messages */
  periodName: string
}

/**
 * Activate / Deactivate button for a subscription period.
 *
 * - Activate: calls PUT /api/subscription-periods/[id] with { active: true }.
 *   On 409 conflict, shows an AlertDialog listing the conflicting magazines.
 * - Deactivate: shows a confirmation dialog, then calls PUT with { active: false }.
 *   Bulk-deactivates the period and all its subscriptions.
 */
export default function PeriodActivationControl({ periodId, active, periodName }: PeriodActivationControlProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [conflicts, setConflicts] = useState<PeriodConflict[] | null>(null)

  async function handleActivate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/subscription-periods/${periodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      })
      const data = (await res.json()) as { error?: string; conflicts?: PeriodConflict[] }
      if (res.status === 409 && data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts)
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Failed to activate period')
        return
      }
      toast.success('Period activated')
      router.refresh()
    } catch {
      toast.error('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeactivate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/subscription-periods/${periodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to deactivate period')
        return
      }
      toast.success('Period deactivated')
      setDeactivateOpen(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {active ? (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setDeactivateOpen(true)}
          className="gap-1.5 cursor-pointer"
          style={{
            borderColor: 'oklch(0.876 0.016 88)',
            color: 'oklch(0.45 0.120 25)',
          }}
        >
          {loading ? <><Loader2 size={13} className="animate-spin" /> Deactivating...</> : 'Deactivate'}
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={loading}
          onClick={handleActivate}
          className="gap-1.5 cursor-pointer"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          {loading ? <><Loader2 size={13} className="animate-spin" /> Activating...</> : 'Activate'}
        </Button>
      )}

      {/* Deactivate confirm dialog */}
      <DeleteConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Deactivate "${periodName}"?`}
        description="This will deactivate all subscriptions in this period. You can reactivate the period later."
        onConfirm={handleDeactivate}
        confirmLabel="Deactivate"
        loadingLabel="Deactivating..."
      />

      {/* Conflict dialog — shown when activation returns 409 */}
      <Dialog open={!!conflicts} onOpenChange={(v) => { if (!v) setConflicts(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>
              Cannot Activate Period
            </DialogTitle>
            <DialogDescription>
              The following magazines are already active in another period. Resolve the conflicts before activating.
            </DialogDescription>
          </DialogHeader>
          <ul
            className="space-y-1 rounded-md border p-3 text-sm"
            style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
          >
            {(conflicts ?? []).map((c) => (
              <li key={c.magazineId} style={{ color: 'oklch(0.30 0.028 62)' }}>
                <span className="font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
                  {c.magazineName}
                </span>
                <span style={{ color: 'oklch(0.50 0.035 72)' }}>
                  {' '}— active in{' '}
                  <span className="italic">{c.conflictingPeriodName}</span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflicts(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
