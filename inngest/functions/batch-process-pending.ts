import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'

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

    for (const userId of userIds) {
      const userConversations = queuedConversations.filter(c => c.user_id === userId)

      try {
        await inngest.send({
          name: 'fireside/prompt.select',
          data: { userId },
        })

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
