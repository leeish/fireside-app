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
  places: string[]
  eras: Record<string, EraNode>
  themes: string[]
  deflections: string[]
  emotional_pattern?: string
  last_entry_weight?: string
  total_entries: number
  faith: FaithNode
  milestone_calendar: Record<string, string>
  rolling_summary?: string
}

export interface ExtractionResult {
  people?: Array<{
    name: string
    relationship?: string
    sentiment?: string
    new_facts?: string[]
    new_threads?: string[]
  }>
  places?: string[]
  era?: string
  emotional_weight?: string
  themes?: string[]
  deflections?: string[]
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

export function mergeExtraction(graph: NarrativeGraph, extraction: ExtractionResult): NarrativeGraph {
  // Deep clone — never mutate in place
  const g: NarrativeGraph = JSON.parse(JSON.stringify(graph))

  // People
  for (const person of extraction.people ?? []) {
    if (!g.people[person.name]) {
      g.people[person.name] = { mentions: 0, facts: [], unexplored: [] }
    }
    const node = g.people[person.name]
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

  // Places
  for (const place of extraction.places ?? []) {
    if (!g.places.includes(place)) g.places.push(place)
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
  }

  // Append one-line summary to entry log (kept in full — synthesis reads all of them)
  if (extraction.one_line_summary) {
    const lines = (g.rolling_summary ?? '').split('\n').filter(Boolean)
    lines.push(extraction.one_line_summary)
    g.rolling_summary = lines.join('\n')
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

  if (graph.places?.length) {
    sections.push(`Places mentioned: ${graph.places.join(', ')}`)
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

  if (graph.rolling_summary) {
    sections.push(`Entry log (one line per entry, chronological):\n${graph.rolling_summary}`)
  }

  return sections.join('\n\n')
}

export function emptyGraph(displayName?: string): NarrativeGraph {
  return {
    display_name: displayName,
    people: {},
    places: [],
    eras: {},
    themes: [],
    deflections: [],
    total_entries: 0,
    faith: {},
    milestone_calendar: {},
    rolling_summary: '',
  }
}
