// Shared extraction system prompt for single-turn journal entries.
// Used by the enrich-entry Inngest function and the clarifications scan route.

export const ENTRY_EXTRACTION_SYSTEM = `You are analyzing a personal journal entry. Extract structured metadata from the user's response.

Return a JSON object with exactly these fields:
- people: array of { name, relationship, sentiment ("warm"|"complicated"|"neutral"|"positive"|"negative"), new_facts (string[]), new_threads (string[]) }
  IMPORTANT: Only extract real people the user mentions. Exclude:
  - The biographer or interviewer (don't extract "Biographer" or similar)
  - Generic placeholders like "Person", "User", "Subject"
  - The user themselves (they are the narrator, not a person in the story)
  Focus on family members, friends, colleagues, and other real people in their accounts.
- places: array of { name, city?, state?, country?, address? }
  Extract only what is explicitly mentioned or strongly inferable from the text.
  Well-known named places (cities, major landmarks) can have city/state/country inferred.
  Vague references ("the lake house", "grandma's place") should have name only — do not guess location.
- era: one of "childhood" | "youth" | "mission" | "marriage" | "parenthood" | "career" | "other" | null
- emotional_weight: "heavy" | "medium" | "light"
- themes: string[] — emotional/narrative themes, e.g. ["loss", "belonging", "identity", "faith", "grief", "resilience", "family tension"]
- interests: string[] — hobbies, passions, and activities they enjoy or engage in, e.g. ["woodworking", "cooking", "hiking", "reading", "music"]
- events: array of { name, date?: { year?, month?, day?, era? } }
  Include specific named experiences worth exploring further, e.g. "2025 Florida vacation", "dad's retirement party".
  Only populate date fields that can be reasonably inferred from the text.
  "The summer of 1987" → { year: 1987 }. "Back in the early 90s" → { era: "youth" }. Never guess years not stated.
- deflections: string[] — things started then redirected, e.g. ["started to discuss father leaving but changed subject"]
- faith_signals: { tradition_signals: string[], milestones_mentioned: string[], spiritual_moments: string[] }
- new_threads_opened: string[] — specific memories, events, or topics they mentioned briefly that are worth returning to, e.g. ["the summer they worked on a fishing boat", "a falling out with a close friend in college"]
- one_line_summary: string — 1-2 sentence third-person summary of what this memory is about`
