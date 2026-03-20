'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Loader2, Save } from 'lucide-react'
import type { BranchMagazineWithDetails } from '@/types'
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
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CADENCES = Object.entries(CADENCE_LABELS)

export default function EditMagazineDialog({ subscription, branchId, open, onOpenChange }: EditMagazineDialogProps) {
  const router = useRouter()

  // Global fields
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [notes, setNotes] = useState('')

  // Branch-specific fields
  const [quantity, setQuantity] = useState(1)
  const [lastReceivedDate, setLastReceivedDate] = useState('')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (subscription) {
      setName(subscription.magazine.name)
      setCadence(subscription.magazine.cadence)
      setNotes(subscription.magazine.notes || '')
      setQuantity(subscription.quantity)
      setLastReceivedDate(
        subscription.lastReceivedDate
          ? format(new Date(subscription.lastReceivedDate), 'yyyy-MM-dd')
          : ''
      )
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
        body: JSON.stringify({ name: name.trim(), cadence, notes: notes.trim() || null }),
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
        ? format(new Date(subscription.lastReceivedDate), 'yyyy-MM-dd')
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
