'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AppendForm({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!response.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/conversation/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, responseText: response }),
    })

    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    setSaved(true)
    setResponse('')
    setTimeout(() => {
      setSaved(false)
      router.refresh()
    }, 1500)
    setLoading(false)
  }

  if (saved) {
    return (
      <div className="text-center py-6">
        <p className="text-stone-500 text-sm">Added to your story.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">Add more</p>
      <textarea
        value={response}
        onChange={e => setResponse(e.target.value)}
        placeholder="Continue the thought, add a detail, or take it somewhere new."
        rows={5}
        className="w-full px-4 py-3 border border-stone-300 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading || !response.trim()}
        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
      >
        {loading ? 'Saving...' : 'Add to story'}
      </button>
    </div>
  )
}
