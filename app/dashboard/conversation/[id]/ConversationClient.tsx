'use client'

import { useState, useEffect, useRef } from 'react'

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

  // Scroll to bottom when turns change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // Poll for new turns while waiting for AI
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

    // Optimistically append user turn
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
    // Refresh turns
    const data = await fetch(`/api/conversation/${conversationId}/turns`).then(r => r.json())
    setTurns(data.turns)
    lastTurnCountRef.current = data.turns.length
  }

  const isSettled = status === 'settled'
  const isWrapOffered = status === 'wrap_offered'
  const [settling, setSettling] = useState(false)
  const [continuing, setContinuing] = useState(false)

  async function handleSettle() {
    setSettling(true)
    await fetch('/api/conversation/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
    setStatus('settled')
    setSettling(false)
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
      {/* Turns */}
      <div className="space-y-6 mb-10">
        {turns.map(turn => (
          <div key={turn.id} className={turn.role === 'biographer' ? '' : 'pl-4 border-l-2 border-amber-200'}>
            {turn.role === 'biographer' ? (
              <p className="text-sm font-medium text-stone-500 leading-relaxed italic">
                {turn.content}
              </p>
            ) : (
              <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                {turn.content}
              </p>
            )}
          </div>
        ))}

        {waitingForAI && (
          <div>
            <p className="text-sm text-stone-400 italic animate-pulse">Thinking...</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-stone-200 pt-8">
        {isSettled ? (
          <p className="text-sm text-stone-400 text-center py-4">
            This conversation is complete. Your story has been captured.
          </p>
        ) : isWrapOffered && !waitingForAI ? (
          // Wrap offer — user decides whether to close or keep going
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSettle}
                disabled={settling || continuing}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {settling ? 'Capturing...' : 'Capture it'}
              </button>
              <button
                onClick={handleContinue}
                disabled={settling || continuing}
                className="w-full py-2.5 border border-stone-300 text-stone-600 text-sm font-medium rounded-lg hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                {continuing ? 'Continuing...' : 'Keep going'}
              </button>
            </div>
          </div>
        ) : mode === null && !isWrapOffered ? (
          // Mode selection
          <div className="space-y-3">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">How do you want to continue?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setMode('interview')}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Talk it through with the biographer
              </button>
              <button
                onClick={() => setMode('add-more')}
                className="w-full py-2.5 border border-stone-300 text-stone-600 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
              >
                Just add more
              </button>
            </div>
          </div>
        ) : (
          // Input form — same UI for both modes
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">
                {mode === 'interview' ? 'Your response' : 'Add more'}
              </p>
              <button
                onClick={() => { setMode(null); setResponse('') }}
                className="text-xs text-stone-400 hover:text-stone-600"
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
                className="w-full px-4 py-3 border border-stone-300 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none disabled:opacity-50"
              />
              {isSpeechSupported && !waitingForAI && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  title={isRecording ? 'Stop recording' : 'Speak your answer'}
                  className={`absolute bottom-3 right-3 p-1.5 rounded-full transition-colors ${
                    isRecording
                      ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                      : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'
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
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
            >
              {loading || waitingForAI ? 'Saving...' : mode === 'interview' ? 'Send' : 'Add to story'}
            </button>
            {mode === 'interview' && (
              <p className="text-xs text-stone-400 text-center">Cmd+Enter to send</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
