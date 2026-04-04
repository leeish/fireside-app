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

// ─── Coverage helpers ─────────────────────────────────────────
function hasPersonWithRelationship(g: NarrativeGraph, ...terms: string[]): boolean {
  return Object.values(g.people ?? {}).some(p =>
    terms.some(t => p.relationship?.toLowerCase().includes(t))
  )
}

function hasEraEntries(g: NarrativeGraph, era: string, min = 1): boolean {
  return (g.eras[era]?.entries ?? 0) >= min
}

// ─── Life curriculum ─────────────────────────────────────────
// Universal life territories every biography should cover.
// Scored by gap: uncovered items compete for the single curriculum slot in the top-5.
// Coverage logic:
//   totalEntries < 30 → covered if thread_id appears in prompt history (1 prompt is enough)
//   totalEntries >= 30 → covered if in history OR graph shows richness signal for this domain

interface CurriculumItem {
  id: string
  description: string
  questionType: QType
  baseScore: number
  coveredIf: (g: NarrativeGraph, historyIds: string[], totalEntries: number) => boolean
}

const h = (id: string) => (historyIds: string[]) => historyIds.includes(id)

export const LIFE_CURRICULUM: CurriculumItem[] = [
  {
    id: 'curriculum:parents_as_people',
    description: 'Parents as full people before they were your parents -- who they were, where they came from',
    questionType: 'depth',
    baseScore: 26,
    coveredIf: (g, ids, n) => h('curriculum:parents_as_people')(ids) ||
      (n >= 30 && hasPersonWithRelationship(g, 'father', 'mother', 'dad', 'mom', 'parent', 'stepfather', 'stepmother')),
  },
  {
    id: 'curriculum:siblings',
    description: 'Sibling relationships growing up',
    questionType: 'relationship',
    baseScore: 24,
    coveredIf: (g, ids, n) => h('curriculum:siblings')(ids) ||
      (n >= 30 && hasPersonWithRelationship(g, 'brother', 'sister', 'sibling')),
  },
  {
    id: 'curriculum:extended_family',
    description: 'Grandparents, aunts, uncles -- the wider family circle',
    questionType: 'relationship',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:extended_family')(ids) ||
      (n >= 30 && hasPersonWithRelationship(g, 'grandparent', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin')),
  },
  {
    id: 'curriculum:childhood_home',
    description: 'The physical home(s) and neighborhood of childhood',
    questionType: 'sensory',
    baseScore: 24,
    coveredIf: (g, ids, n) => h('curriculum:childhood_home')(ids) ||
      (n >= 30 && hasEraEntries(g, 'childhood', 2)),
  },
  {
    id: 'curriculum:elementary_school',
    description: 'Elementary school years -- friends, teachers, daily life',
    questionType: 'era',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:elementary_school')(ids) ||
      (n >= 30 && hasEraEntries(g, 'childhood', 2)),
  },
  {
    id: 'curriculum:high_school_identity',
    description: 'High school years -- who they were, who they ran with',
    questionType: 'era',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:high_school_identity')(ids) ||
      (n >= 30 && hasEraEntries(g, 'youth', 2)),
  },
  {
    id: 'curriculum:school_friendships',
    description: 'Close friendships during school years',
    questionType: 'relationship',
    baseScore: 20,
    coveredIf: (g, ids) => h('curriculum:school_friendships')(ids),
  },
  {
    id: 'curriculum:first_romance',
    description: 'First romantic experiences',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:first_romance')(ids),
  },
  {
    id: 'curriculum:post_high_school',
    description: 'The immediate transition after high school',
    questionType: 'era',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:post_high_school')(ids) ||
      (n >= 30 && hasEraEntries(g, 'youth', 2)),
  },
  {
    id: 'curriculum:college_years',
    description: 'College or early adult years',
    questionType: 'era',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:college_years')(ids) ||
      (n >= 30 && hasEraEntries(g, 'youth', 2)),
  },
  {
    id: 'curriculum:leaving_home',
    description: 'The experience of leaving home for the first time',
    questionType: 'depth',
    baseScore: 22,
    coveredIf: (g, ids) => h('curriculum:leaving_home')(ids),
  },
  {
    id: 'curriculum:first_job',
    description: 'First paying job or work experience',
    questionType: 'origin',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:first_job')(ids) ||
      (n >= 30 && hasEraEntries(g, 'career', 1)),
  },
  {
    id: 'curriculum:career_arc',
    description: 'How the career unfolded -- the path taken and why',
    questionType: 'depth',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:career_arc')(ids) ||
      (n >= 30 && hasEraEntries(g, 'career', 2)),
  },
  {
    id: 'curriculum:work_identity',
    description: 'What work means to them beyond the paycheck',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids, n) => h('curriculum:work_identity')(ids) ||
      (n >= 30 && hasEraEntries(g, 'career', 2)),
  },
  {
    id: 'curriculum:how_they_met',
    description: 'How they met their partner',
    questionType: 'relationship',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:how_they_met')(ids) ||
      (n >= 30 && (hasEraEntries(g, 'marriage', 1) || hasPersonWithRelationship(g, 'spouse', 'wife', 'husband', 'partner'))),
  },
  {
    id: 'curriculum:early_relationship',
    description: 'Early years of the relationship before marriage/children',
    questionType: 'depth',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:early_relationship')(ids) ||
      (n >= 30 && hasEraEntries(g, 'marriage', 2)),
  },
  {
    id: 'curriculum:becoming_parent',
    description: 'The experience of becoming a parent for the first time',
    questionType: 'depth',
    baseScore: 22,
    coveredIf: (g, ids, n) => h('curriculum:becoming_parent')(ids) ||
      (n >= 30 && (hasEraEntries(g, 'parenthood', 1) || hasPersonWithRelationship(g, 'son', 'daughter', 'child'))),
  },
  {
    id: 'curriculum:adult_friendships',
    description: 'Deep adult friendships outside family',
    questionType: 'relationship',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:adult_friendships')(ids) ||
      (n >= 30 && Object.values(g.people ?? {}).some(p => p.relationship?.toLowerCase().includes('friend') && p.mentions >= 2)),
  },
  {
    id: 'curriculum:hobbies_origins',
    description: 'Where a hobby or passion actually started',
    questionType: 'origin',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:hobbies_origins')(ids) ||
      (n >= 30 && (g.interests ?? []).length > 0),
  },
  {
    id: 'curriculum:defining_values',
    description: 'A belief or value that guides major decisions',
    questionType: 'depth',
    baseScore: 20,
    coveredIf: (g, ids) => h('curriculum:defining_values')(ids),
  },
  {
    id: 'curriculum:financial_story',
    description: 'Relationship with money -- how it was framed growing up',
    questionType: 'origin',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:financial_story')(ids),
  },
  {
    id: 'curriculum:health_experiences',
    description: 'Significant health experiences',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids, n) => h('curriculum:health_experiences')(ids) ||
      (n >= 30 && (g.themes ?? []).some(t => /health|illness|medical|hospital|surgery/i.test(t))),
  },
  {
    id: 'curriculum:travel_meaningful',
    description: 'Places traveled or lived that actually mattered',
    questionType: 'sensory',
    baseScore: 18,
    coveredIf: (g, ids, n) => h('curriculum:travel_meaningful')(ids) ||
      (n >= 30 && Object.keys(g.places ?? {}).length > 3),
  },
  {
    id: 'curriculum:loss_grief',
    description: 'Loss experiences -- people, chapters, versions of yourself',
    questionType: 'depth',
    baseScore: 20,
    coveredIf: (g, ids, n) => h('curriculum:loss_grief')(ids) ||
      (n >= 30 && (g.themes ?? []).some(t => /loss|grief|death|died|passing/i.test(t))),
  },
  {
    id: 'curriculum:hardest_period',
    description: 'The hardest stretch of their life',
    questionType: 'depth',
    baseScore: 20,
    coveredIf: (g, ids) => h('curriculum:hardest_period')(ids),
  },
  {
    id: 'curriculum:biggest_mistake',
    description: 'A significant mistake and what they did with it',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:biggest_mistake')(ids),
  },
  {
    id: 'curriculum:roads_not_taken',
    description: 'A major fork in the road and the path not chosen',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:roads_not_taken')(ids),
  },
  {
    id: 'curriculum:how_ive_changed',
    description: 'How they are different now from who they were at 25',
    questionType: 'depth',
    baseScore: 16,
    coveredIf: (g, ids) => h('curriculum:how_ive_changed')(ids),
  },
  {
    id: 'curriculum:proudest_moments',
    description: 'Something they are proud of that they rarely talk about',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:proudest_moments')(ids),
  },
  {
    id: 'curriculum:daily_life_now',
    description: 'What a typical week looks like right now -- the mundane details',
    questionType: 'sensory',
    baseScore: 16,
    coveredIf: (g, ids) => h('curriculum:daily_life_now')(ids),
  },
  {
    id: 'curriculum:what_people_miss',
    description: 'Something about themselves that people who know them would be surprised to learn',
    questionType: 'depth',
    baseScore: 18,
    coveredIf: (g, ids) => h('curriculum:what_people_miss')(ids),
  },
  {
    id: 'curriculum:legacy',
    description: 'What they want to be remembered for',
    questionType: 'depth',
    baseScore: 14,
    coveredIf: (g, ids) => h('curriculum:legacy')(ids),
  },
]

// ─── Decision engine (pure logic — no LLM) ───────────────────
// Returns top 5 candidates. Claude makes the final selection.
// Enforces domain diversity: at most one candidate per domain category,
// so no single category (e.g. open_thread) can monopolize all 5 slots.
export function selectTopThreads(
  graph: NarrativeGraph,
  history: Array<{ thread_id?: string | null }> = []
): ScoredThread[] {
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
      description: `Theme present in their story: "${theme}" — find the earliest specific moment this pattern appeared -- a scene, not a summary`,
    })
  }

  // Places — ask a sensory question to bring a place to life
  for (const place of Object.values(graph.places ?? {})) {
    threads.push({
      threadId: `place:${place.name.slice(0, 40)}`,
      questionType: 'sensory',
      score: 12,
      description: `Place they've mentioned: "${place.name}" — ask for a sensory memory of this place`,
    })
  }

  // Events — specific named experiences worth exploring in depth
  for (const event of graph.events ?? []) {
    threads.push({
      threadId: `event:${event.name.slice(0, 40)}`,
      questionType: 'depth',
      score: 16,
      description: `Specific experience they've mentioned: "${event.name}" — ask for a memory or moment from this event`,
    })
  }

  // Interests — find the first memory or defining moment tied to this interest
  for (const interest of graph.interests ?? []) {
    threads.push({
      threadId: `interest:${interest.slice(0, 40)}`,
      questionType: 'depth',
      score: 15,
      description: `Interest or passion they've mentioned: "${interest}" — find the first memory or defining moment -- a specific time and place`,
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

  // Life curriculum — unexplored universal life territories
  // Each covered item is skipped; uncovered items compete for the single curriculum slot
  const historyIds = history.map(entry => entry.thread_id).filter((id): id is string => !!id)
  for (const item of LIFE_CURRICULUM) {
    if (!item.coveredIf(graph, historyIds, graph.total_entries)) {
      threads.push({
        threadId: item.id,
        questionType: item.questionType,
        score: item.baseScore,
        description: item.description,
      })
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

  // Default if graph is empty and all curriculum items are covered
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
  // The 'curriculum' domain counts as one slot, ensuring new territory is always in contention.
  const byDomain = new Map<string, ScoredThread>()
  for (const t of threads) {
    const domain = t.threadId.split(':')[0]
    if (!byDomain.has(domain)) byDomain.set(domain, t)
  }
  const diverse = Array.from(byDomain.values()).sort((a, b) => b.score - a.score)
  return diverse.slice(0, 5)
}
