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
      className="bg-card rounded-[2rem] border border-primary/20 p-8 space-y-5"
      style={{ boxShadow: '0 8px 32px -8px rgba(93, 112, 82, 0.15)' }}
    >
      <p className="text-xs font-semibold text-primary uppercase tracking-widest">
        A question for you
      </p>
      <p className="font-display italic text-foreground text-xl leading-relaxed">
        {question}
      </p>
      <Link
        href={`/dashboard/answer/${promptId}`}
        className="inline-flex items-center h-12 px-8 bg-primary text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 transition-all duration-300"
        style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.25)' }}
      >
        Answer
      </Link>
    </div>
  )
}
