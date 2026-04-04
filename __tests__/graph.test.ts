import { describe, it, expect } from 'vitest'
import { mergePersonNodes, emptyGraph } from '../lib/graph'
import type { NarrativeGraph } from '../lib/graph'

function baseGraph(overrides: Partial<NarrativeGraph> = {}): NarrativeGraph {
  return {
    ...emptyGraph('Test User'),
    ...overrides,
  }
}

describe('mergePersonNodes', () => {
  it('sums mentions and combines facts and unexplored threads', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 3, facts: ['lives in Provo'], unexplored: ['her childhood'] },
        wife: { mentions: 5, facts: ['married in 2001'], unexplored: ['how they met'] },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['Angie'].mentions).toBe(8)
    expect(result.people['Angie'].facts).toContain('lives in Provo')
    expect(result.people['Angie'].facts).toContain('married in 2001')
    expect(result.people['Angie'].unexplored).toContain('her childhood')
    expect(result.people['Angie'].unexplored).toContain('how they met')
  })

  it('removes the duplicate node', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: [], unexplored: [] },
        wife: { mentions: 2, facts: [], unexplored: [] },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['wife']).toBeUndefined()
    expect(result.people['Angie']).toBeDefined()
  })

  it('deduplicates overlapping facts', () => {
    const sharedFact = 'loves hiking'
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: [sharedFact], unexplored: [] },
        wife: { mentions: 1, facts: [sharedFact, 'plays piano'], unexplored: [] },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['Angie'].facts.filter(f => f === sharedFact)).toHaveLength(1)
    expect(result.people['Angie'].facts).toContain('plays piano')
  })

  it('falls back to duplicate sentiment when canonical has none', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: [], unexplored: [] },
        wife: { mentions: 1, facts: [], unexplored: [], sentiment: 'warm' },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['Angie'].sentiment).toBe('warm')
  })

  it('keeps canonical sentiment when both have one', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: [], unexplored: [], sentiment: 'loving' },
        wife: { mentions: 1, facts: [], unexplored: [], sentiment: 'warm' },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['Angie'].sentiment).toBe('loving')
  })

  it('falls back to duplicate relationship when canonical has none', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: [], unexplored: [] },
        wife: { mentions: 1, facts: [], unexplored: [], relationship: 'spouse' },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['Angie'].relationship).toBe('spouse')
  })

  it('returns graph unchanged if canonical does not exist', () => {
    const graph = baseGraph({
      people: {
        wife: { mentions: 2, facts: [], unexplored: [] },
      },
    })
    const result = mergePersonNodes(graph, 'Angie', 'wife')
    expect(result.people['wife']).toBeDefined()
  })

  it('does not mutate the original graph', () => {
    const graph = baseGraph({
      people: {
        Angie: { mentions: 1, facts: ['a fact'], unexplored: [] },
        wife: { mentions: 2, facts: ['another fact'], unexplored: [] },
      },
    })
    mergePersonNodes(graph, 'Angie', 'wife')
    expect(graph.people['wife']).toBeDefined()
    expect(graph.people['Angie'].mentions).toBe(1)
  })
})
