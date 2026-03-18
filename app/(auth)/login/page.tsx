import type { Metadata } from 'next'
import LoginForm from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Sign In — EPL Magazine Tracker' }

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — library identity */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12"
        style={{ backgroundColor: 'oklch(0.215 0.058 158)' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-10 h-10 rounded flex items-center justify-center text-xl"
              style={{ backgroundColor: 'oklch(0.60 0.128 79)', color: 'oklch(0.15 0.028 62)' }}
            >
              📚
            </div>
            <span
              className="text-lg font-semibold tracking-wide"
              style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.92 0.010 91)' }}
            >
              EPL Magazines
            </span>
          </div>

          <h1
            className="text-4xl font-bold leading-tight mb-6"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.978 0.009 88)' }}
          >
            Keeping the collection current
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'oklch(0.72 0.025 155)' }}>
            Track magazine arrivals, flag overdue issues, and know exactly what to expect each week — all in one place.
          </p>
        </div>

        <div className="border-t pt-8" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
          <p className="text-sm italic" style={{ color: 'oklch(0.62 0.025 155)' }}>
            "A library is not a luxury but one of the necessities of life."
          </p>
          <p className="text-xs mt-2" style={{ color: 'oklch(0.50 0.025 155)' }}>
            — Henry Ward Beecher
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div
              className="w-9 h-9 rounded flex items-center justify-center"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              <span className="text-base">📚</span>
            </div>
            <span
              className="text-lg font-semibold"
              style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.215 0.058 158)' }}
            >
              EPL Magazines
            </span>
          </div>

          <h2
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            Welcome back
          </h2>
          <p className="text-sm mb-8" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Sign in to manage the magazine collection
          </p>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
