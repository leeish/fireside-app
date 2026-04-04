'use client'

import { useEffect, useState } from 'react'

interface Clarification {
  id: string
  entity_type: 'person' | 'event' | 'place' | 'era'
  entity_key: string
  field: string
  question: string
  status: 'pending' | 'answered'
  answer: string | null
}

export default function ClarifyTab({
  conversationId,
}: {
  conversationId: string
}) {
  const [clarifications, setClarifications] = useState<Clarification[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    loadClarifications()
  }, [])

  async function loadClarifications() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/conversation/${conversationId}/clarifications`)
    if (!res.ok) {
      setError('Failed to load clarifications')
      setLoading(false)
      return
    }
    const data = await res.json()
    setClarifications(data.clarifications ?? [])
    setLoading(false)
  }

  async function handleScan() {
    setScanning(true)
    setScanMessage('')
    setError('')
    const res = await fetch(`/api/conversation/${conversationId}/clarifications`, {
      method: 'POST',
    })
    if (!res.ok) {
      setError('Scan failed. Please try again.')
      setScanning(false)
      return
    }
    const data = await res.json()
    const newOnes: Clarification[] = data.clarifications ?? []
    if (newOnes.length > 0) {
      setClarifications(prev => [...prev, ...newOnes])
      setScanMessage('')
    } else {
      setScanMessage('Nothing to clarify here.')
    }
    setScanning(false)
  }

  async function handleSubmit(clarificationId: string) {
    const answer = answers[clarificationId]?.trim()
    if (!answer) return

    setSubmitting(prev => ({ ...prev, [clarificationId]: true }))
    setError('')

    const res = await fetch(`/api/conversation/${conversationId}/clarifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clarificationId, answer }),
    })

    if (!res.ok) {
      setError('Failed to submit answer')
      setSubmitting(prev => ({ ...prev, [clarificationId]: false }))
      return
    }

    // Remove answered clarification from UI
    setClarifications(prev => prev.filter(c => c.id !== clarificationId))
    setAnswers(prev => {
      const next = { ...prev }
      delete next[clarificationId]
      return next
    })
    setSubmitting(prev => ({ ...prev, [clarificationId]: false }))
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-fg">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {clarifications.length > 0 && (
        <>
          {clarifications.map(clarification => (
            <div key={clarification.id} className="border border-border/40 rounded-2xl p-4 space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                {clarification.question}
              </p>
              <input
                type="text"
                placeholder="Your answer..."
                value={answers[clarification.id] ?? ''}
                onChange={e => setAnswers(prev => ({ ...prev, [clarification.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSubmit(clarification.id)
                }}
                className="w-full px-3 py-2 text-sm border border-border/40 rounded-lg focus:outline-none focus:border-primary/40"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => handleSubmit(clarification.id)}
                  disabled={!answers[clarification.id]?.trim() || submitting[clarification.id]}
                  className="px-4 h-8 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-full disabled:opacity-50 transition-all duration-300"
                >
                  {submitting[clarification.id] ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ))}
          <div className="text-center pt-2">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="text-xs text-muted-fg/60 hover:text-muted-fg disabled:opacity-50 transition-colors duration-300"
            >
              {scanning ? 'Scanning...' : 'Check again'}
            </button>
          </div>
        </>
      )}

      {clarifications.length === 0 && (
        <div className="py-8 text-center space-y-4">
          {scanMessage ? (
            <p className="text-sm text-muted-fg font-display italic">{scanMessage}</p>
          ) : (
            <p className="text-sm text-muted-fg font-display italic">
              No open questions.
            </p>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-5 h-9 border border-border/50 text-xs text-muted-fg hover:text-foreground hover:border-primary/40 rounded-full disabled:opacity-50 transition-all duration-300"
          >
            {scanning ? 'Scanning...' : 'Check for gaps'}
          </button>
        </div>
      )}
    </div>
  )
}
