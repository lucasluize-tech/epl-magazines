'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Login error boundary — catches errors on the login page.
 */
export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[LoginError]', error)
  }, [error])

  const handleRetry = useCallback(() => {
    reset()
    router.refresh()
  }, [reset, router])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
    >
      <div className="text-center max-w-md">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{
            backgroundColor: 'oklch(0.97 0.020 27)',
            border: '1px solid oklch(0.88 0.08 27)',
          }}
        >
          <AlertTriangle size={24} style={{ color: 'oklch(0.56 0.225 27)' }} />
        </div>
        <h1
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Something went wrong
        </h1>
        <p className="text-sm mb-6" style={{ color: 'oklch(0.50 0.035 72)' }}>
          We couldn&apos;t load the login page. Please try again.
        </p>
        <Button
          onClick={handleRetry}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <RotateCcw size={15} /> Try again
        </Button>
      </div>
    </div>
  )
}
