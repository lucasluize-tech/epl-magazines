'use client'

import { useEffect } from 'react'

/**
 * Global error boundary — catches errors in the root layout itself.
 * Must include its own <html>/<body> since the root layout may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)', margin: 0 }}
      >
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div
              style={{
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                backgroundColor: 'oklch(0.97 0.020 27)',
                border: '1px solid oklch(0.88 0.08 27)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                fontSize: '1.5rem',
              }}
            >
              !
            </div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'oklch(0.15 0.028 62)',
                marginBottom: '0.5rem',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'oklch(0.50 0.035 72)',
                marginBottom: '1.5rem',
              }}
            >
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: 'oklch(0.38 0.082 156)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
