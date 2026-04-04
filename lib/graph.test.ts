import { describe, it, expect } from 'vitest'
import {
  mergeExtraction,
  emptyGraph,
  buildGraphBriefing,
  findCompletenessGaps,
  applyGraphPatch,
  normalizeGraph,
  findEntryGaps,
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
      expect(graph.places).toEqual({})
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
        people: [{ name: 'Mom', relationship: 'sibling' }],
      })
      expect(graph.people.Mom.relationship).toBe('sibling')

      // Try to change it
      graph = mergeExtraction(graph, {
        people: [{ name: 'Mom', relationship: 'friend' }],
      })
      // Relationship is updated
      expect(graph.people.Mom.relationship).toBe('friend')
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

    it('deduplicates places and merges metadata', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        places: [
          { name: 'Portland', city: 'Portland', state: 'Oregon' },
          { name: 'Seattle' },
          { name: 'Portland' },
        ],
      })
      expect(Object.keys(graph.places)).toEqual(['Portland', 'Seattle'])
      expect(graph.places['Portland'].city).toBe('Portland')
      expect(graph.places['Portland'].state).toBe('Oregon')

      graph = mergeExtraction(graph, {
        places: [{ name: 'Seattle', city: 'Seattle', state: 'Washington' }, { name: 'Vancouver' }],
      })
      expect(Object.keys(graph.places)).toEqual(['Portland', 'Seattle', 'Vancouver'])
      expect(graph.places['Seattle'].city).toBe('Seattle')
    })

    it('does not overwrite existing place metadata', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        places: [{ name: 'Dallas', city: 'Dallas', state: 'Texas' }],
      })
      graph = mergeExtraction(graph, {
        places: [{ name: 'Dallas', city: 'Wrong City', state: 'Wrong State' }],
      })
      expect(graph.places['Dallas'].city).toBe('Dallas')
      expect(graph.places['Dallas'].state).toBe('Texas')
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
        events: [{ name: 'family reunion' }, { name: 'trip to Europe' }],
      })
      expect(graph.interests).toEqual(['gardening', 'cooking'])
      expect(graph.events.map(e => e.name)).toEqual(['family reunion', 'trip to Europe'])
    })

    it('merges event date without overwriting existing date', () => {
      let graph = emptyGraph()
      graph = mergeExtraction(graph, {
        events: [{ name: 'Alaska cruise', date: { year: 2019, era: 'parenthood' } }],
      })
      expect(graph.events[0].date?.year).toBe(2019)
      // Second extraction without date should not overwrite
      graph = mergeExtraction(graph, {
        events: [{ name: 'Alaska cruise' }],
      })
      expect(graph.events).toHaveLength(1)
      expect(graph.events[0].date?.year).toBe(2019)
    })

    it('handles full realistic extraction', () => {
      let graph = emptyGraph('Margaret')
      const extraction: ExtractionResult = {
        people: [
          { name: 'Husband', relationship: 'spouse', sentiment: 'warm', new_facts: ['retired last year'] },
          { name: 'Son', relationship: 'child', new_threads: ['his marriage struggles'] },
        ],
        places: [{ name: 'Utah', state: 'Utah', country: 'US' }, { name: 'California', state: 'California', country: 'US' }],
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
      expect(graph.places['Utah']).toBeDefined()
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
      graph.places = { 'Boston': { name: 'Boston', city: 'Boston', state: 'Massachusetts' }, 'New York': { name: 'New York' } }
      graph.themes = ['resilience']

      const briefing = buildGraphBriefing(graph)
      expect(briefing).toContain('John')
      expect(briefing).toContain('Mom')
      expect(briefing).toContain('nurse')
      expect(briefing).toContain('Boston')
      expect(briefing).toContain('resilience')
    })
  })

  describe('normalizeGraph', () => {
    it('converts string places array to Record', () => {
      const raw = { ...emptyGraph(), places: ['Portland', 'Seattle'] }
      const normalized = normalizeGraph(raw)
      expect(normalized.places).toEqual({
        Portland: { name: 'Portland' },
        Seattle: { name: 'Seattle' },
      })
    })

    it('preserves already-normalized places Record unchanged', () => {
      const graph = emptyGraph()
      graph.places = { Dallas: { name: 'Dallas', city: 'Dallas', state: 'Texas' } }
      const normalized = normalizeGraph(graph)
      expect(normalized.places['Dallas'].city).toBe('Dallas')
    })

    it('converts string events to EventNode array', () => {
      const raw = { ...emptyGraph(), events: ['wedding', 'trip to Europe'] as any }
      const normalized = normalizeGraph(raw)
      expect(normalized.events).toEqual([{ name: 'wedding' }, { name: 'trip to Europe' }])
    })

    it('migrates legacy EventNode year/era to structured date', () => {
      const raw = {
        ...emptyGraph(),
        events: [{ name: 'Alaska cruise', year: '2019', era: 'parenthood', place: 'Alaska' }] as any,
      }
      const normalized = normalizeGraph(raw)
      expect(normalized.events[0]).toEqual({
        name: 'Alaska cruise',
        date: { year: 2019, era: 'parenthood' },
        place: 'Alaska',
      })
    })

    it('preserves already-normalized EventNode unchanged', () => {
      const graph = emptyGraph()
      graph.events = [{ name: 'graduation', date: { year: 1995 } }]
      const normalized = normalizeGraph(graph)
      expect(normalized.events[0].date?.year).toBe(1995)
    })

    it('initializes missing fields on sparse graph', () => {
      const normalized = normalizeGraph({ people: {}, total_entries: 5 })
      expect(normalized.places).toEqual({})
      expect(normalized.events).toEqual([])
      expect(normalized.open_threads).toEqual([])
      expect(normalized.faith).toEqual({})
    })

    it('is idempotent — running twice produces same result', () => {
      const raw = { ...emptyGraph(), places: ['Portland'], events: ['wedding'] as any }
      const once = normalizeGraph(raw)
      const twice = normalizeGraph(once)
      expect(twice.places).toEqual(once.places)
      expect(twice.events).toEqual(once.events)
    })
  })

  describe('findCompletenessGaps', () => {
    it('returns no gaps for empty graph', () => {
      const graph = emptyGraph()
      expect(findCompletenessGaps(graph)).toEqual([])
    })

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

    it('person with relationship set generates no gap', () => {
      const graph = emptyGraph()
      graph.people.Dad = { mentions: 3, facts: [], unexplored: [], relationship: 'father' }
      expect(findCompletenessGaps(graph).filter(g => g.entity_type === 'person')).toHaveLength(0)
    })

    it('events without date generate date gap', () => {
      const graph = emptyGraph()
      graph.events = [{ name: 'wedding' }, { name: 'trip to Europe' }]

      const gaps = findCompletenessGaps(graph)
      expect(gaps.filter(g => g.entity_type === 'event' && g.field === 'date')).toHaveLength(2)
    })

    it('EventNode with date generates no date gap', () => {
      const graph = emptyGraph()
      graph.events = [{ name: 'Alaska cruise', date: { year: 2019 }, place: 'Alaska' }]

      const gaps = findCompletenessGaps(graph)
      expect(gaps.filter(g => g.entity_type === 'event' && g.field === 'date')).toHaveLength(0)
    })

    it('EventNode with date but no place generates place gap', () => {
      const graph = emptyGraph()
      graph.events = [{ name: 'graduation', date: { year: 1995 } }]

      const gaps = findCompletenessGaps(graph)
      const eventGaps = gaps.filter(g => g.entity_type === 'event')
      expect(eventGaps).toHaveLength(1)
      expect(eventGaps[0].field).toBe('place')
    })

    it('places without city generate city gap', () => {
      const graph = emptyGraph()
      graph.places = {
        'the lake house': { name: 'the lake house' },
        'Dallas': { name: 'Dallas', city: 'Dallas' },
      }
      const gaps = findCompletenessGaps(graph)
      const placeGaps = gaps.filter(g => g.entity_type === 'place')
      expect(placeGaps).toHaveLength(1)
      expect(placeGaps[0].entity_key).toBe('the lake house')
    })

    it('mixed graph returns only gapped entities', () => {
      const graph = emptyGraph()
      graph.people.Mom = { mentions: 2, facts: [], unexplored: [], relationship: 'mother' }
      graph.people.Stranger = { mentions: 1, facts: [], unexplored: [] }
      graph.events = [{ name: 'road trip' }]

      const gaps = findCompletenessGaps(graph)
      expect(gaps.find(g => g.entity_key === 'Mom')).toBeUndefined()
      expect(gaps.filter(g => g.entity_key === 'Stranger')).toHaveLength(1)
      expect(gaps.filter(g => g.entity_type === 'event')).toHaveLength(2) // date + place
    })
  })

  describe('findEntryGaps', () => {
    it('returns only an era gap when extraction is otherwise empty', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({}, graph)
      expect(gaps).toHaveLength(1)
      expect(gaps[0].entity_type).toBe('era')
    })

    it('era gap when extraction.era is null', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ era: undefined }, graph)
      expect(gaps.find(g => g.entity_type === 'era')).toBeDefined()
    })

    it('no era gap when extraction.era is set', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_type === 'era')).toBeUndefined()
    })

    it('person gap when not in graph', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ people: [{ name: 'Brandon' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'Brandon' && g.field === 'relationship')).toBeDefined()
    })

    it('no person gap when relationship already known', () => {
      const graph = emptyGraph()
      graph.people['Brandon'] = { mentions: 1, facts: [], unexplored: [], relationship: 'brother' }
      const gaps = findEntryGaps({ people: [{ name: 'Brandon' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'Brandon')).toBeUndefined()
    })

    it('no relationship gap for person whose name is a relationship term (lowercase)', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ people: [{ name: 'mom' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'mom' && g.field === 'relationship')).toBeUndefined()
    })

    it('no relationship gap for person whose name is a relationship term (mixed case)', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ people: [{ name: 'Dad' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.field === 'relationship')).toBeUndefined()
    })

    it('still produces a relationship gap for a non-relationship name', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ people: [{ name: 'Sarah' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'Sarah' && g.field === 'relationship')).toBeDefined()
    })

    it('event date gap when event not in graph', () => {
      const graph = emptyGraph()
      const gaps = findEntryGaps({ events: [{ name: 'family reunion' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'family reunion' && g.field === 'date')).toBeDefined()
    })

    it('no event gap when event already has date in graph', () => {
      const graph = emptyGraph()
      graph.events = [{ name: 'family reunion', date: { year: 1998 } }]
      const gaps = findEntryGaps({ events: [{ name: 'family reunion' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'family reunion')).toBeUndefined()
    })

    it('place gap when place has no city in graph', () => {
      const graph = emptyGraph()
      graph.places['Pottsboro'] = { name: 'Pottsboro' }  // no city
      const gaps = findEntryGaps({ places: [{ name: 'Pottsboro' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'Pottsboro' && g.field === 'city')).toBeDefined()
    })

    it('no place gap when place has city in graph', () => {
      const graph = emptyGraph()
      graph.places['Dallas'] = { name: 'Dallas', city: 'Dallas', state: 'Texas' }
      const gaps = findEntryGaps({ places: [{ name: 'Dallas' }], era: 'childhood' }, graph)
      expect(gaps.find(g => g.entity_key === 'Dallas')).toBeUndefined()
    })

    it('mixed extraction returns gaps only for unknowns', () => {
      const graph = emptyGraph()
      graph.people['Mom'] = { mentions: 2, facts: [], unexplored: [], relationship: 'mother' }
      graph.people['Brandon'] = { mentions: 1, facts: [], unexplored: [] }  // no relationship
      graph.events = [{ name: 'Alaska cruise', date: { year: 2022 } }]
      graph.places['Dallas'] = { name: 'Dallas', city: 'Dallas' }

      const gaps = findEntryGaps({
        people: [{ name: 'Mom' }, { name: 'Brandon' }],
        events: [{ name: 'Alaska cruise' }, { name: 'new event' }],
        places: [{ name: 'Dallas' }, { name: 'the lake house' }],
        era: 'parenthood',
      }, graph)

      expect(gaps.find(g => g.entity_key === 'Mom')).toBeUndefined()
      expect(gaps.find(g => g.entity_key === 'Brandon')).toBeDefined()
      expect(gaps.find(g => g.entity_key === 'Alaska cruise')).toBeUndefined()
      expect(gaps.find(g => g.entity_key === 'new event')).toBeDefined()
      expect(gaps.find(g => g.entity_key === 'Dallas')).toBeUndefined()
      expect(gaps.find(g => g.entity_key === 'the lake house')).toBeDefined()
      expect(gaps.find(g => g.entity_type === 'era')).toBeUndefined()
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

    it('patches event date with year from answer', () => {
      let graph = emptyGraph()
      graph.events = [{ name: 'graduation' }]

      graph = applyGraphPatch(graph, 'event', 'graduation', 'date', 'It was in 1995')
      expect(graph.events[0].date?.year).toBe(1995)
    })

    it('patches event date with era when no year in answer', () => {
      let graph = emptyGraph()
      graph.events = [{ name: 'road trip' }]

      graph = applyGraphPatch(graph, 'event', 'road trip', 'date', 'childhood')
      expect(graph.events[0].date?.era).toBe('childhood')
    })

    it('patches event place', () => {
      let graph = emptyGraph()
      graph.events = [{ name: 'summer camp' }]

      graph = applyGraphPatch(graph, 'event', 'summer camp', 'place', 'Bear Lake')
      expect(graph.events[0].place).toBe('Bear Lake')
    })

    it('patches place city', () => {
      let graph = emptyGraph()
      graph.places['the lake house'] = { name: 'the lake house' }

      graph = applyGraphPatch(graph, 'place', 'the lake house', 'city', 'Pottsboro')
      expect(graph.places['the lake house'].city).toBe('Pottsboro')
    })

    it('creates place node if not exists when patching', () => {
      let graph = emptyGraph()

      graph = applyGraphPatch(graph, 'place', 'Grandma house', 'city', 'Gainesville')
      expect(graph.places['Grandma house'].city).toBe('Gainesville')
    })

    it('patches era into graph.eras', () => {
      let graph = emptyGraph()

      graph = applyGraphPatch(graph, 'era', 'entry', 'era', 'childhood')
      expect(graph.eras['childhood']).toBeDefined()
    })
  })
})
