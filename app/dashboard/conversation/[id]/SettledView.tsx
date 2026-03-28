'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CleanupTab from './CleanupTab'
import StoryTab from './StoryTab'

type Turn = { id: string; role: string; content: string; created_at: string }

type Entry = {
  id: string
  content: string | null
  cleaned_content: string | null
  story_content: string | null
  story_intensity: string | null
} | null

type Tab = 'transcript' | 'cleanup' | 'story'

const TABS: { value: Tab; label: string }[] = [
  { value: 'transcript', label: 'Transcript' },
  { value: 'cleanup', label: 'Cleaned Up' },
  { value: 'story', label: 'Story Entry' },
]

export default function SettledView({
  conversationId,
  channel,
  turns,
  entry,
}: {
  conversationId: string
  channel: string
  turns: Turn[]
  entry: Entry
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('transcript')
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

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

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/40 mb-8">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-fg hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Transcript */}
      <div className={tab !== 'transcript' ? 'hidden' : ''}>
        <div>
          <div className="space-y-7 mb-10">
            {turns.map(turn => (
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
          </div>

          <div className="border-t border-border/40 pt-6 space-y-4">
            <p className="text-sm text-muted-fg text-center font-display italic">
              This conversation is complete. Your story has been captured.
            </p>
            {!showArchiveConfirm ? (
              <div className="text-center">
                <button
                  onClick={() => setShowArchiveConfirm(true)}
                  className="text-xs text-muted-fg hover:text-red-500 transition-colors duration-300"
                >
                  Remove from journal
                </button>
              </div>
            ) : (
              <div className="border border-border/50 rounded-2xl p-4 space-y-3">
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
      </div>

      {/* Cleaned Up */}
      <div className={tab !== 'cleanup' ? 'hidden' : ''}>
        <CleanupTab conversationId={conversationId} entry={entry} />
      </div>

      {/* Story Entry */}
      <div className={tab !== 'story' ? 'hidden' : ''}>
        <StoryTab conversationId={conversationId} entry={entry} />
      </div>
    </div>
  )
}
