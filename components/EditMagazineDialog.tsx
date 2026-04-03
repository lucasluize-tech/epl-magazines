'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { toLocalDate } from '@/lib/utils'
import { Loader2, Save } from 'lucide-react'
import type { BranchMagazineWithDetails, SubscriptionPeriod, CadenceType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { CADENCE_LABELS } from '@/lib/cadence'

export interface EditMagazineDialogProps {
  subscription: BranchMagazineWithDetails
  branchId: string
  periods: SubscriptionPeriod[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Default issuesPerYear by cadence for new subscriptions */
const CADENCE_ISSUES_PER_YEAR: Record<CadenceType, number> = {
  WEEKLY: 52,
  BI_WEEKLY: 26,
  MONTHLY: 12,
  BI_MONTHLY: 6,
  SEASONAL: 4,
  YEARLY: 1,
}

const CADENCES = Object.entries(CADENCE_LABELS)
const LANGUAGES = ['English', 'Gujarati', 'Hindi', 'Tamil', 'Telugu']

export default function EditMagazineDialog({ subscription, branchId, periods, open, onOpenChange }: EditMagazineDialogProps) {
  const router = useRouter()

  // Global fields
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [language, setLanguage] = useState('English')
  const [notes, setNotes] = useState('')

  // Branch-specific fields
  const [quantity, setQuantity] = useState(1)
  const [lastReceivedDate, setLastReceivedDate] = useState('')

  // Period assignment: 'none' or a periodId
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('none')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (subscription) {
      setName(subscription.magazine.name)
      setCadence(subscription.magazine.cadence)
      setLanguage(subscription.magazine.language || 'English')
      setNotes(subscription.magazine.notes || '')
      setQuantity(subscription.quantity)
      setLastReceivedDate(
        subscription.lastReceivedDate
          ? format(toLocalDate(subscription.lastReceivedDate)!, 'yyyy-MM-dd')
          : ''
      )
      setSelectedPeriodId(subscription.magazineSubscription?.periodId ?? 'none')
    }
  }, [subscription])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    try {
      // Update global magazine fields
      const magRes = await fetch(`/api/magazines/${subscription.magazineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cadence, language, notes: notes.trim() || null }),
      })

      if (!magRes.ok) {
        const data = (await magRes.json()) as { error?: string }
        toast.error(data.error || 'Failed to update magazine')
        return
      }

      // Update branch subscription (quantity) only if it changed
      if (quantity !== subscription.quantity) {
        const subRes = await fetch(`/api/branches/${branchId}/magazines/${subscription.magazineId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity }),
        })

        if (!subRes.ok) {
          toast.error('Magazine updated but failed to update branch subscription')
        }
      }

      // If lastReceivedDate changed, update the existing receipt (or create if none exists)
      const originalDate = subscription.lastReceivedDate
        ? format(toLocalDate(subscription.lastReceivedDate)!, 'yyyy-MM-dd')
        : ''
      if (lastReceivedDate && lastReceivedDate !== originalDate) {
        const method = subscription.lastReceivedDate ? 'PUT' : 'POST'
        const body = method === 'PUT'
          ? { receivedDate: lastReceivedDate, branchId }
          : { receivedDate: lastReceivedDate, branchId, notes: 'Manually set by admin' }

        const receiptRes = await fetch(`/api/magazines/${subscription.magazineId}/receipts`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!receiptRes.ok) {
          toast.error('Magazine updated but failed to update last received date')
        }
      }

      // Handle period assignment changes
      const originalPeriodId = subscription.magazineSubscription?.periodId ?? null
      const newPeriodId = selectedPeriodId === 'none' ? null : selectedPeriodId
      if (newPeriodId !== originalPeriodId) {
        // Remove from old period if there was one
        if (originalPeriodId && subscription.magazineSubscription) {
          const delRes = await fetch(
            `/api/subscription-periods/${originalPeriodId}/subscriptions/${subscription.magazineSubscription.id}`,
            { method: 'DELETE' },
          )
          if (!delRes.ok) {
            toast.error('Magazine updated but failed to remove from previous period')
          }
        }
        // Add to new period if one was selected
        if (newPeriodId) {
          const currentCadence = cadence as CadenceType
          const issuesPerYear = CADENCE_ISSUES_PER_YEAR[currentCadence] ?? 12
          const addRes = await fetch(`/api/subscription-periods/${newPeriodId}/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magazineId: subscription.magazineId, issuesPerYear }),
          })
          if (!addRes.ok) {
            const data = (await addRes.json()) as { error?: string }
            toast.error(data.error || 'Magazine updated but failed to assign period')
          }
        }
      }

      toast.success(`${name} updated`)
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Edit Magazine</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Global magazine fields */}
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Magazine Details
          </p>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CADENCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v ?? 'English')}>
              <SelectTrigger><SelectValue>{language}</SelectValue></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => <SelectItem key={lang} value={lang}>{lang}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Separator />

          {/* Branch-specific fields */}
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Branch Subscription
          </p>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Last Received Date</Label>
            <Input
              type="date"
              value={lastReceivedDate}
              onChange={(e) => setLastReceivedDate(e.target.value)}
            />
            <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Changing this will create a new receipt record.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Subscription Period</Label>
            <Select value={selectedPeriodId} onValueChange={(v) => setSelectedPeriodId(v ?? 'none')}>
              <SelectTrigger>
                <SelectValue>
                  {selectedPeriodId === 'none'
                    ? 'None'
                    : (periods.find((p) => p.id === selectedPeriodId)?.name ?? 'None')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.active ? '' : ' (Inactive)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Assign this magazine to a subscription period.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gap-2"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              {loading ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
