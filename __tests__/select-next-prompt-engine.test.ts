import { describe, it, expect } from 'vitest'
import { selectTopThreads } from '../inngest/functions/select-next-prompt-engine'
import type { NarrativeGraph } from '../lib/graph'

function baseGraph(overrides: Partial<NarrativeGraph> = {}): NarrativeGraph {
  return {
    people: {},
    places: [],
    eras: {},
    themes: [],
    deflections: [],
    interests: [],
    events: [],
    open_threads: [],
    total_entries: 20,
    faith: {},
    milestone_calendar: {},
    ...overrides,
  }
}

describe('selectTopThreads', () => {
  it('returns at most 1 open_thread candidate even with 10 open threads', () => {
    const graph = baseGraph({
      open_threads: ['topic A', 'topic B', 'topic C', 'topic D', 'topic E', 'topic F', 'topic G', 'topic H', 'topic I', 'topic J'],
    })
    const candidates = selectTopThreads(graph)
    const openThreadCount = candidates.filter(c => c.threadId.startsWith('open_thread:')).length
    expect(openThreadCount).toBeLessThanOrEqual(1)
  })

  it('produces candidates from at least 3 different domains when graph is diverse', () => {
    const graph = baseGraph({
      open_threads: ['topic A', 'topic B', 'topic C', 'topic D'],
      themes: ['resilience', 'family'],
      people: {
        Angie: { mentions: 3, unexplored: ['her childhood'], facts: [], sentiment: 'warm' },
        Bob: { mentions: 1, unexplored: [], facts: [] },
      },
      eras: { childhood: { richness: 'low', entries: 1 } },
      places: ['Salt Lake City'],
      events: ['family reunion 1995'],
      interests: ['woodworking'],
    })
    const candidates = selectTopThreads(graph)
    const domains = new Set(candidates.map(c => c.threadId.split(':')[0]))
    expect(domains.size).toBeGreaterThanOrEqual(3)
  })

  it('lightness wins when last_entry_weight is heavy', () => {
    const graph = baseGraph({
      last_entry_weight: 'heavy',
      open_threads: ['topic A', 'topic B', 'topic C'],
      themes: ['resilience'],
      places: ['home'],
    })
    const candidates = selectTopThreads(graph)
    expect(candidates[0].threadId).toBe('lightness')
  })

  it('returns the childhood era fallback when all eras are fully captured and graph is otherwise empty', () => {
    // All 6 eras at 'high' richness score 0 — no other candidates — triggers the fallback
    const fullEras = Object.fromEntries(
      ['childhood', 'youth', 'mission', 'marriage', 'parenthood', 'career'].map(e => [e, { richness: 'high' as const, entries: 10 }])
    )
    const graph = baseGraph({ eras: fullEras, people: {}, open_threads: [], themes: [], places: [], events: [], interests: [] })
    const candidates = selectTopThreads(graph)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].threadId).toBe('era:childhood')
  })
})
