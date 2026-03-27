import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { deliverPrompt } from '@/inngest/functions/deliver-prompt'
import { enrichEntry } from '@/inngest/functions/enrich-entry'
import { firstFollowup } from '@/inngest/functions/first-followup'
import { selectNextPrompt } from '@/inngest/functions/select-next-prompt'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [deliverPrompt, enrichEntry, firstFollowup, selectNextPrompt],
})
