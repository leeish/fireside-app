import type { NarrativeGraph } from '@/lib/graph'

// ─── Question types ───────────────────────────────────────────
export type QType =
  | 'depth' | 'origin' | 'sensory' | 'relationship' | 'era'
  | 'milestone' | 'faith_milestone' | 'faith_texture' | 'lightness'

export interface ScoredThread {
  threadId: string
  questionType: QType
  score: number
  description: string  // passed to LLM as context
}

export const KNOWN_ERAS = ['childhood', 'youth', 'mission', 'marriage', 'parenthood', 'career']

// ─── Decision engine (pure logic — no LLM) ───────────────────
// Returns top 5 candidates. Claude makes the final selection.
// Enforces domain diversity: at most one candidate per domain category,
// so no single category (e.g. open_thread) can monopolize all 5 slots.
export function selectTopThreads(graph: NarrativeGraph): ScoredThread[] {
  const threads: ScoredThread[] = []
  const lastWeight = graph.last_entry_weight ?? 'medium'
  const isLDS = graph.faith?.tradition === 'lds'
  const missionConfirmed = graph.faith?.prompt_readiness?.mission === 'confirmed'

  // Score uncaptured / thin eras
  for (const era of KNOWN_ERAS) {
    const eraData = graph.eras[era]
    let score = 0
    if (!eraData || eraData.entries === 0) score = 20
    else if (eraData.richness === 'low') score = 10
    else if (eraData.richness === 'medium') score = 5

    if (era === 'mission' && missionConfirmed) score += 15
    if (lastWeight === 'heavy') score -= 5  // deprioritize more digging after heavy entry

    if (score > 0) {
      threads.push({
        threadId: `era:${era}`,
        questionType: 'era',
        score,
        description: `Open the ${era} chapter`,
      })
    }
  }

  // Score people
  for (const [name, node] of Object.entries(graph.people ?? {})) {
    let score = 0
    if (node.mentions < 2) score += 15
    if (node.unexplored.length > 0) score += 10
    if (node.sentiment === 'complicated') score += 8
    if (lastWeight === 'heavy' && node.sentiment === 'warm') score += 12

    const qType: QType = node.unexplored.length > 0 ? 'depth' : 'relationship'
    const description = node.unexplored.length > 0
      ? `Explore unexplored thread about ${name}: ${node.unexplored[0]}`
      : `Learn more about ${name} (${node.relationship ?? 'person in their life'})`

    threads.push({ threadId: `person:${name}`, questionType: qType, score, description })
  }

  // Lightness after heavy entry — scored high enough to reliably win
  if (lastWeight === 'heavy') {
    threads.push({
      threadId: 'lightness',
      questionType: 'lightness',
      score: 40,
      description: 'Shift to something warm or funny after a heavy entry',
    })
  }

  // Open threads — topics the person mentioned in passing that are worth returning to
  for (const thread of graph.open_threads ?? []) {
    threads.push({
      threadId: `open_thread:${thread.slice(0, 40)}`,
      questionType: 'depth',
      score: 18,
      description: `Specific topic mentioned in passing, worth returning to: "${thread}"`,
    })
  }

  // Themes — ask an origin question to trace where a pattern began
  const HEAVY_THEMES = ['loss', 'grief', 'death', 'trauma', 'abuse', 'addiction']
  for (const theme of graph.themes ?? []) {
    const isHeavy = HEAVY_THEMES.some(h => theme.toLowerCase().includes(h))
    const score = isHeavy
      ? (lastWeight === 'heavy' ? 10 : 20)  // deprioritize heavy themes after a heavy entry
      : 14
    threads.push({
      threadId: `theme:${theme}`,
      questionType: 'origin',
      score,
      description: `Theme present in their story: "${theme}" — ask an origin question to find where this began`,
    })
  }

  // Places — ask a sensory question to bring a place to life
  for (const place of graph.places ?? []) {
    threads.push({
      threadId: `place:${place.slice(0, 40)}`,
      questionType: 'sensory',
      score: 12,
      description: `Place they've mentioned: "${place}" — ask for a sensory memory of this place`,
    })
  }

  // Events — specific named experiences worth exploring in depth
  for (const event of graph.events ?? []) {
    threads.push({
      threadId: `event:${event.slice(0, 40)}`,
      questionType: 'depth',
      score: 16,
      description: `Specific experience they've mentioned: "${event}" — ask for a memory or moment from this event`,
    })
  }

  // Interests — go deeper on a hobby or passion they've mentioned
  for (const interest of graph.interests ?? []) {
    threads.push({
      threadId: `interest:${interest.slice(0, 40)}`,
      questionType: 'depth',
      score: 15,
      description: `Interest or passion they've mentioned: "${interest}" — explore what it means to them or where it started`,
    })
  }

  // Faith texture if faith present but unexplored
  if (graph.faith?.tier && graph.faith.tier >= 2 && (graph.faith.spiritual_moments?.length ?? 0) < 2) {
    threads.push({
      threadId: 'faith_texture',
      questionType: 'faith_texture',
      score: 18,
      description: 'Explore the lived experience of their faith',
    })
  }

  // LDS faith milestones not yet captured
  if (isLDS && graph.faith?.milestones?.lds) {
    for (const [milestone, data] of Object.entries(graph.faith.milestones.lds as Record<string, Record<string, unknown>>)) {
      if (!data.captured) {
        threads.push({
          threadId: `faith_milestone:${milestone}`,
          questionType: 'faith_milestone',
          score: 22,
          description: `LDS milestone not yet captured: ${milestone}`,
        })
      }
    }
  }

  // Early-exploration mode — shapes the candidate pool
  // Person threads suppressed so they don't surface as options before entry 15
  if (graph.total_entries < 15) {
    for (const t of threads) {
      t.score *= t.threadId.startsWith('person:') ? 0.5 : 1.5
    }
  }

  // Small jitter — only for tie-breaking within the candidate pool
  for (const t of threads) {
    t.score += Math.random() * 3
  }

  // Default if graph is empty
  if (threads.length === 0) {
    return [{
      threadId: 'era:childhood',
      questionType: 'era',
      score: 10,
      description: 'Open the childhood chapter',
    }]
  }

  threads.sort((a, b) => b.score - a.score)

  // Domain-diversity: take one representative per domain, then top 5 by score.
  // Prevents any single category (e.g. open_thread) from filling all 5 slots
  // when many items of the same type exist.
  const byDomain = new Map<string, ScoredThread>()
  for (const t of threads) {
    const domain = t.threadId.split(':')[0]
    if (!byDomain.has(domain)) byDomain.set(domain, t)
  }
  const diverse = Array.from(byDomain.values()).sort((a, b) => b.score - a.score)
  return diverse.slice(0, 5)
}
