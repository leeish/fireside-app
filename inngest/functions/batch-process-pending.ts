import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { synthesizeGraph } from '@/lib/synthesize-graph'
import type { NarrativeGraph } from '@/lib/graph'

type BatchProcessPendingEvent = {
  data?: Record<string, unknown>
  ts?: number
}

export const batchProcessPending = inngest.createFunction(
  {
    id: 'batch-process-pending',
    retries: 2,
    // Cron trigger: midnight ET every day
    // 0 5 * * * = 5 AM UTC = midnight ET (EST is UTC-5, EDT is UTC-4, so 4 AM UTC for EDT)
    // Using 5 AM UTC covers midnight ET year-round (between EST and EDT transitions)
    triggers: [{ cron: '0 5 * * *' }],
  },
  async () => {
    const supabase = createServiceClient()

    // Find all conversations queued for batch processing
    const { data: queuedConversations } = await supabase
      .from('conversations')
      .select('id, user_id, status')
      .eq('queued_for_batch', true)
      .eq('status', 'settled')

    if (!queuedConversations || queuedConversations.length === 0) {
      return { processed: 0, message: 'No conversations queued for batch processing' }
    }

    const userIds = [...new Set(queuedConversations.map(c => c.user_id))]
    let processedCount = 0

    // Process each user's queued conversations
    for (const userId of userIds) {
      const userConversations = queuedConversations.filter(c => c.user_id === userId)

      // Load narrative graph
      const { data: narrativeRow } = await supabase
        .from('narratives')
        .select('graph, rolling_summary, graph_version')
        .eq('user_id', userId)
        .single()

      const currentGraph: NarrativeGraph = narrativeRow?.graph
        ? JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
        : ({} as NarrativeGraph)

      // Synthesis: update rolling_summary
      try {
        const synthesis = await synthesizeGraph(currentGraph)

        if (synthesis.text) {
          const { error } = await supabase
            .from('narratives')
            .update({
              rolling_summary: encrypt(synthesis.text, process.env.MEMORY_ENCRYPTION_KEY!),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)

          if (error) {
            console.error(`Failed to update rolling_summary for user ${userId}:`, error)
          }
        }
      } catch (err) {
        console.error(`Synthesis failed for user ${userId}:`, err)
        // Continue to next user even if synthesis fails — don't block prompt selection
      }

      // Prompt selection: trigger select-next-prompt for this user
      try {
        await inngest.send({
          name: 'fireside/prompt.select',
          data: { userId },
        })

        // Mark conversations as no longer queued for batch
        await supabase
          .from('conversations')
          .update({ queued_for_batch: false })
          .in('id', userConversations.map(c => c.id))

        processedCount += userConversations.length
      } catch (err) {
        console.error(`Failed to queue prompt selection for user ${userId}:`, err)
      }
    }

    return {
      processed: processedCount,
      userCount: userIds.length,
      message: `Processed ${processedCount} conversations for ${userIds.length} users`,
    }
  }
)
