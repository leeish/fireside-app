'use client'

import { useState } from 'react'
import type { NarrativeGraph, PersonNode } from '@/lib/graph'

type EraRichness = 'none' | 'low' | 'medium' | 'high'

const RICHNESS_WIDTH: Record<EraRichness, string> = {
  none: '0%',
  low: '25%',
  medium: '60%',
  high: '100%',
}

const RICHNESS_LABEL: Record<EraRichness, string> = {
  none: 'Not yet explored',
  low: 'Shallow',
  medium: 'Developing',
  high: 'Well documented',
}

const RICHNESS_ORDER: EraRichness[] = ['none', 'low', 'medium', 'high']

function EraCard({ name, richness, entries }: { name: string; richness: EraRichness; entries: number }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground capitalize">{name}</p>
        <p className="text-xs text-muted-fg">{entries} {entries === 1 ? 'entry' : 'entries'}</p>
      </div>
      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all duration-500"
          style={{ width: RICHNESS_WIDTH[richness] }}
        />
      </div>
      <p className="text-xs text-muted-fg">{RICHNESS_LABEL[richness]}</p>
    </div>
  )
}

type MergeState =
  | { step: 'idle' }
  | { step: 'picking'; source: string }
  | { step: 'confirm'; canonical: string; duplicate: string }

function PersonCard({
  name,
  node,
  mergeState,
  onMergeStart,
  onMergeSelect,
  onMergeCancel,
}: {
  name: string
  node: PersonNode
  mergeState: MergeState
  onMergeStart: (name: string) => void
  onMergeSelect: (name: string) => void
  onMergeCancel: () => void
}) {
  const [expanded, setExpanded] = useState(false)

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
          <p className="text-sm font-medium text-foreground">{name}</p>
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
  const [graph, setGraph] = useState(initialGraph)
  const [mergeState, setMergeState] = useState<MergeState>({ step: 'idle' })
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeError, setMergeError] = useState('')

  const sortedEras = Object.entries(graph.eras).sort((a, b) => {
    return RICHNESS_ORDER.indexOf(a[1].richness as EraRichness) - RICHNESS_ORDER.indexOf(b[1].richness as EraRichness)
  })

  const sortedPeople = Object.entries(graph.people).sort((a, b) => b[1].mentions - a[1].mentions)

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
    // Optimistically update local graph
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
                richness={node.richness as EraRichness}
                entries={node.entries}
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
      {graph.places.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Places</p>
          <div className="flex flex-wrap gap-2">
            {graph.places.map(place => (
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
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30">
            {graph.open_threads.map((thread, i) => (
              <p key={i} className="px-5 py-3 text-sm text-foreground/80">
                {thread}
              </p>
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
