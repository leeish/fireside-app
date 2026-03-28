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
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
        A question for you
      </p>
      <p className="text-stone-800 text-base leading-relaxed font-medium">
        {question}
      </p>
      <Link
        href={`/dashboard/answer/${promptId}`}
        className="inline-block py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Answer
      </Link>
    </div>
  )
}
