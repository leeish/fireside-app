// Narrative graph — the AI's persistent model of a person.
// Stored in narratives.graph (JSONB). Updated via mergeExtraction() after every entry.

export type EraRichness = 'none' | 'low' | 'medium' | 'high'

export interface PersonNode {
  relationship?: string
  sentiment?: string
  mentions: number
  facts: string[]
  unexplored: string[]
}

export interface EventDate {
  era?: string
  year?: number
  month?: number
  day?: number
}

export interface EventNode {
  name: string
  date?: EventDate
  place?: string  // key into graph.places Record
}

export interface PlaceNode {
  name: string
  country?: string
  state?: string
  city?: string
  address?: string
}

export interface EraNode {
  richness: EraRichness
  entries: number
}

export interface FaithNode {
  role?: string
  tradition?: string
  confidence?: string
  detection_method?: string
  tier?: number
  milestones?: Record<string, Record<string, unknown>>
  spiritual_moments?: string[]
  sentiment?: string
  prompt_readiness?: Record<string, string>
}

export interface NarrativeGraph {
  display_name?: string
  people: Record<string, PersonNode>
  places: Record<string, PlaceNode>
  eras: Record<string, EraNode>
  themes: string[]
  deflections: string[]
  interests: string[]      // hobbies, passions, activities they mention enjoying
  events: EventNode[]      // specific named experiences worth exploring (trips, family events, milestones)
  open_threads: string[]   // topics mentioned in passing worth returning to (accumulated from extractions)
  emotional_pattern?: string
  last_entry_weight?: string
  total_entries: number
  faith: FaithNode
  milestone_calendar: Record<string, string>
  entry_log?: string       // append-only, one line per entry, chronological — never overwritten
}

export interface ExtractionResult {
  people?: Array<{
    name: string
    relationship?: string
    sentiment?: string
    new_facts?: string[]
    new_threads?: string[]
  }>
  places?: Array<{ name: string; city?: string; state?: string; country?: string; address?: string }>
  era?: string
  emotional_weight?: string
  themes?: string[]
  deflections?: string[]
  interests?: string[]
  events?: Array<{ name: string; date?: { year?: number; month?: number; day?: number; era?: string } }>
  faith_signals?: {
    tradition_signals?: string[]
    milestones_mentioned?: string[]
    spiritual_moments?: string[]
  }
  new_threads_opened?: string[]
  one_line_summary?: string
}

// LDS language signals for faith detection
const LDS_HIGH_SIGNALS = [
  'ward', 'stake', 'sacrament', 'mtc', 'endowment', 'sealing',
  'relief society', 'familysearch', 'eternal families', 'book of mormon',
  'temple recommend', 'general conference',
]
const LDS_MEDIUM_SIGNALS = [
  'mission', 'baptism at eight', 'seminary', 'primary', 'calling', 'covenant',
]

const RICHNESS_ORDER: EraRichness[] = ['none', 'low', 'medium', 'high']

function upgradeRichness(current: EraRichness): EraRichness {
  const idx = RICHNESS_ORDER.indexOf(current)
  return RICHNESS_ORDER[Math.min(idx + 1, RICHNESS_ORDER.length - 1)]
}

function detectFaithTradition(signals: string[]): 'lds' | null {
  const lower = signals.map(s => s.toLowerCase())
  const highCount = lower.filter(s => LDS_HIGH_SIGNALS.some(ls => s.includes(ls))).length
  const medCount = lower.filter(s => LDS_MEDIUM_SIGNALS.some(ls => s.includes(ls))).length
  if (highCount >= 2 || medCount >= 4) return 'lds'
  return null
}

// Normalizes a raw graph object (potentially old format) to the current NarrativeGraph shape.
// Call this immediately after JSON.parse(decrypt(...)) on any stored graph.
// Idempotent — safe to call on already-normalized graphs.
export function normalizeGraph(raw: any): NarrativeGraph {
  const g: any = { ...raw }

  // Migrate places: string[] → Record<string, PlaceNode>
  if (Array.isArray(g.places)) {
    const placesRecord: Record<string, PlaceNode> = {}
    for (const p of g.places) {
      if (typeof p === 'string') {
        placesRecord[p] = { name: p }
      } else if (p && typeof p === 'object' && p.name) {
        placesRecord[p.name] = p as PlaceNode
      }
    }
    g.places = placesRecord
  } else if (!g.places || typeof g.places !== 'object') {
    g.places = {}
  }

  // Migrate events: (string | LegacyEventNode)[] → EventNode[]
  if (!Array.isArray(g.events)) {
    g.events = []
  } else {
    g.events = (g.events as any[]).map((e: any): EventNode | null => {
      if (typeof e === 'string') return { name: e }
      if (!e || typeof e !== 'object' || !e.name) return null

      const eventNode: EventNode = { name: e.name }
      if (e.place) eventNode.place = e.place

      if (e.date) {
        eventNode.date = e.date  // already new format
      } else if (e.year !== undefined || e.era !== undefined) {
        // Legacy: migrate year/era top-level fields into date
        eventNode.date = {}
        if (e.year !== undefined) {
          const yearNum = typeof e.year === 'number' ? e.year : parseInt(String(e.year), 10)
          if (!isNaN(yearNum)) eventNode.date.year = yearNum
        }
        if (e.era) eventNode.date.era = e.era
      }
      return eventNode
    }).filter((e: EventNode | null): e is EventNode => e !== null)
  }

  // Ensure required arrays and objects exist
  if (!g.open_threads) g.open_threads = []
  if (!g.interests) g.interests = []
  if (!g.themes) g.themes = []
  if (!g.deflections) g.deflections = []
  if (!g.people) g.people = {}
  if (!g.eras) g.eras = {}
  if (!g.faith) g.faith = {}
  if (!g.milestone_calendar) g.milestone_calendar = {}
  if (g.total_entries === undefined) g.total_entries = 0

  return g as NarrativeGraph
}

export function mergeExtraction(graph: NarrativeGraph, extraction: ExtractionResult): NarrativeGraph {
  // Deep clone — never mutate in place
  const g: NarrativeGraph = JSON.parse(JSON.stringify(graph))

  // System placeholders to exclude from the graph
  const SYSTEM_PLACEHOLDERS = ['Person', 'Biographer', 'User', 'Subject', 'Self']

  // People
  for (const person of extraction.people ?? []) {
    // Normalize to title case to avoid "mom"/"Mom" duplicate nodes
    const normalizedName = person.name
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')

    // Skip system placeholders
    if (SYSTEM_PLACEHOLDERS.includes(normalizedName)) continue

    if (!g.people[normalizedName]) {
      g.people[normalizedName] = { mentions: 0, facts: [], unexplored: [] }
    }
    const node = g.people[normalizedName]
    node.mentions += 1
    if (person.relationship) node.relationship = person.relationship
    if (person.sentiment) node.sentiment = person.sentiment
    for (const f of person.new_facts ?? []) {
      if (!node.facts.includes(f)) node.facts.push(f)
    }
    for (const t of person.new_threads ?? []) {
      if (!node.unexplored.includes(t)) node.unexplored.push(t)
    }
  }

  // Places — merge structured PlaceNode into Record, backward-compat with raw strings
  for (const rawPlace of (extraction.places ?? []) as any[]) {
    const place: PlaceNode = typeof rawPlace === 'string'
      ? { name: rawPlace }
      : { name: rawPlace.name, city: rawPlace.city, state: rawPlace.state, country: rawPlace.country, address: rawPlace.address }

    const key = place.name
    if (!g.places[key]) {
      g.places[key] = { name: key }
    }
    // Update fields non-destructively (don't overwrite existing data)
    if (place.city && !g.places[key].city) g.places[key].city = place.city
    if (place.state && !g.places[key].state) g.places[key].state = place.state
    if (place.country && !g.places[key].country) g.places[key].country = place.country
    if (place.address && !g.places[key].address) g.places[key].address = place.address
  }

  // Era
  if (extraction.era) {
    if (!g.eras[extraction.era]) {
      g.eras[extraction.era] = { richness: 'none', entries: 0 }
    }
    g.eras[extraction.era].entries += 1
    g.eras[extraction.era].richness = upgradeRichness(g.eras[extraction.era].richness)
  }

  // Themes
  for (const theme of extraction.themes ?? []) {
    if (!g.themes.includes(theme)) g.themes.push(theme)
  }

  // Deflections
  for (const d of extraction.deflections ?? []) {
    if (!g.deflections.includes(d)) g.deflections.push(d)
  }

  // Interests
  if (!g.interests) g.interests = []
  for (const interest of extraction.interests ?? []) {
    if (!g.interests.includes(interest)) g.interests.push(interest)
  }

  // Events — merge structured EventNode, backward-compat with raw strings
  if (!g.events) g.events = []
  for (const rawEvent of (extraction.events ?? []) as any[]) {
    const event: EventNode = typeof rawEvent === 'string'
      ? { name: rawEvent }
      : { name: rawEvent.name, date: rawEvent.date }

    const existing = g.events.find(e => e.name === event.name)
    if (!existing) {
      g.events.push(event)
    } else if (event.date && !existing.date) {
      existing.date = event.date
    }
  }

  // Open threads — topics mentioned in passing worth returning to.
  // Accumulated across entries; capped at 20 to prevent unbounded growth.
  if (!g.open_threads) g.open_threads = []
  for (const thread of extraction.new_threads_opened ?? []) {
    if (!g.open_threads.includes(thread)) g.open_threads.push(thread)
  }
  if (g.open_threads.length > 20) g.open_threads = g.open_threads.slice(-20)

  // Emotional weight
  if (extraction.emotional_weight) {
    g.last_entry_weight = extraction.emotional_weight
  }

  // Faith signals
  const fs = extraction.faith_signals
  if (fs) {
    if (!g.faith) g.faith = {}
    if (!g.faith.tradition && fs.tradition_signals?.length) {
      const detected = detectFaithTradition(fs.tradition_signals)
      if (detected) {
        g.faith.tradition = detected
        g.faith.confidence = 'inferred'
        g.faith.tier = 3
        g.faith.detection_method = 'language'
      }
    }
    if (!g.faith.spiritual_moments) g.faith.spiritual_moments = []
    for (const m of fs.spiritual_moments ?? []) {
      if (!g.faith.spiritual_moments.includes(m)) g.faith.spiritual_moments.push(m)
    }

    // Infer mission participation from the user's own words.
    // Only set when milestones_mentioned explicitly includes mission — never assumed from LDS detection alone.
    if (fs.milestones_mentioned?.some(m => m.toLowerCase().includes('mission'))) {
      if (!g.faith.prompt_readiness) g.faith.prompt_readiness = {}
      if (g.faith.prompt_readiness.mission !== 'confirmed') {
        g.faith.prompt_readiness.mission = 'confirmed'
      }
    }
  }

  // Append to entry_log — permanent chronological record, never overwritten
  if (extraction.one_line_summary) {
    const lines = (g.entry_log ?? '').split('\n').filter(Boolean)
    lines.push(extraction.one_line_summary)
    g.entry_log = lines.join('\n')
  }

  g.total_entries += 1

  return g
}

// Builds a structured briefing of the graph for the synthesis LLM.
// Reads everything — not just the rolling summary.
export function buildGraphBriefing(graph: NarrativeGraph): string {
  const sections: string[] = []

  if (graph.display_name) {
    sections.push(`Person: ${graph.display_name}`)
  }

  const people = Object.entries(graph.people ?? {})
  if (people.length > 0) {
    const lines = people.map(([name, node]) => {
      const parts = [`${name} (${node.relationship ?? 'unknown relationship'}, mentioned ${node.mentions}x`]
      if (node.sentiment) parts[0] += `, ${node.sentiment}`
      parts[0] += ')'
      if (node.facts.length) parts.push(`  facts: ${node.facts.join('; ')}`)
      if (node.unexplored.length) parts.push(`  unexplored: ${node.unexplored.join('; ')}`)
      return parts.join('\n')
    })
    sections.push(`People:\n${lines.join('\n')}`)
  }

  const placesEntries = Object.values(graph.places ?? {})
  if (placesEntries.length > 0) {
    const placeStrings = placesEntries.map(p => {
      const parts: string[] = [p.name]
      if (p.city) parts.push(p.city)
      if (p.state) parts.push(p.state)
      if (p.country) parts.push(p.country)
      return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0]
    })
    sections.push(`Places mentioned: ${placeStrings.join('; ')}`)
  }

  const eras = Object.entries(graph.eras ?? {})
  if (eras.length > 0) {
    const lines = eras.map(([era, node]) => `${era}: ${node.entries} entries, richness=${node.richness}`)
    sections.push(`Eras:\n${lines.join('\n')}`)
  }

  if (graph.themes?.length) {
    sections.push(`Themes: ${graph.themes.join(', ')}`)
  }

  if (graph.deflections?.length) {
    sections.push(`Deflections (topics started, then avoided):\n${graph.deflections.map(d => `- ${d}`).join('\n')}`)
  }

  const faith = graph.faith
  if (faith && Object.keys(faith).length > 0) {
    const parts = []
    if (faith.tradition) parts.push(`tradition: ${faith.tradition} (confidence: ${faith.confidence})`)
    if (faith.spiritual_moments?.length) parts.push(`spiritual moments: ${faith.spiritual_moments.join('; ')}`)
    if (parts.length) sections.push(`Faith: ${parts.join(', ')}`)
  }

  if (graph.entry_log) {
    sections.push(`Entry log (one line per entry, chronological — permanent record):\n${graph.entry_log}`)
  }

  return sections.join('\n\n')
}

// Identifies gaps in biographical data — missing relationships, dates, city-level place info.
// Returns array of { entity_type, entity_key, field, question } objects.
export interface CompletenessGap {
  entity_type: 'person' | 'event' | 'place' | 'era'
  entity_key: string
  field: string
  question: string
}

export function findCompletenessGaps(graph: NarrativeGraph): CompletenessGap[] {
  const gaps: CompletenessGap[] = []

  // People missing relationship field
  for (const [name, node] of Object.entries(graph.people ?? {})) {
    if (!node.relationship) {
      gaps.push({
        entity_type: 'person',
        entity_key: name,
        field: 'relationship',
        question: `Earlier you mentioned someone named ${name}. What's your relationship to ${name}?`,
      })
    }
  }

  // Events missing date or place
  for (const event of graph.events ?? []) {
    if (!event.date) {
      gaps.push({
        entity_type: 'event',
        entity_key: event.name,
        field: 'date',
        question: `You mentioned "${event.name}" — roughly when did that happen?`,
      })
    }

    if (!event.place) {
      gaps.push({
        entity_type: 'event',
        entity_key: event.name,
        field: 'place',
        question: `Where did "${event.name}" take place?`,
      })
    }
  }

  // Places missing city-level detail
  for (const [name, node] of Object.entries(graph.places ?? {})) {
    if (!node.city) {
      gaps.push({
        entity_type: 'place',
        entity_key: name,
        field: 'city',
        question: `Where exactly is ${name} — what city?`,
      })
    }
  }

  return gaps
}

// Names that are themselves relationship descriptors — no need to ask "who is X to you?"
const RELATIONSHIP_TERMS = new Set([
  'mom', 'mother', 'dad', 'father', 'brother', 'sister',
  'wife', 'husband', 'grandma', 'grandmother', 'grandpa', 'grandfather',
  'aunt', 'uncle', 'son', 'daughter', 'nephew', 'niece', 'cousin',
  'stepmom', 'stepdad', 'stepbrother', 'stepsister', 'stepson', 'stepdaughter',
])

// Finds entry-specific gaps: things mentioned in this entry that the master graph doesn't fully know.
// More targeted than findCompletenessGaps — scoped to what was mentioned in one conversation.
export function findEntryGaps(
  extraction: ExtractionResult,
  graph: NarrativeGraph
): CompletenessGap[] {
  const gaps: CompletenessGap[] = []

  // People mentioned in this entry without known relationship in master graph
  for (const person of extraction.people ?? []) {
    // Skip if the name itself encodes the relationship (mom, dad, brother, etc.)
    if (RELATIONSHIP_TERMS.has(person.name.toLowerCase())) continue
    if (!graph.people[person.name]?.relationship) {
      gaps.push({
        entity_type: 'person',
        entity_key: person.name,
        field: 'relationship',
        question: `Who is ${person.name} to you?`,
      })
    }
  }

  // Events mentioned without date context in master graph
  for (const rawEvent of (extraction.events ?? []) as any[]) {
    const eventName: string = typeof rawEvent === 'string' ? rawEvent : rawEvent.name
    const graphEvent = (graph.events ?? []).find(e => e.name === eventName)
    if (!graphEvent?.date) {
      gaps.push({
        entity_type: 'event',
        entity_key: eventName,
        field: 'date',
        question: `Roughly when did "${eventName}" happen?`,
      })
    }
  }

  // Places mentioned without city-level detail in master graph
  for (const rawPlace of (extraction.places ?? []) as any[]) {
    const placeName: string = typeof rawPlace === 'string' ? rawPlace : rawPlace.name
    if (!graph.places[placeName]?.city) {
      gaps.push({
        entity_type: 'place',
        entity_key: placeName,
        field: 'city',
        question: `Where exactly is ${placeName} — what city?`,
      })
    }
  }

  // Era unknown for this entry
  if (!extraction.era) {
    gaps.push({
      entity_type: 'era',
      entity_key: 'entry',
      field: 'era',
      question: `Which chapter of your life is this from — childhood, youth, early career, more recently?`,
    })
  }

  return gaps
}

// Apply clarification answer directly to graph without enrichment pipeline.
export function applyGraphPatch(
  graph: NarrativeGraph,
  entityType: 'person' | 'event' | 'place' | 'era',
  entityKey: string,
  field: string,
  answer: string
): NarrativeGraph {
  const g: NarrativeGraph = JSON.parse(JSON.stringify(graph))

  if (entityType === 'person') {
    if (!g.people[entityKey]) {
      g.people[entityKey] = { mentions: 0, facts: [], unexplored: [] }
    }
    if (field === 'relationship') {
      g.people[entityKey].relationship = answer
    }
  } else if (entityType === 'event') {
    let eventFound = false
    for (const evt of g.events ?? []) {
      if (evt.name === entityKey) {
        if (field === 'date') {
          if (!evt.date) evt.date = {}
          const yearMatch = answer.match(/\b(1[89]\d{2}|20[0-2]\d)\b/)
          if (yearMatch) evt.date.year = parseInt(yearMatch[0], 10)
          else evt.date.era = answer
        }
        if (field === 'place') evt.place = answer
        eventFound = true
        break
      }
    }
    if (!eventFound) {
      if (!g.events) g.events = []
      const newEvent: EventNode = { name: entityKey }
      if (field === 'date') {
        const yearMatch = answer.match(/\b(1[89]\d{2}|20[0-2]\d)\b/)
        newEvent.date = yearMatch ? { year: parseInt(yearMatch[0], 10) } : { era: answer }
      }
      if (field === 'place') newEvent.place = answer
      g.events.push(newEvent)
    }
  } else if (entityType === 'place') {
    if (!g.places) g.places = {}
    if (!g.places[entityKey]) g.places[entityKey] = { name: entityKey }
    if (field === 'city') g.places[entityKey].city = answer
    if (field === 'state') g.places[entityKey].state = answer
    if (field === 'country') g.places[entityKey].country = answer
    if (field === 'address') g.places[entityKey].address = answer
  } else if (entityType === 'era') {
    // Record the era in the graph's eras map
    if (!g.eras) g.eras = {}
    if (!g.eras[answer]) g.eras[answer] = { richness: 'low', entries: 0 }
  }

  return g
}

// Merges a duplicate person node into a canonical node.
// The duplicate is removed; the canonical accumulates all data.
// Pure function -- returns a new graph, never mutates in place.
export function mergePersonNodes(
  graph: NarrativeGraph,
  canonical: string,
  duplicate: string
): NarrativeGraph {
  const g: NarrativeGraph = JSON.parse(JSON.stringify(graph))

  const canonNode = g.people[canonical]
  const dupNode = g.people[duplicate]

  if (!canonNode || !dupNode) return g

  canonNode.mentions += dupNode.mentions

  for (const fact of dupNode.facts) {
    if (!canonNode.facts.includes(fact)) canonNode.facts.push(fact)
  }
  for (const thread of dupNode.unexplored) {
    if (!canonNode.unexplored.includes(thread)) canonNode.unexplored.push(thread)
  }

  if (!canonNode.relationship && dupNode.relationship) {
    canonNode.relationship = dupNode.relationship
  }
  if (!canonNode.sentiment && dupNode.sentiment) {
    canonNode.sentiment = dupNode.sentiment
  }

  delete g.people[duplicate]

  return g
}

export function emptyGraph(displayName?: string): NarrativeGraph {
  return {
    display_name: displayName,
    people: {},
    places: {},
    eras: {},
    themes: [],
    deflections: [],
    interests: [],
    events: [],
    open_threads: [],
    total_entries: 0,
    faith: {},
    milestone_calendar: {},
    entry_log: '',
  }
}
