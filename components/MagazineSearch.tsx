'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'

export interface MagazineSearchItem {
  id: string
  name: string
}

export interface MagazineSearchProps {
  /** All items for the live dropdown */
  magazines: MagazineSearchItem[]
  /** Current search query from URL */
  currentSearch: string
  /** Placeholder text for the input */
  placeholder?: string
}

/** Search input with live-match dropdown */
export default function MagazineSearch({ magazines, currentSearch, placeholder = 'Search magazines…' }: MagazineSearchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(currentSearch)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = query.trim().length > 0
    ? magazines.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []

  /** Push search + reset page to 1 */
  const applySearch = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) {
      params.set('search', value.trim())
    } else {
      params.delete('search')
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }, [router, pathname, searchParams])

  /** Close dropdown on outside click */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      applySearch(query)
    }
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  function handleClear() {
    setQuery('')
    applySearch('')
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'oklch(0.55 0.030 72)' }}
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (query.trim()) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-10 pl-9 pr-8"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Live dropdown */}
      {open && matches.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border shadow-lg overflow-hidden"
          style={{
            backgroundColor: 'oklch(0.978 0.009 88)',
            borderColor: 'oklch(0.876 0.016 88)',
          }}
        >
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setQuery(m.name)
                applySearch(m.name)
              }}
              className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-black/[0.04] flex items-center gap-2"
              style={{ color: 'oklch(0.25 0.028 62)' }}
            >
              <Search size={12} style={{ color: 'oklch(0.55 0.030 72)' }} />
              <HighlightMatch text={m.name} query={query} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Highlights the matching substring in bold */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return <span>{text}</span>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.trim().length)
  const after = text.slice(idx + query.trim().length)
  return (
    <span>
      {before}<strong style={{ color: 'oklch(0.15 0.028 62)' }}>{match}</strong>{after}
    </span>
  )
}
