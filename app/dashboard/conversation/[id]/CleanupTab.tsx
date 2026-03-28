'use client'

import { useState } from 'react'

type Entry = {
  id: string
  cleaned_content: string | null
} | null

export default function CleanupTab({
  conversationId,
  entry,
}: {
  conversationId: string
  entry: Entry
}) {
  const [content, setContent] = useState(entry?.cleaned_content ?? '')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  if (!entry) {
    return (
      <p className="text-sm text-muted-fg text-center py-12 font-display italic">
        Your entry is still being written. Check back in a moment.
      </p>
    )
  }

  async function handleGenerate(force = false) {
    setGenerating(true)
    setError('')
    const res = await fetch(`/api/conversation/${conversationId}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setGenerating(false)
      return
    }
    const data = await res.json()
    setContent(data.content)
    setGenerating(false)
  }

  if (!content) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-sm text-muted-fg font-display italic">
          We'll clean up your words — fix spelling, tighten the prose, break it into paragraphs — without changing what you said.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => handleGenerate()}
          disabled={generating}
          className="px-6 h-10 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full disabled:opacity-50 hover:scale-105 active:scale-95 disabled:scale-100 transition-all duration-300"
          style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
        >
          {generating ? 'Cleaning up...' : 'Clean it up'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="prose prose-sm max-w-none">
        {content.split('\n\n').map((para, i) => (
          <p key={i} className="text-sm text-foreground leading-relaxed mb-4">
            {para}
          </p>
        ))}
      </div>
      <div className="border-t border-border/40 pt-4 text-center">
        <button
          onClick={() => handleGenerate(true)}
          disabled={generating}
          className="text-xs text-muted-fg hover:text-foreground disabled:opacity-50 transition-colors duration-300"
        >
          {generating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </div>
  )
}
