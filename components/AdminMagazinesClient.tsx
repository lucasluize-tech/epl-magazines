'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { MagazineWithCount } from '@/types'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, BookMarked } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CADENCE_LABELS } from '@/lib/cadence'
import CreateMagazineDialog from './CreateMagazineDialog'
import EditMagazineDialog from './EditMagazineDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'

export interface AdminMagazinesClientProps {
  magazines: MagazineWithCount[]
}

export default function AdminMagazinesClient({ magazines }: AdminMagazinesClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MagazineWithCount | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MagazineWithCount | null>(null)

  async function toggleActive(mag: MagazineWithCount) {
    const res = await fetch(`/api/magazines/${mag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !mag.active }),
    })
    if (res.ok) {
      toast.success(`${mag.name} ${mag.active ? 'deactivated' : 'activated'}`)
      router.refresh()
    } else {
      toast.error('Failed to update status')
    }
  }

  async function deleteMagazine(mag: MagazineWithCount) {
    const res = await fetch(`/api/magazines/${mag.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${mag.name} deleted`)
      setDeleteTarget(null)
      router.refresh()
    } else {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error || 'Failed to delete magazine')
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <Plus size={16} /> Add Magazine
        </Button>
      </div>

      {magazines.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookMarked size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No magazines yet
          </p>
          <p className="text-sm mt-1">Click &quot;Add Magazine&quot; to get started.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Name</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Cadence</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Status</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Issues</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Notes</TableHead>
                <TableHead className="font-semibold text-right" style={{ color: 'oklch(0.30 0.028 62)' }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {magazines.map((mag) => (
                <TableRow
                  key={mag.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{
                    borderColor: 'oklch(0.900 0.012 88)',
                    opacity: mag.active ? 1 : 0.55,
                  }}
                >
                  <TableCell>
                    <span
                      className="font-medium"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {mag.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                        color: 'oklch(0.38 0.082 156)',
                        borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                      }}
                    >
                      {CADENCE_LABELS[mag.cadence]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={
                        mag.active
                          ? { backgroundColor: 'oklch(0.92 0.05 155)', color: 'oklch(0.38 0.082 156)', border: 'none' }
                          : { backgroundColor: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.035 72)', border: 'none' }
                      }
                    >
                      {mag.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {mag._count.receipts}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm italic" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {mag.notes || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleActive(mag)}
                        title={mag.active ? 'Deactivate' : 'Activate'}
                      >
                        {mag.active
                          ? <ToggleRight size={16} style={{ color: 'oklch(0.45 0.10 155)' }} />
                          : <ToggleLeft size={16} style={{ color: 'oklch(0.55 0.030 72)' }} />
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditTarget(mag)}
                        title="Edit"
                      >
                        <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(mag)}
                        title="Delete"
                      >
                        <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateMagazineDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editTarget && (
        <EditMagazineDialog
          magazine={editTarget}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
          title={`Delete "${deleteTarget.name}"?`}
          description={`This will permanently delete the magazine and all ${deleteTarget._count?.receipts ?? 0} receipt records. This cannot be undone.`}
          onConfirm={() => deleteMagazine(deleteTarget)}
        />
      )}
    </>
  )
}
