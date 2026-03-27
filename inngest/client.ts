import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'fireside',
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: process.env.NODE_ENV !== 'production',
})
