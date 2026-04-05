'use client'

import { useEffect, useState } from 'react'

const LS_TTL = 5 * 60 * 1000 // 5 minutes

type Entry = {
  id: string
  cleaned_content: string | null
} | null

export default function CleanupTab({
  conversationId,
  entry,
  onSwitchTab,
  clarificationsCount = 0,
}: {
  conversationId: string
  entry: Entry
  onSwitchTab?: (tab: string) => void
  clarificationsCount?: number
}) {
  const [content, setContent] = useState(entry?.cleaned_content ?? '')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const lsKey = `cleanup_gen_${conversationId}`

  // On mount: if a generation was in-progress when the user navigated away, resume the generating state
  useEffect(() => {
    if (content) return
    const ts = localStorage.getItem(lsKey)
    if (ts && Date.now() - Number(ts) < LS_TTL) {
      setGenerating(true)
    }
  }, [])

  // Poll for content while generating (covers the reload case)
  useEffect(() => {
    if (!generating || content) return
    const start = Date.now()
    const interval = setInterval(async () => {
      if (Date.now() - start > LS_TTL) {
        clearInterval(interval)
        localStorage.removeItem(lsKey)
        setGenerating(false)
        setError('Generation timed out. Please try again.')
        return
      }
      const res = await fetch(`/api/conversation/${conversationId}/cleanup`)
      if (res.ok) {
        const data = await res.json()
        if (data.content) {
          clearInterval(interval)
          localStorage.removeItem(lsKey)
          setContent(data.content)
          setGenerating(false)
        }
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [generating])

  async function handleGenerate(force = false) {
    localStorage.setItem(lsKey, String(Date.now()))
    setGenerating(true)
    setError('')
    const res = await fetch(`/api/conversation/${conversationId}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    })
    if (!res.ok) {
      localStorage.removeItem(lsKey)
      setError('Something went wrong. Please try again.')
      setGenerating(false)
      return
    }
    const data = await res.json()
    localStorage.removeItem(lsKey)
    setContent(data.content)
    setGenerating(false)
  }

  return (
    <div className="space-y-6">
      {clarificationsCount > 0 && (
        <div className="border border-primary/20 bg-primary/5 rounded-2xl p-4">
          <p className="text-sm text-foreground">
            You have {clarificationsCount} clarification{clarificationsCount > 1 ? 's' : ''} pending.{' '}
            <button
              onClick={() => onSwitchTab?.('clarify')}
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Review now
            </button>
          </p>
        </div>
      )}
      {!content ? (
        <div className="py-8 text-center space-y-4">
          <p className="text-sm text-muted-fg font-display italic">
            Fix spelling, tighten the prose, chunk into paragraphs — without changing what you said.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="px-6 h-10 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full disabled:opacity-50 hover:scale-105 active:scale-95 disabled:scale-100 transition-all duration-300"
            style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      ) : (
        <>
          <div>
            {content.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-foreground leading-relaxed mb-4">
                {para}
              </p>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="border-t border-border/40 pt-4 flex justify-end">
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="px-4 h-8 border border-border text-xs text-muted-fg hover:text-foreground hover:border-primary/40 rounded-full disabled:opacity-50 transition-all duration-300"
            >
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
