'use client'

import { useState } from 'react'
import { Loader2, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export interface AdminMagazineDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  magazineName: string
  onRemoveFromBranch: () => Promise<void>
  onDeleteEntirely: () => Promise<void>
}

export default function AdminMagazineDeleteDialog({
  open,
  onOpenChange,
  magazineName,
  onRemoveFromBranch,
  onDeleteEntirely,
}: AdminMagazineDeleteDialogProps) {
  const [loading, setLoading] = useState<'branch' | 'global' | null>(null)

  async function handleAction(action: 'branch' | 'global') {
    setLoading(action)
    try {
      if (action === 'branch') {
        await onRemoveFromBranch()
      } else {
        await onDeleteEntirely()
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>
            Remove &quot;{magazineName}&quot;?
          </DialogTitle>
          <DialogDescription>
            Choose how to remove this magazine.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => handleAction('branch')}
            disabled={loading !== null}
          >
            {loading === 'branch' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Unlink size={15} />
            )}
            Remove from this branch
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start gap-2"
            onClick={() => handleAction('global')}
            disabled={loading !== null}
          >
            {loading === 'global' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            Delete magazine entirely
          </Button>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
