'use client'

import { useState } from 'react'

type Intensity = 'light' | 'medium' | 'full'

const INTENSITIES: { value: Intensity; label: string; description: string }[] = [
  { value: 'light', label: 'Light touch', description: 'Your exact words, just structured' },
  { value: 'medium', label: 'Polished', description: 'Rewritten for flow, your voice intact' },
  { value: 'full', label: 'Ghost written', description: 'Elevated prose, memoir style' },
]

type Entry = {
  id: string
  story_content: string | null
  story_intensity: string | null
} | null

export default function StoryTab({
  conversationId,
  entry,
}: {
  conversationId: string
  entry: Entry
}) {
  const [intensity, setIntensity] = useState<Intensity>(
    (entry?.story_intensity as Intensity | null) ?? 'medium'
  )
  const [content, setContent] = useState(entry?.story_content ?? '')
  const [savedContent, setSavedContent] = useState(entry?.story_content ?? '')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isDirty = content !== savedContent

  if (!entry) {
    return (
      <p className="text-sm text-muted-fg text-center py-12 font-display italic">
        Your entry is still being written. Check back in a moment.
      </p>
    )
  }

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    const res = await fetch(`/api/conversation/${conversationId}/story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intensity }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setGenerating(false)
      return
    }
    const data = await res.json()
    setContent(data.content)
    setSavedContent(data.content)
    setGenerating(false)
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/conversation/${conversationId}/story`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      setSavedContent(content)
    } else {
      setError('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">

      {/* Intensity picker */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">How much should we do?</p>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITIES.map(opt => (
            <button
              key={opt.value}
              onClick={() => setIntensity(opt.value)}
              className={`px-3 py-3 rounded-xl border text-left transition-all duration-200 ${
                intensity === opt.value
                  ? 'border-primary/60 bg-primary/5 text-foreground'
                  : 'border-border/50 text-muted-fg hover:border-primary/30 hover:text-foreground'
              }`}
            >
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-xs mt-0.5 opacity-70 leading-tight">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generate / Regenerate */}
      {!content ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-fg font-display italic">
            We'll write a journal entry in your voice using your words as the source.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 h-10 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full disabled:opacity-50 hover:scale-105 active:scale-95 disabled:scale-100 transition-all duration-300"
            style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
          >
            {generating ? 'Writing...' : 'Write my entry'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={16}
            className="w-full px-5 py-4 border border-border rounded-2xl text-sm text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all duration-300"
            style={{ backgroundColor: 'var(--fs-surface)' }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              onClick={handleGenerate}
              disabled={generating || saving}
              className="text-xs text-muted-fg hover:text-foreground disabled:opacity-50 transition-colors duration-300"
            >
              {generating ? 'Rewriting...' : 'Regenerate'}
            </button>
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={saving || generating}
                className="px-5 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-all duration-300"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
