import { getClaudeClient } from './ai'
import { buildGraphBriefing, type NarrativeGraph } from './graph'

const SYNTHESIS_SYSTEM = `You are a biographer's research assistant. Your job is to write working notes about a person based on everything captured about them so far.

These notes are what a thoughtful biographer writes in their notebook before sitting down for the next conversation. They are not a list of facts. They are a living portrait — who this person is, what has been told, what keeps being avoided, what seems to want to be said but hasn't been yet.

Write in third person, present tense. Be specific — use names, places, and details. Then go further:

WHAT TO LOOK FOR:
- Patterns across entries, not just individual facts. What keeps coming up? What keeps being circled without being landed on?
- What is conspicuously absent? What would you expect someone like this to have mentioned by now that they haven't?
- Who keeps appearing at the edges of stories without ever becoming the subject of one?
- What has been deflected or avoided? Name it plainly — not as judgment, but as observation.
- What seems to want to be said? Sometimes the shape of what hasn't been said is more telling than what has.
- The emotional texture of how they tell their stories — not just what happened, but how they hold it.
- If a relationship feels central but underexplored, say so. If an era is conspicuously thin, note it.

Do not pad. Do not summarize. Do not write "in summary" or "overall." Just write the notes a good biographer would actually want before the next conversation.

Length should match the richness of what's been shared. A few sentences early on. A full page or more as the story deepens. Let the material determine the length — never truncate because it feels long enough.`

export async function synthesizeGraph(graph: NarrativeGraph, apiKey?: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (graph.total_entries === 0) return { text: graph.rolling_summary ?? '', inputTokens: 0, outputTokens: 0 }

  const { client, model } = getClaudeClient(apiKey)
  const briefing = buildGraphBriefing(graph)

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYNTHESIS_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here is everything captured about this person so far:\n\n${briefing}\n\nWrite your biographer's notes.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  return {
    text: content.text.trim(),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}
