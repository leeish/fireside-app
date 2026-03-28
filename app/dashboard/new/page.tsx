'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Mode = 'free' | 'biographer'
type AutosaveStatus = 'idle' | 'saving' | 'saved'

const AUTOSAVE_DELAY = 15000 // 15 seconds

function getAutosaveEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('fireside_autosave') !== 'false'
}

export default function NewEntryPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('free')

  // Free entry state
  const [freeText, setFreeText] = useState('')
  const [freeTopic, setFreeTopic] = useState('')
  const [draftConversationId, setDraftConversationId] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const lastSavedText = useRef('')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Biographer state
  const [biographerTopic, setBiographerTopic] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setIsSpeechSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    return () => recognitionRef.current?.stop()
  }, [])

  const performAutosave = useCallback(async (text: string, topic: string, existingId: string | null) => {
    if (!text.trim() || text === lastSavedText.current) return
    setAutosaveStatus('saving')
    try {
      if (!existingId) {
        const res = await fetch('/api/entry/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responseText: text, topic }),
        })
        if (res.ok) {
          const data = await res.json()
          setDraftConversationId(data.conversationId)
          lastSavedText.current = text
          setAutosaveStatus('saved')
          setTimeout(() => setAutosaveStatus('idle'), 2000)
        }
      } else {
        const res = await fetch('/api/entry/draft', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: existingId, responseText: text }),
        })
        if (res.ok) {
          lastSavedText.current = text
          setAutosaveStatus('saved')
          setTimeout(() => setAutosaveStatus('idle'), 2000)
        }
      }
    } catch {
      setAutosaveStatus('idle')
    }
  }, [])

  // Autosave trigger on text change
  useEffect(() => {
    if (!getAutosaveEnabled() || !freeText.trim()) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(
      () => performAutosave(freeText, freeTopic, draftConversationId),
      AUTOSAVE_DELAY
    )
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [freeText, freeTopic, draftConversationId, performAutosave])

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .map((r: any) => r[0].transcript)
        .join(' ')
      setFreeText(prev => prev ? prev + ' ' + transcript : transcript)
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => setIsRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  async function saveDraft(): Promise<string | null> {
    if (!freeText.trim()) return draftConversationId
    if (!draftConversationId) {
      const res = await fetch('/api/entry/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseText: freeText, topic: freeTopic }),
      })
      if (!res.ok) return null
      const data = await res.json()
      setDraftConversationId(data.conversationId)
      lastSavedText.current = freeText
      return data.conversationId
    } else if (freeText !== lastSavedText.current) {
      await fetch('/api/entry/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: draftConversationId, responseText: freeText }),
      })
      lastSavedText.current = freeText
      return draftConversationId
    }
    return draftConversationId
  }

  async function handleSaveForLater() {
    if (!freeText.trim()) return
    setLoading(true)
    setError('')
    const id = await saveDraft()
    if (!id) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  async function handleAddToStory() {
    if (!freeText.trim()) return
    setLoading(true)
    setError('')
    const id = await saveDraft()
    if (!id) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    // Publish: fire enrichment on the saved draft
    const res = await fetch('/api/entry/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, responseText: freeText, publish: true }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    router.push(`/dashboard/conversation/${id}`)
  }

  async function handleBiographerSubmit() {
    if (!biographerTopic.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/entry/biographer-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: biographerTopic }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    const data = await res.json()
    router.push(`/dashboard/conversation/${data.conversationId}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="mb-8">
          <Link href="/dashboard" className="text-xs text-muted-fg hover:text-foreground flex items-center gap-1 mb-6 transition-colors duration-300">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-display font-semibold text-foreground">Something on your mind?</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setMode('free')}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              mode === 'free'
                ? 'bg-primary text-white'
                : 'border border-border text-muted-fg hover:text-foreground hover:border-primary/40'
            }`}
          >
            Write freely
          </button>
          <button
            onClick={() => setMode('biographer')}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              mode === 'biographer'
                ? 'bg-primary text-white'
                : 'border border-border text-muted-fg hover:text-foreground hover:border-primary/40'
            }`}
          >
            Talk with the biographer
          </button>
        </div>

        {/* Free entry */}
        {mode === 'free' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-fg uppercase tracking-widest block mb-2">
                What's this about? <span className="font-normal normal-case tracking-normal opacity-60">(optional)</span>
              </label>
              <input
                type="text"
                value={freeTopic}
                onChange={e => setFreeTopic(e.target.value)}
                placeholder="e.g. My grandmother, The summer of '94…"
                className="w-full px-5 py-3 border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-fg/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all duration-300"
                style={{ backgroundColor: 'var(--fs-surface)' }}
              />
            </div>

            <div className="relative">
              <textarea
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddToStory() }}
                placeholder="Just start. It doesn't have to be perfect."
                rows={10}
                autoFocus
                className="w-full px-5 py-4 border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-fg/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all duration-300"
                style={{ backgroundColor: 'var(--fs-surface)' }}
              />
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  title={isRecording ? 'Stop recording' : 'Speak your entry'}
                  className={`absolute bottom-3 right-3 p-1.5 rounded-full transition-all duration-300 ${
                    isRecording
                      ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                      : 'text-muted-fg hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                    <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Autosave indicator */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-fg/60 h-4">
                {autosaveStatus === 'saving' && 'Saving draft...'}
                {autosaveStatus === 'saved' && 'Draft saved'}
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleAddToStory}
                disabled={loading || !freeText.trim()}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all duration-300"
                style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
              >
                {loading ? 'Saving...' : 'Add to my story'}
              </button>
              <button
                onClick={handleSaveForLater}
                disabled={loading || !freeText.trim()}
                className="w-full h-12 border-2 border-border text-foreground/70 text-sm font-medium rounded-full hover:border-primary/40 hover:bg-muted disabled:opacity-40 transition-all duration-300"
              >
                Save for later
              </button>
            </div>
            <p className="text-xs text-muted-fg text-center">Cmd+Enter to add to story</p>
          </div>
        )}

        {/* Biographer-guided */}
        {mode === 'biographer' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-fg">Tell the biographer what you want to explore and they'll open the conversation with a question.</p>

            <div>
              <label className="text-xs font-semibold text-muted-fg uppercase tracking-widest block mb-2">
                What do you want to talk about?
              </label>
              <textarea
                value={biographerTopic}
                onChange={e => setBiographerTopic(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleBiographerSubmit() }}
                placeholder="e.g. My relationship with my dad, The year I changed careers, Living abroad in my 20s…"
                rows={4}
                autoFocus
                className="w-full px-5 py-4 border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-fg/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all duration-300"
                style={{ backgroundColor: 'var(--fs-surface)' }}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleBiographerSubmit}
              disabled={loading || !biographerTopic.trim()}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all duration-300"
              style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
            >
              {loading ? 'Getting your question ready...' : 'Start the conversation'}
            </button>
            <p className="text-xs text-muted-fg text-center">Cmd+Enter to submit</p>
          </div>
        )}

      </div>
    </div>
  )
}
