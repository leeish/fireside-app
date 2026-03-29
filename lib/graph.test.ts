import { describe, it, expect } from 'vitest'
import {
  mergeExtraction,
  emptyGraph,
  buildGraphBriefing,
  findCompletenessGaps,
  applyGraphPatch,
  type NarrativeGraph,
  type ExtractionResult,
} from './graph'

describe('narrative graph', () => {
  describe('mergeExtraction', () => {
    it('initializes empty graph', () => {
      const graph = emptyGraph('Alice')
      expect(graph.display_name).toBe('Alice')
      expect(graph.total_entries).toBe(0)
      expect(graph.people).toEqual({})
      expect(graph.places).toEqual([])
      expect(graph.open_threads).toEqual([])
      expect(graph.entry_log).toBe('')
    })

    it('does not mutate input graph', () => {
      const graph = emptyGraph('Bob')
      const extraction: ExtractionResult = {
        people: [{ name: 'Mom', relationship: 'mother' }],
      }
      const original = JSON.stringify(graph)
      mergeExtraction(graph, extraction)
      expect(JSON.stringify(graph)).toBe(original)
    })

    it('increments total_entries', () => {
      let graph = emptyGraph('Carol')
      expect(graph.total_entries).toBe(0)
      graph = mergeExtraction(graph, { one_line_summary: 'Entry 1' })
      expect(graph.total_entries).toBe(1)
      graph = mergeExtraction(graph, { one_line_summary: 'Entry 2' })
      expect(graph.total_entries).toBe(2)
    })

    it('adds people and tracks mentions', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        people: [{ name: 'Dad', relationship: 'father', sentiment: 'warm' }],
      })
      expect(graph.people.Dad.mentions).toBe(1)
      expect(graph.people.Dad.relationship).toBe('father')
      expect(graph.people.Dad.sentiment).toBe('warm')

      // Mention again
      graph = mergeExtraction(graph, {
        people: [{ name: 'Dad' }],
      })
      expect(graph.people.Dad.mentions).toBe(2)
    })

    it('updates person relationship only once', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        people: [{ name: 'Person', relationship: 'sibling' }],
      })
      expect(graph.people.Person.relationship).toBe('sibling')

      // Try to change it
      graph = mergeExtraction(graph, {
        people: [{ name: 'Person', relationship: 'friend' }],
      })
      // Relationship is updated
      expect(graph.people.Person.relationship).toBe('friend')
    })

    it('accumulates person facts without duplication', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        people: [{ name: 'Sister', new_facts: ['likes gardening', 'lives in Portland'] }],
      })
      expect(graph.people.Sister.facts).toEqual(['likes gardening', 'lives in Portland'])

      graph = mergeExtraction(graph, {
        people: [{ name: 'Sister', new_facts: ['likes gardening', 'has two kids'] }],
      })
      expect(graph.people.Sister.facts).toEqual(['likes gardening', 'lives in Portland', 'has two kids'])
    })

    it('accumulates person unexplored threads', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        people: [{ name: 'Brother', new_threads: ['his time in Alaska', 'why he left tech'] }],
      })
      expect(graph.people.Brother.unexplored).toEqual(['his time in Alaska', 'why he left tech'])

      graph = mergeExtraction(graph, {
        people: [{ name: 'Brother', new_threads: ['his time in Alaska', 'his marriage'] }],
      })
      expect(graph.people.Brother.unexplored).toEqual(['his time in Alaska', 'why he left tech', 'his marriage'])
    })

    it('deduplicates places', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        places: ['Portland', 'Seattle', 'Portland'],
      })
      expect(graph.places).toEqual(['Portland', 'Seattle'])

      graph = mergeExtraction(graph, {
        places: ['Seattle', 'Vancouver'],
      })
      expect(graph.places).toEqual(['Portland', 'Seattle', 'Vancouver'])
    })

    it('tracks eras with richness levels', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, { era: 'childhood' })
      expect(graph.eras.childhood.entries).toBe(1)
      expect(graph.eras.childhood.richness).toBe('low')

      graph = mergeExtraction(graph, { era: 'childhood' })
      expect(graph.eras.childhood.entries).toBe(2)
      expect(graph.eras.childhood.richness).toBe('medium')

      graph = mergeExtraction(graph, { era: 'childhood' })
      expect(graph.eras.childhood.entries).toBe(3)
      expect(graph.eras.childhood.richness).toBe('high')

      graph = mergeExtraction(graph, { era: 'childhood' })
      expect(graph.eras.childhood.richness).toBe('high') // doesn't go higher
    })

    it('caps open_threads at 20', () => {
      let graph = emptyGraph()
      const threads = Array.from({ length: 30 }, (_, i) => `thread-${i}`)
      graph = mergeExtraction(graph, { new_threads_opened: threads })
      expect(graph.open_threads.length).toBe(20)
      // Should keep the last 20
      expect(graph.open_threads[0]).toBe('thread-10')
      expect(graph.open_threads[19]).toBe('thread-29')
    })

    it('deduplicates open_threads before capping', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        new_threads_opened: ['A', 'B', 'C'],
      })
      graph = mergeExtraction(graph, {
        new_threads_opened: ['B', 'D', 'E'], // B is duplicate
      })
      expect(graph.open_threads).toEqual(['A', 'B', 'C', 'D', 'E'])
    })

    it('deduplicates themes and deflections', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        themes: ['loss', 'family', 'loss'],
        deflections: ['politics', 'money', 'politics'],
      })
      expect(graph.themes).toEqual(['loss', 'family'])
      expect(graph.deflections).toEqual(['politics', 'money'])
    })

    it('tracks emotional weight', () => {
      let graph = emptyGraph()
      expect(graph.last_entry_weight).toBeUndefined()

      graph = mergeExtraction(graph, { emotional_weight: 'light' })
      expect(graph.last_entry_weight).toBe('light')

      graph = mergeExtraction(graph, { emotional_weight: 'heavy' })
      expect(graph.last_entry_weight).toBe('heavy')
    })

    it('appends to entry_log', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, { one_line_summary: 'Talked about childhood home' })
      expect(graph.entry_log).toBe('Talked about childhood home')

      graph = mergeExtraction(graph, { one_line_summary: 'Shared memories of dad' })
      expect(graph.entry_log).toBe('Talked about childhood home\nShared memories of dad')

      graph = mergeExtraction(graph, {}) // No summary
      expect(graph.entry_log).toBe('Talked about childhood home\nShared memories of dad')
    })

    it('detects LDS faith from high signals', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          tradition_signals: ['sacrament', 'ward'],
        },
      })
      expect(graph.faith.tradition).toBe('lds')
      expect(graph.faith.confidence).toBe('inferred')
      expect(graph.faith.tier).toBe(3)
    })

    it('detects LDS faith from medium signals (4+)', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          tradition_signals: ['mission', 'baptism at eight', 'seminary', 'calling'],
        },
      })
      expect(graph.faith.tradition).toBe('lds')
    })

    it('does not detect LDS from 1 high signal', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          tradition_signals: ['sacrament'], // Only 1 high signal
        },
      })
      expect(graph.faith.tradition).toBeUndefined()
    })

    it('does not detect LDS from <4 medium signals', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          tradition_signals: ['mission', 'baptism at eight', 'seminary'], // Only 3
        },
      })
      expect(graph.faith.tradition).toBeUndefined()
    })

    it('accumulates spiritual moments', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          spiritual_moments: ['feeling at temple', 'answered prayer'],
        },
      })
      expect(graph.faith.spiritual_moments).toEqual(['feeling at temple', 'answered prayer'])

      graph = mergeExtraction(graph, {
        faith_signals: {
          spiritual_moments: ['feeling at temple', 'new insight'],
        },
      })
      expect(graph.faith.spiritual_moments).toEqual(['feeling at temple', 'answered prayer', 'new insight'])
    })

    it('sets mission prompt_readiness only when explicitly mentioned', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        faith_signals: {
          tradition_signals: ['sacrament', 'ward'], // LDS detected
        },
      })
      expect(graph.faith.prompt_readiness?.mission).toBeUndefined() // Not confirmed yet

      graph = mergeExtraction(graph, {
        faith_signals: {
          milestones_mentioned: ['served a mission'],
        },
      })
      expect(graph.faith.prompt_readiness?.mission).toBe('confirmed')
    })

    it('deduplicates interests and events', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        interests: ['gardening', 'cooking', 'gardening'],
        events: ['family reunion', 'trip to Europe'],
      })
      expect(graph.interests).toEqual(['gardening', 'cooking'])
      expect(graph.events).toEqual(['family reunion', 'trip to Europe'])
    })

    it('handles full realistic extraction', () => {
      let graph = emptyGraph('Margaret')
      const extraction: ExtractionResult = {
        people: [
          { name: 'Husband', relationship: 'spouse', sentiment: 'warm', new_facts: ['retired last year'] },
          { name: 'Son', relationship: 'child', new_threads: ['his marriage struggles'] },
        ],
        places: ['Utah', 'California'],
        era: 'marriage',
        themes: ['family legacy', 'loss'],
        emotional_weight: 'heavy',
        interests: ['gardening'],
        faith_signals: {
          tradition_signals: ['temple recommend', 'general conference'],
          spiritual_moments: ['sealing ceremony'],
          milestones_mentioned: ['served a mission'],
        },
        new_threads_opened: ['her mission experience', 'life after retirement'],
        one_line_summary: 'Reflected on 40 years of marriage and upcoming grandchildren',
      }

      graph = mergeExtraction(graph, extraction)

      expect(graph.total_entries).toBe(1)
      expect(graph.people.Husband.mentions).toBe(1)
      expect(graph.people.Husband.facts).toContain('retired last year')
      expect(graph.places).toContain('Utah')
      expect(graph.eras.marriage.entries).toBe(1)
      expect(graph.themes).toContain('family legacy')
      expect(graph.last_entry_weight).toBe('heavy')
      expect(graph.faith.tradition).toBe('lds')
      expect(graph.faith.prompt_readiness?.mission).toBe('confirmed')
      expect(graph.open_threads).toContain('her mission experience')
      expect(graph.entry_log).toContain('40 years of marriage')
    })
  })

  describe('buildGraphBriefing', () => {
    it('formats graph as readable text', () => {
      const graph = emptyGraph('John')
      graph.people.Mom = { mentions: 3, facts: ['nurse', 'loves reading'], unexplored: [] }
      graph.places = ['Boston', 'New York']
      graph.themes = ['resilience']

      const briefing = buildGraphBriefing(graph)
      expect(briefing).toContain('John')
      expect(briefing).toContain('Mom')
      expect(briefing).toContain('nurse')
      expect(briefing).toContain('Boston')
      expect(briefing).toContain('resilience')
    })
  })

  describe('findCompletenessGaps', () => {
    it('identifies people missing relationship', () => {
      const graph = emptyGraph()
      graph.people.Person1 = { mentions: 1, facts: [], unexplored: [] } // No relationship
      graph.people.Person2 = { mentions: 1, facts: [], unexplored: [], relationship: 'friend' } // Has relationship

      const gaps = findCompletenessGaps(graph)
      expect(gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity_type: 'person',
            entity_key: 'Person1',
            field: 'relationship',
          }),
        ])
      )
      expect(gaps.find(g => g.entity_key === 'Person2')).toBeUndefined()
    })

    it('identifies events missing year/era', () => {
      const graph = emptyGraph()
      graph.events = ['wedding', 'trip to Europe']

      const gaps = findCompletenessGaps(graph)
      expect(gaps.filter(g => g.entity_type === 'event' && g.field === 'year')).toHaveLength(2)
    })
  })

  describe('applyGraphPatch', () => {
    it('patches person relationship', () => {
      let graph = emptyGraph()
      graph.people.Brother = { mentions: 1, facts: [], unexplored: [] }

      graph = applyGraphPatch(graph, 'person', 'Brother', 'relationship', 'sibling')
      expect(graph.people.Brother.relationship).toBe('sibling')
    })

    it('does not mutate input graph when patching', () => {
      const graph = emptyGraph()
      graph.people.Sister = { mentions: 1, facts: [], unexplored: [] }
      const original = JSON.stringify(graph)

      applyGraphPatch(graph, 'person', 'Sister', 'relationship', 'family')
      expect(JSON.stringify(graph)).toBe(original)
    })
  })
})
