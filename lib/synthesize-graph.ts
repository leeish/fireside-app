import { getClaudeClient } from './ai'
import { buildGraphBriefing, type NarrativeGraph } from './graph'

const SYNTHESIS_SYSTEM = `You are a biographer's research assistant. Your job is to write working notes about a person based on everything that has been captured about them so far.

These notes are what a thoughtful biographer would write in their notebook before sitting down to interview someone. They are not a summary of what was said — they are a portrait of who this person is, what has been told, what has been avoided, and what feels most alive to explore.

Write in third person, present tense. Be specific — use names, places, and details from what's been shared. Note patterns, not just facts. If something has been deflected or avoided, say so plainly. If a relationship feels central but underexplored, name it. If the emotional texture of their story has a particular character, describe it.

Do not pad. Do not conclude. Do not write "in summary." Just write the notes a good biographer would actually want to read.

Length should match the richness of what's been shared. Three sentences if that's all the material warrants. A full page if the person has shared enough to fill one. Let the content determine the length.`

export async function synthesizeGraph(graph: NarrativeGraph): Promise<string> {
  if (graph.total_entries === 0) return graph.rolling_summary ?? ''

  const { client, model } = getClaudeClient()
  const briefing = buildGraphBriefing(graph)

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
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

  return content.text.trim()
}
