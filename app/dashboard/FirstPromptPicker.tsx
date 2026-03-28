'use client'

// TODO: Replace Web Speech API with OpenAI Whisper for cross-browser support
// (iOS Safari and Firefox don't support SpeechRecognition).
// See: /api/transcribe route using openai.audio.transcriptions.create with whisper-1

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const PROMPTS = [
  {
    category: 'origin',
    teaser: 'Your reason for being here',
    text: "What made you want to start saving your family's story? Was there a moment — or a person — that made you realize these stories needed to be written down?",
  },
  {
    category: 'family',
    teaser: 'Someone worth remembering',
    text: "Is there someone in your family — a grandparent, a parent, even yourself — whose story feels most at risk of being lost? Tell me about them.",
  },
  {
    category: 'identity',
    teaser: 'Where you come from',
    text: "What's one thing about where you came from — your family, your upbringing, your roots — that most people who know you today would be surprised to learn?",
  },
  {
    category: 'tradition',
    teaser: 'The story that defines you',
    text: "Every family has a story that always seems to come up at gatherings. What's one that says something true about who your family really is?",
  },
]

type Stage = 'pick' | 'answer' | 'submitted' | 'draft-saved' | 'email-sent'

export default function FirstPromptPicker({ userName }: { userName: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('pick')
  const [selected, setSelected] = useState<typeof PROMPTS[0] | null>(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setIsSpeechSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  useEffect(() => {
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
      setResponse(prev => prev ? prev + ' ' + transcript : transcript)
    }

    recognition.onerror = () => setIsRecording(false)
    recognition.onend = () => setIsRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  async function handleBegin() {
    if (!selected || !response.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/prompt/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: selected.text,
        responseText: response,
        promptCategory: selected.category,
      }),
    })
    if (!res.ok) { setError('Something went wrong. Please try again.'); setLoading(false); return }
    setStage('submitted')
    setTimeout(() => router.refresh(), 1500)
  }

  async function handleFinishLater() {
    if (!selected) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/prompt/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: selected.text,
        draftText: response,
        promptCategory: selected.category,
      }),
    })
    if (!res.ok) { setError('Something went wrong. Please try again.'); setLoading(false); return }
    setStage('draft-saved')
    setTimeout(() => router.refresh(), 1200)
  }

  async function handleEmailInstead() {
    if (!selected) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/prompt/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: selected.text,
        promptCategory: selected.category,
      }),
    })
    if (!res.ok) { setError('Something went wrong. Please try again.'); setLoading(false); return }
    setStage('email-sent')
  }

  if (stage === 'submitted') {
    return (
      <div className="text-center space-y-2 py-8">
        <h2 className="text-xl font-display font-semibold text-foreground">Your story has begun.</h2>
        <p className="text-muted-fg text-sm">We're reading your response and crafting your next question.</p>
      </div>
    )
  }

  if (stage === 'draft-saved') {
    return (
      <div className="text-center space-y-2 py-8">
        <h2 className="text-xl font-display font-semibold text-foreground">Saved for later.</h2>
        <p className="text-muted-fg text-sm">Your prompt is waiting whenever you're ready to finish.</p>
      </div>
    )
  }

  if (stage === 'email-sent') {
    return (
      <div className="text-center space-y-2 py-8">
        <h2 className="text-xl font-display font-semibold text-foreground">On its way.</h2>
        <p className="text-muted-fg text-sm">
          We've sent your first prompt to your email. Reply whenever you're ready — there's no rush.
        </p>
      </div>
    )
  }

  if (stage === 'answer' && selected) {
    return (
      <div className="space-y-5">
        <div>
          <button
            onClick={() => { setStage('pick'); setResponse('') }}
            className="text-xs text-muted-fg hover:text-foreground mb-4 flex items-center gap-1 transition-colors duration-300"
          >
            &larr; Choose a different question
          </button>
          <p className="font-display italic text-foreground text-lg leading-relaxed">{selected.text}</p>
        </div>
        <div className="relative">
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            placeholder="Take your time. There's no wrong answer."
            rows={7}
            autoFocus
            className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all duration-300"
          />
          {isSpeechSupported && (
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
        <div className="flex flex-col gap-2">
          <button
            onClick={handleBegin}
            disabled={loading || !response.trim()}
            className="w-full h-11 bg-primary hover:opacity-90 text-white text-sm font-medium rounded-full disabled:opacity-40 transition-all duration-300"
          >
            {loading ? 'Saving...' : 'Begin my story'}
          </button>
          <button
            onClick={handleFinishLater}
            disabled={loading}
            className="w-full h-11 border border-border text-foreground/70 text-sm rounded-full hover:bg-muted transition-all duration-300 disabled:opacity-40"
          >
            Finish later
          </button>
          <button
            onClick={handleEmailInstead}
            disabled={loading}
            className="w-full py-2 text-muted-fg text-sm hover:text-foreground transition-colors duration-300 disabled:opacity-40"
          >
            Email me this question instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground">Where would you like to begin, {userName}?</h2>
        <p className="text-muted-fg text-sm mt-1">Choose the question that feels most right, right now.</p>
      </div>
      <div className="space-y-3">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt.category}
            onClick={() => { setSelected(prompt); setStage('answer') }}
            className="w-full text-left p-5 bg-background border border-border rounded-2xl hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group"
            style={{ boxShadow: '0 2px 12px -4px rgba(93, 112, 82, 0.08)' }}
          >
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2">{prompt.teaser}</p>
            <p className="font-display italic text-foreground/80 text-sm leading-relaxed group-hover:text-foreground transition-colors duration-300">{prompt.text}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
