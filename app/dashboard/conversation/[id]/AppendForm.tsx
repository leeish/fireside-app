'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppendForm({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
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

  async function handleSubmit() {
    if (!response.trim()) return
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

    setSaved(true)
    setResponse('')
    setTimeout(() => {
      setSaved(false)
      router.refresh()
    }, 1500)
    setLoading(false)
  }

  if (saved) {
    return (
      <div className="text-center py-6">
        <p className="text-stone-500 text-sm">Added to your story.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">Add more</p>
      <div className="relative">
        <textarea
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder="Continue the thought, add a detail, or take it somewhere new."
          rows={5}
          className="w-full px-4 py-3 border border-stone-300 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
        />
        {isSpeechSupported && (
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
        onClick={handleSubmit}
        disabled={loading || !response.trim()}
        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
      >
        {loading ? 'Saving...' : 'Add to story'}
      </button>
    </div>
  )
}
