'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Mode = 'free' | 'biographer'

export default function NewEntryPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('free')

  // Free entry state
  const [freeText, setFreeText] = useState('')
  const [freeTopic, setFreeTopic] = useState('')

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

  async function handleFreeSubmit() {
    if (!freeText.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/entry/free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responseText: freeText, topic: freeTopic }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    const data = await res.json()
    router.push(`/dashboard/conversation/${data.conversationId}`)
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
            <p className="text-sm text-muted-fg">Write about whatever's with you today. The biographer will follow your lead, if you need it.</p>

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
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFreeSubmit() }}
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleFreeSubmit}
              disabled={loading || !freeText.trim()}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all duration-300"
              style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
            >
              {loading ? 'Saving...' : 'Add to my story'}
            </button>
            <p className="text-xs text-muted-fg text-center">Cmd+Enter to submit</p>
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
