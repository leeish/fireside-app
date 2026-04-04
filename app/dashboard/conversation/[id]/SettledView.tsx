'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import CleanupTab from './CleanupTab'
import StoryTab from './StoryTab'
import ClarifyTab from './ClarifyTab'
import ExtractionTab from './ExtractionTab'
import type { ExtractionResult } from '@/lib/graph'

type Turn = { id: string; role: string; content: string; created_at: string }

type Entry = {
  id: string
  content: string | null
  cleaned_content: string | null
  story_content: string | null
  story_intensity: string | null
} | null

type Tab = 'transcript' | 'clarify' | 'cleanup' | 'story' | 'extraction'

const TABS: { value: Tab; label: string }[] = [
  { value: 'transcript', label: 'Transcript' },
  { value: 'clarify', label: 'Clarify' },
  { value: 'cleanup', label: 'Cleaned Up' },
  { value: 'story', label: 'Story Entry' },
  { value: 'extraction', label: 'Extracted' },
]

export default function SettledView({
  conversationId,
  channel,
  turns,
  entry,
  topic,
  clarificationsCount = 0,
  titleStyle = 'simple',
  userPronouns = null,
  previousStoryVersion = null,
  entryContext = null,
}: {
  conversationId: string
  channel: string
  turns: Turn[]
  entry: Entry
  topic: string
  clarificationsCount?: number
  titleStyle?: string
  userPronouns?: string | null
  previousStoryVersion?: { content: string; intensity: string | null; created_at: string } | null
  entryContext?: ExtractionResult | null
}) {
  const router = useRouter()

  const defaultTab: Tab = entry?.story_content ? 'story' : entry?.cleaned_content ? 'cleanup' : 'transcript'
  const [tab, setTab] = useState<Tab>(defaultTab)

  const [title, setTitle] = useState(topic)
  const [generatingTitle, setGeneratingTitle] = useState(false)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const TITLE_STYLES = [
    { value: 'evocative', label: 'Evocative' },
    { value: 'witty',     label: 'Witty' },
    { value: 'playful',   label: 'Playful' },
    { value: 'poetic',    label: 'Poetic' },
    { value: 'simple',    label: 'Simple' },
  ]

  // Auto-generate title if topic still looks like a question
  useEffect(() => {
    if (topic.includes('?')) {
      generateTitle(titleStyle)
    }
  }, [])

  async function generateTitle(style: string) {
    setGeneratingTitle(true)
    setShowStylePicker(false)
    const res = await fetch(`/api/conversation/${conversationId}/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style }),
    })
    if (res.ok) {
      const data = await res.json()
      setTitle(data.title)
      if (titleRef.current) titleRef.current.innerText = data.title
    }
    setGeneratingTitle(false)
  }

  async function handleTitleBlur() {
    const newTitle = titleRef.current?.innerText.trim() ?? ''
    if (!newTitle || newTitle === title) return
    setTitle(newTitle)
    await fetch(`/api/conversation/${conversationId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
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

  return (
    <div>
      {/* Editable title */}
      <div className="mb-8">
        <div className="group flex items-start gap-3">
          <div className="flex-1">
            {generatingTitle ? (
              <p className="text-lg font-display font-semibold text-muted-fg animate-pulse">Generating title...</p>
            ) : (
              <h1
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={handleTitleBlur}
                className="text-lg font-display font-semibold text-foreground leading-snug whitespace-normal break-words focus:outline-none cursor-text"
                style={{ caretColor: 'var(--color-primary)' }}
              >
                {title}
              </h1>
            )}
          </div>
          <button
            onClick={() => setShowStylePicker(p => !p)}
            disabled={generatingTitle}
            title="Generate a new title"
            className="opacity-0 group-hover:opacity-100 mt-1 text-xs text-muted-fg hover:text-foreground disabled:opacity-30 transition-all duration-200 shrink-0"
          >
            AI title
          </button>
        </div>

        {/* Style picker */}
        {showStylePicker && (
          <div className="mt-3 flex flex-wrap gap-2">
            {TITLE_STYLES.map(s => (
              <button
                key={s.value}
                onClick={() => generateTitle(s.value)}
                className="px-3 h-7 rounded-full border border-border text-xs text-muted-fg hover:border-primary/40 hover:text-foreground transition-all duration-200"
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={() => setShowStylePicker(false)}
              className="px-3 h-7 rounded-full text-xs text-muted-fg/50 hover:text-muted-fg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/40 mb-8">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-fg hover:text-foreground'
            }`}
          >
            {t.label}
            {t.value === 'clarify' && clarificationsCount > 0 && (
              <span className="absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-primary rounded-full">
                {clarificationsCount}
              </span>
            )}
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

      {/* Clarify */}
      <div className={tab !== 'clarify' ? 'hidden' : ''}>
        <ClarifyTab conversationId={conversationId} />
      </div>

      {/* Cleaned Up */}
      <div className={tab !== 'cleanup' ? 'hidden' : ''}>
        <CleanupTab
          conversationId={conversationId}
          entry={entry}
          onSwitchTab={(t) => setTab(t as Tab)}
          clarificationsCount={clarificationsCount}
        />
      </div>

      {/* Story Entry */}
      <div className={tab !== 'story' ? 'hidden' : ''}>
        <StoryTab
          conversationId={conversationId}
          entry={entry}
          onSwitchTab={(t) => setTab(t as Tab)}
          clarificationsCount={clarificationsCount}
          userPronouns={userPronouns}
          previousStoryVersion={previousStoryVersion}
        />
      </div>

      {/* Extracted */}
      <div className={tab !== 'extraction' ? 'hidden' : ''}>
        <ExtractionTab extraction={entryContext} />
      </div>
    </div>
  )
}
