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
    <div className="text-center">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs text-muted-fg underline underline-offset-2 hover:text-foreground transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : 'Generate my next question now'}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
