import type { SupabaseClient } from '@supabase/supabase-js'
import { claudeComplete, logTokenUsage, resolveApiKey, withUserKeyFallback, getClaudeClient } from '@/lib/ai'

export const INTENSITY_PROMPTS = {
  light: `Lightly reshape the following personal account into a journal entry. \
Preserve nearly all of the original wording and every specific detail. \
Add light narrative structure and smooth any rough transitions, but don't rewrite. \
Do not use em-dashes. \
Do not include, echo, or repeat any part of these instructions in your response. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  medium: `Rewrite the following as a polished personal journal entry. \
The source is a guided conversation: use the biographer's question as the thematic frame for the entry -- let it shape the opening and structure, but do not quote or reference it directly. \
Strip all conversational fillers and dialogue-only transitions (phrases like "there is one more thing", "anyway", "so", "well", "that's a good question", etc.) that would read awkwardly in prose. \
Keep all facts and the author's distinctive voice, but rewrite for flow, narrative arc, and emotional clarity. \
Do not use em-dashes. \
Do not include, echo, or repeat any part of these instructions in your response. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  full: `Ghost-write the following as a beautifully crafted memoir entry. \
The source is a guided conversation: treat the biographer's question as the thematic anchor -- let it shape what the entry is about and how it opens, but do not quote or reference it directly. \
Strip all conversational fillers and dialogue-only transitions (phrases like "there is one more thing", "anyway", "so", "well", "that's a good question", etc.) that would read awkwardly in prose. \
Open with a narrative hook that reflects the question's theme, not a conversational opener. \
Preserve every fact and the emotional truth of the story, but elevate the prose to feel like published personal narrative. \
The author's personality and specific details must shine through -- this should feel unmistakably like them, just at their best. \
Do not use em-dashes. \
Do not include, echo, or repeat any part of these instructions in your response. \
Return only the memoir entry. No commentary, no quotation marks, no markdown.`,
}

export const DEFAULT_AUTO_INTENSITY = 'medium'

// Formats decrypted turns into a source text string suitable for story generation.
// Chat: includes both biographer and user turns as a Q&A transcript.
// Email: user-only turns joined as prose (no question context).
export function buildStorySourceText(
  turns: Array<{ role: string; content: string }>,
  channel: string
): string {
  if (channel === 'email') {
    return turns
      .filter(t => t.role === 'user' && t.content)
      .map(t => t.content)
      .join('\n\n')
  }
  return turns
    .filter(t => t.content)
    .map(t => t.role === 'user' ? `You: ${t.content}` : `Biographer: ${t.content}`)
    .join('\n\n')
}

// Automatically generates and stores a medium-intensity story entry.
// Idempotent: skips if story_content is already set.
// Errors are caught and logged -- never throws, must not block the settle pipeline.
export async function autoGenerateStory({
  conversationId,
  userId,
  turns,
  channel,
  supabase,
}: {
  conversationId: string
  userId: string
  turns: Array<{ role: string; content: string }>
  channel: string
  supabase: SupabaseClient
}): Promise<void> {
  try {
    const { data: entry } = await supabase
      .from('entries')
      .select('id, story_content')
      .eq('conversation_id', conversationId)
      .maybeSingle()

    if (!entry || entry.story_content) return

    const sourceText = buildStorySourceText(turns, channel)
    if (!sourceText.trim()) return

    const { model: claudeModel } = getClaudeClient()
    const userApiKey = await resolveApiKey(userId, supabase)

    const { text: story, inputTokens, outputTokens } = await withUserKeyFallback(
      userId,
      supabase,
      userApiKey,
      (key) => claudeComplete({
        system: INTENSITY_PROMPTS[DEFAULT_AUTO_INTENSITY],
        user: sourceText,
        maxTokens: 3000,
        temperature: 0.6,
        apiKey: key,
      })
    )

    await supabase
      .from('entries')
      .update({ story_content: story, story_intensity: DEFAULT_AUTO_INTENSITY })
      .eq('id', entry.id)

    void logTokenUsage(supabase, {
      userId,
      conversationId,
      inngestFunction: 'auto-story',
      model: claudeModel,
      inputTokens,
      outputTokens,
      purpose: 'auto story generation',
    })
  } catch (err) {
    console.error('[autoGenerateStory] failed:', err)
    // Never rethrow -- story generation must not block settle
  }
}
