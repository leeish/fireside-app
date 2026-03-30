'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Props = {
  promptId: string
  question: string
  reasoning?: string
  linkedConversationId?: string
}

const SUPPRESS_MS = 5 * 60 * 1000 // 5 minutes

export default function PromptCard({ promptId, question, reasoning, linkedConversationId }: Props) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('last_settled_at')
    if (raw) {
      const elapsed = Date.now() - parseInt(raw, 10)
      if (elapsed < SUPPRESS_MS) {
        setVisible(false)
        return
      }
    }
    setVisible(true)
  }, [])

  async function handleSkip() {
    setSkipping(true)
    await fetch(`/api/prompt/${promptId}/skip`, { method: 'POST' })
    setSkipped(true)

    const startedAt = Date.now()
    const POLL_INTERVAL = 4000
    const TIMEOUT = 60000

    const poll = async () => {
      if (Date.now() - startedAt >= TIMEOUT) {
        setGaveUp(true)
        return
      }
      try {
        const res = await fetch('/api/prompt/pending')
        const data = await res.json()
        if (data.found) {
          router.refresh()
          return
        }
      } catch {
        // silent — retry next interval
      }
      setTimeout(poll, POLL_INTERVAL)
    }

    setTimeout(poll, POLL_INTERVAL)
  }

  if (!visible) return null

  if (skipped) {
    return (
      <div
        className="bg-card rounded-[2rem] border border-border/50 p-8 text-center space-y-2"
        style={{ boxShadow: '0 8px 32px -8px rgba(93, 112, 82, 0.10)' }}
      >
        {gaveUp ? (
          <>
            <p className="font-display italic text-muted-fg text-base">Your next question is on its way.</p>
            <p className="text-xs text-muted-fg">Check back in a few minutes.</p>
          </>
        ) : (
          <p className="font-display italic text-muted-fg text-base">Finding a better question for you...</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        className="bg-card rounded-[2rem] border border-primary/20 p-8 space-y-5"
        style={{ boxShadow: '0 8px 32px -8px rgba(93, 112, 82, 0.15)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest">
            A question for you
          </p>
          {reasoning && (
            <details className="cursor-pointer group">
              <summary className="text-xs text-muted-fg underline hover:text-foreground transition-colors list-none marker:content-none">
                Why?
              </summary>
              <p className="text-xs text-muted-fg mt-3 leading-relaxed">
                {reasoning}
              </p>
            </details>
          )}
        </div>
        <p className="font-display italic text-foreground text-xl leading-relaxed">
          {question}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href={linkedConversationId ? `/dashboard/conversation/${linkedConversationId}` : `/dashboard/answer/${promptId}`}
            className="inline-flex items-center h-12 px-8 bg-primary text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 transition-all duration-300"
            style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.25)' }}
          >
            {linkedConversationId ? 'Continue' : 'Answer'}
          </Link>
          <button
            onClick={handleSkip}
            disabled={skipping}
            className="text-sm text-muted-fg hover:text-foreground disabled:opacity-50 transition-colors duration-300"
          >
            {skipping ? 'Skipping...' : 'Not for me'}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-fg text-center">
        Something else on your mind?{' '}
        <Link href="/dashboard/new" className="underline underline-offset-2 hover:text-foreground transition-colors duration-300">
          Write a free entry instead
        </Link>
      </p>
    </div>
  )
}
