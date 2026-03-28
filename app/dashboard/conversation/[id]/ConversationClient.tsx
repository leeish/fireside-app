'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Turn = {
  id: string
  role: string
  content: string
  created_at: string
}

type Props = {
  conversationId: string
  topic: string
  openedDate: string
  initialTurns: Turn[]
  initialStatus: string
}

type Mode = null | 'interview' | 'add-more'

export default function ConversationClient({
  conversationId,
  topic,
  openedDate,
  initialTurns,
  initialStatus,
}: Props) {
  const router = useRouter()
  const [turns, setTurns] = useState<Turn[]>(initialTurns)
  const [status, setStatus] = useState(initialStatus)
  const [mode, setMode] = useState<Mode>(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [waitingForAI, setWaitingForAI] = useState(false)
  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTurnCountRef = useRef(initialTurns.length)

  useEffect(() => {
    setIsSpeechSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  useEffect(() => {
    if (!waitingForAI) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversation/${conversationId}/turns`)
        if (!res.ok) return
        const data = await res.json()
        if (data.turns.length > lastTurnCountRef.current) {
          lastTurnCountRef.current = data.turns.length
          setTurns(data.turns)
          setStatus(data.status)
          setWaitingForAI(false)
        }
      } catch {
        // silent — will retry
      }
    }, 2500)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [waitingForAI, conversationId])

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
      setResponse(prev => prev ? prev + ' ' + transcript : transcript)
    }

    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => setIsRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  async function handleInterviewSubmit() {
    if (!response.trim() || loading) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/conversation/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, responseText: response }),
    })

    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    const optimistic: Turn = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: response,
      created_at: new Date().toISOString(),
    }
    setTurns(prev => [...prev, optimistic])
    lastTurnCountRef.current = turns.length + 1
    setResponse('')
    setLoading(false)
    setWaitingForAI(true)
  }

  async function handleAddMoreSubmit() {
    if (!response.trim() || loading) return
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

    setResponse('')
    setLoading(false)
    setMode(null)
    const data = await fetch(`/api/conversation/${conversationId}/turns`).then(r => r.json())
    setTurns(data.turns)
    lastTurnCountRef.current = data.turns.length
  }

  const isWrapOffered = status === 'wrap_offered'
  const [settling, setSettling] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  async function handleSettle() {
    setSettling(true)
    await fetch('/api/conversation/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
    router.refresh()
  }

  async function handleArchive() {
    setArchiving(true)
    const res = await fetch(`/api/conversation/${conversationId}/archive`, { method: 'PATCH' })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      setArchiving(false)
      setShowArchiveConfirm(false)
    }
  }

  async function handleContinue() {
    setContinuing(true)
    await fetch('/api/conversation/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
    setStatus('active')
    setMode(null)
    setContinuing(false)
  }

  return (
    <div>
      {/* Turns — skip first biographer turn if present, it's already shown as the H1 above */}
      <div className="space-y-7 mb-10">
        {(turns[0]?.role === 'biographer' ? turns.slice(1) : turns).map(turn => (
          <div key={turn.id} className={turn.role === 'biographer' ? '' : 'pl-5 border-l-2 border-primary/25'}>
            {turn.role === 'biographer' ? (
              <p className="font-display italic text-foreground/70 text-base leading-relaxed">
                {turn.content}
              </p>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {turn.content}
              </p>
            )}
          </div>
        ))}

        {waitingForAI && (
          <div>
            <p className="font-display italic text-muted-fg text-sm animate-pulse">Thinking...</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 pt-8">
        {isWrapOffered && !waitingForAI ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSettle}
                disabled={settling || continuing}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all duration-300"
                style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
              >
                {settling ? 'Capturing...' : 'Capture it'}
              </button>
              <button
                onClick={handleContinue}
                disabled={settling || continuing}
                className="w-full h-12 border-2 border-border text-foreground/70 text-sm font-medium rounded-full hover:border-primary/40 hover:bg-muted disabled:opacity-50 transition-all duration-300"
              >
                {continuing ? 'Continuing...' : 'Keep going'}
              </button>
            </div>
          </div>
        ) : mode === null && !isWrapOffered ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">How do you want to continue?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMode('interview')}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 transition-all duration-300"
                style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
              >
                Talk it through with the biographer
              </button>
              <button
                onClick={() => setMode('add-more')}
                className="w-full h-12 border-2 border-border text-foreground/70 text-sm font-medium rounded-full hover:border-primary/40 hover:bg-muted transition-all duration-300"
              >
                Just add more
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">
                {mode === 'interview' ? 'Your response' : 'Add more'}
              </p>
              <button
                onClick={() => { setMode(null); setResponse('') }}
                className="text-xs text-muted-fg hover:text-foreground transition-colors duration-300"
              >
                Cancel
              </button>
            </div>
            <div className="relative">
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    mode === 'interview' ? handleInterviewSubmit() : handleAddMoreSubmit()
                  }
                }}
                placeholder={mode === 'interview'
                  ? 'Respond to the question above...'
                  : 'Continue the thought, add a detail, or take it somewhere new.'
                }
                rows={5}
                disabled={waitingForAI}
                className="w-full px-5 py-4 border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none disabled:opacity-50 transition-all duration-300" style={{ backgroundColor: "var(--fs-surface)" }}
              />
              {isSpeechSupported && !waitingForAI && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  title={isRecording ? 'Stop recording' : 'Speak your answer'}
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
              onClick={mode === 'interview' ? handleInterviewSubmit : handleAddMoreSubmit}
              disabled={loading || waitingForAI || !response.trim()}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all duration-300"
              style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
            >
              {loading || waitingForAI ? 'Saving...' : mode === 'interview' ? 'Send' : 'Add to story'}
            </button>
            {mode === 'interview' && (
              <p className="text-xs text-muted-fg text-center">Cmd+Enter to send</p>
            )}
          </div>
        )}
      </div>

      {/* Archive */}
      <div className="mt-8 text-center">
        {!showArchiveConfirm ? (
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="text-xs text-muted-fg/50 hover:text-muted-fg transition-colors duration-300"
          >
            Remove from journal
          </button>
        ) : (
          <div className="border border-border/50 rounded-2xl p-4 space-y-3 text-left">
            <p className="text-xs text-foreground/70 text-center">
              This will move the conversation to your archive. You can restore it or delete it permanently from there.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex-1 h-9 bg-foreground/10 hover:bg-foreground/15 text-foreground/70 text-xs font-medium rounded-full disabled:opacity-50 transition-colors duration-300"
              >
                {archiving ? 'Archiving...' : 'Move to archive'}
              </button>
              <button
                onClick={() => setShowArchiveConfirm(false)}
                disabled={archiving}
                className="flex-1 h-9 border border-border text-xs text-muted-fg hover:text-foreground rounded-full disabled:opacity-50 transition-colors duration-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
