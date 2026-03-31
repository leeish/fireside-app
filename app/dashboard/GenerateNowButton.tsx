'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GenerateNowButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prompt/generate-now', { method: 'POST' })
      if (res.ok) {
        router.refresh()
      } else if (res.status === 409) {
        setError('Your next question is already on its way.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-border/60 text-sm text-muted-fg hover:text-foreground hover:border-border transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
        </svg>
        {loading ? 'Generating...' : 'Generate Now'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
