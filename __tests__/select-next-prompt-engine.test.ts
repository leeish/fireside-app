import { describe, it, expect } from 'vitest'
import { selectTopThreads } from '../inngest/functions/select-next-prompt-engine'
import { LIFE_CURRICULUM } from '../inngest/functions/select-next-prompt-engine'
import type { NarrativeGraph } from '../lib/graph'

function baseGraph(overrides: Partial<NarrativeGraph> = {}): NarrativeGraph {
  return {
    people: {},
    places: {},
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

// Build a history array that covers every curriculum item
function allCurriculumHistory() {
  return LIFE_CURRICULUM.map(item => ({ thread_id: item.id }))
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
      places: { 'Salt Lake City': { name: 'Salt Lake City' } },
      events: [{ name: 'family reunion 1995' }],
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
      places: { 'home': { name: 'home' } },
    })
    const candidates = selectTopThreads(graph)
    expect(candidates[0].threadId).toBe('lightness')
  })

  it('returns the childhood era fallback when all eras are fully captured, graph is otherwise empty, and all curriculum items are covered', () => {
    const fullEras = Object.fromEntries(
      ['childhood', 'youth', 'mission', 'marriage', 'parenthood', 'career'].map(e => [e, { richness: 'high' as const, entries: 10 }])
    )
    const graph = baseGraph({ eras: fullEras, people: {}, open_threads: [], themes: [], places: {}, events: [], interests: [] })
    // Pass full curriculum history so all curriculum items are marked covered
    const candidates = selectTopThreads(graph, allCurriculumHistory())
    expect(candidates).toHaveLength(1)
    expect(candidates[0].threadId).toBe('era:childhood')
  })

  it('includes a curriculum thread when history is empty', () => {
    const graph = baseGraph({ total_entries: 5 })
    const candidates = selectTopThreads(graph, [])
    const hasCurriculum = candidates.some(c => c.threadId.startsWith('curriculum:'))
    expect(hasCurriculum).toBe(true)
  })

  it('excludes a curriculum item once it appears in history', () => {
    const graph = baseGraph({ total_entries: 5 })
    const history = [{ thread_id: 'curriculum:parents_as_people' }]
    const candidatesAfter = selectTopThreads(graph, history)
    const stillPresent = candidatesAfter.some(c => c.threadId === 'curriculum:parents_as_people')
    expect(stillPresent).toBe(false)
  })

  it('at most 1 curriculum candidate in the top-5 (domain diversity)', () => {
    // Empty graph with no history — many curriculum items will score
    const graph = baseGraph({ total_entries: 3, eras: {}, people: {}, themes: [], open_threads: [] })
    const candidates = selectTopThreads(graph, [])
    const curriculumCount = candidates.filter(c => c.threadId.startsWith('curriculum:')).length
    expect(curriculumCount).toBeLessThanOrEqual(1)
  })
})
