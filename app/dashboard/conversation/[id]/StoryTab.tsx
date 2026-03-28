'use client'

import { useEffect, useRef, useState } from 'react'

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
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  const isDirty = content !== savedContent

  // Sync editor content when generation produces new text
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== content) {
      editorRef.current.innerText = content
    }
  }, [content])

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
    setShowRegenerateOptions(false)
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

      {/* No content yet: intensity picker + generate */}
      {!content && (
        <div className="space-y-5">
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
        </div>
      )}

      {/* Has content: prose editor + regenerate flow */}
      {content && (
        <div className="space-y-4">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={e => setContent((e.currentTarget as HTMLDivElement).innerText)}
            className="text-sm text-foreground leading-relaxed whitespace-pre-wrap focus:outline-none min-h-[12rem] cursor-text"
            style={{ caretColor: 'var(--color-primary)' }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Regenerate options (shown on demand) */}
          {showRegenerateOptions && (
            <div className="border-t border-border/40 pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Rewrite at a different level?</p>
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
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-5 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-all duration-300"
                >
                  {generating ? 'Rewriting...' : 'Rewrite'}
                </button>
                <button
                  onClick={() => setShowRegenerateOptions(false)}
                  disabled={generating}
                  className="px-5 h-9 border border-border text-xs text-muted-fg hover:text-foreground rounded-full disabled:opacity-50 transition-colors duration-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {!showRegenerateOptions && (
              <button
                onClick={() => setShowRegenerateOptions(true)}
                disabled={generating || saving}
                className="text-xs text-muted-fg hover:text-foreground disabled:opacity-50 transition-colors duration-300"
              >
                Regenerate
              </button>
            )}
            {isDirty && !showRegenerateOptions && (
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
