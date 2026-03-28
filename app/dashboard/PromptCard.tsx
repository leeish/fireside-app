'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Props = {
  promptId: string
  question: string
}

const SUPPRESS_MS = 5 * 60 * 1000 // 5 minutes

export default function PromptCard({ promptId, question }: Props) {
  const [visible, setVisible] = useState(false)

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

  if (!visible) return null

  return (
    <div
      className="bg-muted border border-primary/20 rounded-3xl p-7 space-y-5"
      style={{ boxShadow: '0 8px 32px -8px rgba(184, 106, 46, 0.12)' }}
    >
      <p className="text-xs font-medium text-primary uppercase tracking-widest">
        A question for you
      </p>
      <p className="font-display italic text-foreground text-lg leading-relaxed">
        {question}
      </p>
      <Link
        href={`/dashboard/answer/${promptId}`}
        className="inline-block h-10 px-6 bg-primary hover:opacity-90 text-white text-sm font-medium rounded-full transition-all duration-300 leading-10"
      >
        Answer
      </Link>
    </div>
  )
}
