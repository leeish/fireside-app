'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { NarrativeGraph, PersonNode } from '@/lib/graph'

function EraCard({ name, entries, maxEntries }: { name: string; entries: number; maxEntries: number }) {
  const pct = maxEntries > 0 ? Math.round((entries / maxEntries) * 100) : 0
  return (
    <Link
      href={`/dashboard/story-map/era/${encodeURIComponent(name)}`}
      className="block bg-card border border-border/50 rounded-2xl px-5 py-4 space-y-2 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground capitalize">{name}</p>
        <p className="text-xs text-muted-fg">{entries} {entries === 1 ? 'entry' : 'entries'}</p>
      </div>
      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  )
}

type MergeState =
  | { step: 'idle' }
  | { step: 'picking'; source: string }
  | { step: 'confirm'; canonical: string; duplicate: string }

function PersonCard({
  name,
  node,
  maxMentions,
  mergeState,
  onMergeStart,
  onMergeSelect,
  onMergeCancel,
}: {
  name: string
  node: PersonNode
  maxMentions: number
  mergeState: MergeState
  onMergeStart: (name: string) => void
  onMergeSelect: (name: string) => void
  onMergeCancel: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pct = maxMentions > 0 ? Math.round((node.mentions / maxMentions) * 100) : 0

  const isPicking = mergeState.step === 'picking'
  const isSource = isPicking && mergeState.source === name
  const isTarget = isPicking && mergeState.source !== name

  return (
    <div
      className={`bg-card border rounded-2xl px-5 py-4 space-y-3 transition-all duration-200 ${
        isSource
          ? 'border-primary/60 bg-primary/5'
          : isTarget
          ? 'border-primary/30 hover:border-primary/60 cursor-pointer'
          : 'border-border/50'
      }`}
      onClick={isTarget ? () => onMergeSelect(name) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/story-map/person/${encodeURIComponent(name)}`}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors duration-200"
            onClick={e => e.stopPropagation()}
          >
            {name}
          </Link>
          {node.relationship && (
            <p className="text-xs text-muted-fg mt-0.5 capitalize">{node.relationship}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-fg">{node.mentions}x</span>
          {!isPicking && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
              className="text-xs text-muted-fg hover:text-foreground transition-colors duration-200"
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
          )}
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/40 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {expanded && !isPicking && (
        <div className="space-y-3 border-t border-border/30 pt-3">
          {node.sentiment && (
            <div>
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest mb-1">Sentiment</p>
              <p className="text-xs text-foreground/80 capitalize">{node.sentiment}</p>
            </div>
          )}
          {node.facts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest mb-1">Known facts</p>
              <ul className="space-y-1">
                {node.facts.map((f, i) => (
                  <li key={i} className="text-xs text-foreground/80">- {f}</li>
                ))}
              </ul>
            </div>
          )}
          {node.unexplored.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest mb-1">Threads to explore</p>
              <ul className="space-y-1">
                {node.unexplored.map((t, i) => (
                  <li key={i} className="text-xs text-foreground/80">- {t}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={() => onMergeStart(name)}
            className="text-xs text-muted-fg hover:text-foreground transition-colors duration-200 underline underline-offset-2"
          >
            Same person as...
          </button>
        </div>
      )}

      {isSource && (
        <div className="border-t border-border/30 pt-3 flex items-center justify-between">
          <p className="text-xs text-muted-fg">Select the duplicate to merge into <strong>{name}</strong></p>
          <button
            onClick={(e) => { e.stopPropagation(); onMergeCancel() }}
            className="text-xs text-muted-fg hover:text-foreground transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function MergeConfirmDialog({
  canonical,
  duplicate,
  canonicalNode,
  duplicateNode,
  onConfirm,
  onSwap,
  onCancel,
  loading,
}: {
  canonical: string
  duplicate: string
  canonicalNode: PersonNode
  duplicateNode: PersonNode
  onConfirm: () => void
  onSwap: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-lg">
        <div>
          <p className="text-sm font-semibold text-foreground">Merge these two people?</p>
          <p className="text-xs text-muted-fg mt-1">
            Everything from <strong>{duplicate}</strong> will be merged into <strong>{canonical}</strong>, and the name <strong>{duplicate}</strong> will be removed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[{ label: 'Keep this name', name: canonical, node: canonicalNode }, { label: 'Remove this name', name: duplicate, node: duplicateNode }].map(({ label, name, node }) => (
            <div key={name} className="bg-background border border-border/50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-fg">{label}</p>
              <p className="text-sm font-medium text-foreground">{name}</p>
              {node.relationship && <p className="text-xs text-muted-fg capitalize">{node.relationship}</p>}
              <p className="text-xs text-muted-fg">{node.mentions} mentions</p>
            </div>
          ))}
        </div>
        <button
          onClick={onSwap}
          disabled={loading}
          className="text-xs text-muted-fg hover:text-foreground transition-colors duration-200 underline underline-offset-2"
        >
          Swap -- keep "{duplicate}" instead
        </button>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-5 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-all duration-300"
          >
            {loading ? 'Merging...' : 'Merge'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-5 h-9 border border-border text-xs text-muted-fg hover:text-foreground rounded-full disabled:opacity-50 transition-colors duration-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StoryMapClient({ graph: initialGraph }: { graph: NarrativeGraph }) {
  const router = useRouter()
  const [graph, setGraph] = useState(initialGraph)
  const [mergeState, setMergeState] = useState<MergeState>({ step: 'idle' })
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [revisitingThread, setRevisitingThread] = useState<string | null>(null)
  const [revisitError, setRevisitError] = useState('')

  const maxEraEntries = Math.max(1, ...Object.values(graph.eras).map(e => e.entries))
  const maxMentions = Math.max(1, ...Object.values(graph.people).map(p => p.mentions))

  const sortedEras = Object.entries(graph.eras).sort((a, b) => a[1].entries - b[1].entries)
  const sortedPeople = Object.entries(graph.people).sort((a, b) => b[1].mentions - a[1].mentions)
  const placeNames = Object.keys(graph.places)

  function handleMergeStart(name: string) {
    setMergeState({ step: 'picking', source: name })
  }

  function handleMergeSelect(name: string) {
    if (mergeState.step !== 'picking') return
    setMergeState({ step: 'confirm', canonical: mergeState.source, duplicate: name })
  }

  function handleMergeSwap() {
    if (mergeState.step !== 'confirm') return
    setMergeState({ step: 'confirm', canonical: mergeState.duplicate, duplicate: mergeState.canonical })
  }

  async function handleMergeConfirm() {
    if (mergeState.step !== 'confirm') return
    setMergeLoading(true)
    setMergeError('')
    const { canonical, duplicate } = mergeState
    const res = await fetch('/api/narrative/merge-people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical, duplicate }),
    })
    if (!res.ok) {
      setMergeError('Something went wrong. Please try again.')
      setMergeLoading(false)
      return
    }
    const updatedPeople = { ...graph.people }
    const canonNode = { ...updatedPeople[canonical] }
    const dupNode = updatedPeople[duplicate]
    canonNode.mentions += dupNode.mentions
    canonNode.facts = [...new Set([...canonNode.facts, ...dupNode.facts])]
    canonNode.unexplored = [...new Set([...canonNode.unexplored, ...dupNode.unexplored])]
    if (!canonNode.relationship && dupNode.relationship) canonNode.relationship = dupNode.relationship
    if (!canonNode.sentiment && dupNode.sentiment) canonNode.sentiment = dupNode.sentiment
    delete updatedPeople[duplicate]
    setGraph({ ...graph, people: updatedPeople })
    setMergeState({ step: 'idle' })
    setMergeLoading(false)
  }

  function handleMergeCancel() {
    setMergeState({ step: 'idle' })
    setMergeError('')
  }

  async function handleRevisitThread(thread: string) {
    setRevisitingThread(thread)
    setRevisitError('')
    const res = await fetch('/api/narrative/revisit-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread }),
    })
    if (!res.ok) {
      setRevisitError('Something went wrong. Please try again.')
      setRevisitingThread(null)
      return
    }
    const data = await res.json()
    router.push(`/dashboard/conversation/${data.conversationId}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-12">
      <div>
        <h1 className="text-lg font-display font-semibold text-foreground">Your story so far</h1>
        <p className="text-sm text-muted-fg mt-1">{graph.total_entries} {graph.total_entries === 1 ? 'entry' : 'entries'} recorded</p>
      </div>

      {/* Life eras */}
      {sortedEras.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Life eras</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedEras.map(([era, node]) => (
              <EraCard
                key={era}
                name={era}
                entries={node.entries}
                maxEntries={maxEraEntries}
              />
            ))}
          </div>
        </section>
      )}

      {/* People */}
      {sortedPeople.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">People in your story</p>
            {mergeState.step === 'picking' && (
              <p className="text-xs text-primary">Select the duplicate to merge</p>
            )}
          </div>
          {mergeError && <p className="text-xs text-red-600">{mergeError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedPeople.map(([name, node]) => (
              <PersonCard
                key={name}
                name={name}
                node={node}
                maxMentions={maxMentions}
                mergeState={mergeState}
                onMergeStart={handleMergeStart}
                onMergeSelect={handleMergeSelect}
                onMergeCancel={handleMergeCancel}
              />
            ))}
          </div>
        </section>
      )}

      {/* Places */}
      {placeNames.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Places</p>
          <div className="flex flex-wrap gap-2">
            {placeNames.map(place => (
              <span
                key={place}
                className="px-3 h-7 flex items-center rounded-full border border-border/50 text-xs text-foreground/80 bg-card"
              >
                {place}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Themes */}
      {graph.themes.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Themes</p>
          <div className="flex flex-wrap gap-2">
            {graph.themes.map(theme => (
              <span
                key={theme}
                className="px-3 h-7 flex items-center rounded-full border border-border/50 text-xs text-foreground/80 bg-card"
              >
                {theme}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Threads to revisit */}
      {graph.open_threads.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Threads to revisit</p>
          {revisitError && <p className="text-xs text-red-600">{revisitError}</p>}
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30">
            {graph.open_threads.map((thread, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <p className="text-sm text-foreground/80 flex-1">{thread}</p>
                <button
                  onClick={() => handleRevisitThread(thread)}
                  disabled={revisitingThread !== null}
                  className="text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50 transition-colors duration-200 shrink-0"
                >
                  {revisitingThread === thread ? 'Starting...' : 'Revisit this now'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {mergeState.step === 'confirm' && (
        <MergeConfirmDialog
          canonical={mergeState.canonical}
          duplicate={mergeState.duplicate}
          canonicalNode={graph.people[mergeState.canonical]}
          duplicateNode={graph.people[mergeState.duplicate]}
          onConfirm={handleMergeConfirm}
          onSwap={handleMergeSwap}
          onCancel={handleMergeCancel}
          loading={mergeLoading}
        />
      )}
    </div>
  )
}
