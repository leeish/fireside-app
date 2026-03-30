import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { getAIClient, logTokenUsage } from '@/lib/ai'
import { encrypt } from '@/lib/crypto'
import { emptyGraph, mergeExtraction, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'

type OnboardingSeedEvent = {
  data: {
    userId: string
    displayName: string
    onboardingProfile: Record<string, unknown>
  }
}

// Seeds the narrative graph from onboarding data.
// Passes the raw onboarding profile to the LLM so that changes to onboarding
// questions don't require changes here — the LLM handles the mapping.

const SEED_SYSTEM = `You are initializing a narrative graph for a personal biography app. A new user has just completed onboarding and provided some information about themselves.

Your job: extract what is known into a structured format that will seed their narrative graph. This is not a full entry — it is early context. Be conservative. Only extract what is clearly stated.

Return a JSON object with exactly these fields (omit or leave empty any field you cannot infer):
- people: array of { name, relationship, sentiment, new_facts (string[]), new_threads (string[]) }
- places: string[] — specific places mentioned
- era: null (onboarding data rarely maps to a single era)
- emotional_weight: "light"
- themes: string[] — interests and life themes this person has indicated
- deflections: []
- faith_signals: { tradition_signals: string[], milestones_mentioned: string[], spiritual_moments: string[] }
- new_threads_opened: string[] — topics worth returning to based on what they shared
- one_line_summary: string — one sentence describing what we know about this person so far`

export const onboardingSeed = inngest.createFunction(
  { id: 'onboarding-seed', retries: 2, triggers: [{ event: 'fireside/onboarding.seed' }] },
  async ({ event }: { event: OnboardingSeedEvent }) => {
    const { userId, displayName, onboardingProfile } = event.data
    const supabase = createServiceClient()

    const { client, model } = getAIClient()

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SEED_SYSTEM },
        {
          role: 'user',
          content: `New user display name: ${displayName}\n\nOnboarding profile:\n${JSON.stringify(onboardingProfile, null, 2)}\n\nExtract what is known into the narrative graph seed format.`,
        },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const extraction: ExtractionResult = JSON.parse(raw)

    await logTokenUsage(supabase, {
      userId,
      inngestFunction: 'onboarding-seed',
      model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      purpose: 'onboarding extraction',
    })

    // Initialize graph with display name
    const baseGraph: NarrativeGraph = emptyGraph(displayName)
    const seededGraph = mergeExtraction(baseGraph, extraction)

    // total_entries should stay 0 — this is not a real entry
    seededGraph.total_entries = 0

    await supabase
      .from('narratives')
      .upsert({
        user_id: userId,
        graph: encrypt(JSON.stringify(seededGraph), process.env.MEMORY_ENCRYPTION_KEY!),
        graph_version: 1,
        rolling_summary: seededGraph.rolling_summary
          ? encrypt(seededGraph.rolling_summary, process.env.MEMORY_ENCRYPTION_KEY!)
          : '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    return { userId, themes: extraction.themes, seeded: true }
  }
)
