# Fireside -- Application Reference

Quick-reference map of the current codebase. Read this before exploring files.

## Stack

- **Framework:** Next.js 16.2.1 (React 19, Turbopack)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Background jobs:** Inngest (event-driven, retries built in)
- **Email:** Resend (outbound prompts, inbound replies via webhook)
- **AI -- extraction/chat:** OpenAI (`gpt-4o-mini`) via `getAIClient()`
- **AI -- generation/synthesis:** Anthropic (`claude-sonnet-4-6`) via `getClaudeClient()`, `claudeComplete()`, `chatComplete()`
- **AI -- real-time chat:** Configurable via `CHAT_VENDOR` + `CHAT_MODEL` env vars (default: Anthropic `claude-haiku-4-5-20251001`)
- **Encryption:** AES-256-GCM for user turn content (`lib/crypto.ts`, key: `MEMORY_ENCRYPTION_KEY`)
- **Auth:** Supabase OTP (passwordless email)
- **Hosting:** Vercel (auto-deploy on push to `main`)

## Database (7 tables)

Schema: `db/schema.sql`. All tables have RLS enabled.

| Table | Purpose |
|-------|---------|
| `users` | Mirrors Supabase Auth. `onboarding_profile` (JSONB), `cadence`, `is_active`, `display_name`, `subscription_tier`, `last_active_at` |
| `queued_prompts` | Delivery queue. States: `queued` > `email_sent` > `in_app_seen` > `engaged` > `complete` |
| `narratives` | One row per user. `graph` (JSONB) is the AI's full model of the person. `rolling_summary`, `graph_version` |
| `conversations` | One per topic/session. `status`: `active` > `wrap_offered` > `settled` > `archived`. `origin`: `biographer`, `user_initiated`, `entry_reentry` |
| `turns` | Message log. User turns encrypted, biographer turns plaintext. `processed` flag tracks pipeline completion |
| `entries` | Settled journal output. `content`, `cleaned_content`, `story_content`, `story_intensity` |
| `milestones` | Calendar events, faith milestones, life events with `depth_score` |

## Route Map

### Pages (`app/`)

| Route | Type | What it does |
|-------|------|-------------|
| `/` | Server | Redirects to `/dashboard` |
| `/login` | Client | OTP email login form |
| `/onboarding` | Client | 2-step: display name + interest picker |
| `/dashboard` | Server | Main hub: pending prompt, conversation list, new-user picker |
| `/dashboard/conversation/[id]` | Server | Active: real-time chat. Settled: tabbed view (transcript/cleanup/story) |
| `/dashboard/archive` | Server | Archived conversations with restore/delete |
| `/dashboard/new` | Client | Free writing + biographer-guided entry modes, speech input, autosave |
| `/dashboard/answer/[promptId]` | Server | Creates conversation for queued prompt, redirects to it |
| `/dashboard/settings` | Server | Account, cadence, autosave, subscription, danger zone |
| `/dashboard/graph` | Server | Debug: raw narrative graph JSON |
| `/settings` | Server | Redirects to `/dashboard/settings` |
| `/privacy`, `/terms` | Server | Static legal pages |

### Shared Layout

`app/dashboard/layout.tsx` -- all `/dashboard/*` routes get:
- Sticky pill nav (Fireside logo link, email, Home, Settings, ThemeToggle, LogoutButton)
- Footer (Archive, debug graph link)
- Auth redirect if not logged in

### API Routes (`app/api/`)

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/auth/send-otp` | POST | Sends OTP email via Supabase |
| `/api/onboarding/complete` | POST | Saves profile, fires `onboarding.seed` |
| `/api/settings` | PATCH | Updates display_name, cadence, is_active |
| `/api/account` | DELETE | Cascading wipe of all user data + auth deletion |
| `/api/conversation/chat` | POST | User sends message in active conversation, fires `chat.respond` |
| `/api/conversation/append` | POST | Append text to settled conversation, fires `entry.enrich` |
| `/api/conversation/settle` | POST | User wraps conversation, fires `chat.settle` |
| `/api/conversation/continue` | POST | User continues after wrap offered |
| `/api/conversation/[id]/turns` | GET | Polling endpoint for conversation turns |
| `/api/conversation/[id]/archive` | PATCH | Archives a conversation |
| `/api/conversation/[id]/restore` | PATCH | Restores archived conversation |
| `/api/conversation/[id]/cleanup` | POST | Generates cleaned-up transcript via AI |
| `/api/conversation/[id]/story` | POST/PUT | Generates or saves story entry at chosen intensity |
| `/api/conversation/[id]/title` | POST/PATCH | AI-generates or manually sets conversation title |
| `/api/entry/free` | POST | Creates free-form entry, fires `entry.enrich` |
| `/api/entry/draft` | POST/PATCH | Creates or updates draft; PATCH with `publish: true` fires `entry.enrich` |
| `/api/entry/biographer-start` | POST | User picks a topic, AI generates opening question |
| `/api/prompt/submit` | POST | First-time user submits response to a starter prompt |
| `/api/prompt/draft` | POST | Saves first prompt response as draft |
| `/api/prompt/email` | POST | Admin: manually trigger email delivery |
| `/api/prompt/pending` | GET | Returns current pending prompt for user |
| `/api/prompt/[id]/skip` | POST | Skip a prompt, fires `prompt.select` for replacement |
| `/api/email/inbound` | POST | Resend webhook: parses email reply, creates turn, fires `entry.enrich` |
| `/api/inngest` | GET/POST/PUT | Inngest handler, registers all 7 functions |

## Inngest Pipeline (7 functions)

All registered in `app/api/inngest/route.ts`. Source: `inngest/functions/`.

### Event Flow

```
ONBOARDING
  POST /api/onboarding/complete
    -> fireside/onboarding.seed .... Seeds empty narrative graph

FIRST ENTRY
  User submits first response
    -> fireside/entry.enrich ...... Extract + merge into graph
      -> fireside/prompt.first-followup  (if total_entries == 1)
        -> fireside/prompt.deliver (1-day delay, always)

SUBSEQUENT ENTRIES (email reply or free-form)
  -> fireside/entry.enrich
    -> fireside/prompt.select .... Score threads, generate question, quality check
      -> fireside/prompt.deliver (cadence delay: 1/3/7 days)

IN-APP CHAT (real-time)
  POST /api/conversation/chat
    -> fireside/chat.respond ..... Generate next biographer question in real-time
  POST /api/conversation/settle
    -> fireside/chat.settle ...... Extract full transcript, merge graph
      -> fireside/prompt.select
        -> fireside/prompt.deliver (cadence delay)

SKIP PROMPT
  POST /api/prompt/[id]/skip
    -> fireside/prompt.select .... Immediately pick new question
```

### Function Details

| Function | Event | Retries | AI Model | Purpose |
|----------|-------|---------|----------|---------|
| `onboarding-seed` | `onboarding.seed` | 2 | Claude | Extract initial graph from onboarding profile |
| `enrich-entry` | `entry.enrich` | 3 | OpenAI | Extract metadata from single turn, merge into graph, settle conversation |
| `first-followup` | `prompt.first-followup` | 3 | Claude | Generate 3 candidates, pick best, schedule delivery in 1 day |
| `select-next-prompt` | `prompt.select` | 3 | Claude | Score threads, synthesize graph, generate question, quality check |
| `deliver-prompt` | `prompt.deliver` | 3 | None | Send email via Resend (or skip based on hold rules) |
| `chat-respond` | `chat.respond` | 2 | Configurable | Real-time biographer response during active conversation |
| `chat-settle` | `chat.settle` | 2 | OpenAI | Full transcript extraction, merge into graph |

### Delivery Guards (deliver-prompt)

- Skips if prompt already `complete`
- Skips if another prompt already `email_sent`
- Skips if user has `is_active = false`
- Skips if user active in last 6 hours (hold rule)

## Narrative Graph

Type: `lib/graph.ts`. Stored as JSONB in `narratives.graph`.

The graph is the AI's persistent model of a person. It grows with every entry.

**Key fields:** `people` (name > relationship, sentiment, mentions, facts, unexplored threads), `places`, `eras` (name > richness + entry count), `themes`, `deflections`, `faith` (tradition, tier, milestones, spiritual_moments), `last_entry_weight`, `total_entries`, `entry_log` (append-only), `rolling_summary` (rewritten by Claude each pass).

**Operations:**
- `mergeExtraction(graph, extraction)` -- pure function, called after every entry
- `buildGraphBriefing(graph)` -- formats graph as text for LLM consumption
- `synthesizeGraph(graph)` -- Claude rewrites `rolling_summary` as biographer's working notes
- `emptyGraph(displayName)` -- creates blank graph for new users

## Prompt Generation (4-Layer Craft System)

Source: `lib/craft-system.ts`. Injected as system prompt for question generation.

| Layer | Scope | Content |
|-------|-------|---------|
| 1+2 | Global (all users) | Biographer voice, hard rules (one question, never start with "I", max 3 sentences, self-contained), question type definitions |
| 3 | Domain context | Conditional blocks for mission, childhood, marriage/parenthood -- only included if relevant eras exist in graph |
| 4 | Faith fluency | Gated by `faith.tier`. Tier 2: generic Christian context. Tier 3+: deep LDS vocabulary, milestones, honest territory |

**Question types:** `depth`, `origin`, `sensory`, `relationship`, `era`, `milestone`, `faith_milestone`, `faith_texture`, `lightness`

**Quality check** (in `select-next-prompt`): Claude validates generated question. Fails if generic, multi-question, starts with "I", >3 sentences, or pushes deflected topic. Up to 2 attempts.

## Encryption

- User turn `content` encrypted at rest with `MEMORY_ENCRYPTION_KEY` (AES-256-GCM)
- Biographer turns stored plaintext
- Decrypted server-side in page renders and Inngest functions
- `narratives.graph` is NOT yet encrypted (planned)
- Unsubscribe tokens: HMAC-SHA256 with `UNSUBSCRIBE_SECRET`

## Non-Obvious Behaviors

- **5-minute prompt suppression:** After settling a conversation, `PromptCard` checks `sessionStorage.last_settled_at` and hides the next prompt for 5 minutes. Written in `ConversationClient.handleSettle()`.
- **Wrap detection:** `chat-respond` returns `{ response, wrap }`. When `wrap: true`, conversation status moves to `wrap_offered` and the user sees settle/continue buttons.
- **Autosave:** Free entries in `/dashboard/new` autosave every 15 seconds to `/api/entry/draft`. Toggleable in settings (localStorage `fireside_autosave`).
- **Email reply routing:** Outbound emails use `reply+{conversationId}@bartelme.info` as reply-to. Inbound webhook at `/api/email/inbound` parses the conversation ID from the reply-to address.
- **First entry special path:** When `total_entries === 1`, `enrich-entry` fires `first-followup` instead of `select-next-prompt`. First followup generates 3 candidates in parallel and picks the best one. Always delivers in 1 day regardless of cadence.
- **Rolling summary vs entry log:** `entry_log` is append-only (one line per entry, never rewritten). `rolling_summary` is Claude's synthesized biographer notes, rewritten from scratch each pass in `select-next-prompt`.
- **Story intensity:** Settled conversations can generate story entries at three levels: `light` (minimal editing), `medium` (polished), `full` (ghost-written).
- **Title generation:** 5 style options: evocative, witty, playful, poetic, simple.

## Middleware

`middleware.ts` enforces:
1. Unauthenticated users redirected to `/login` (except public pages, webhooks, API routes)
2. Authenticated users on `/login` redirected to `/dashboard`
3. Authenticated users without `onboarding_profile` redirected to `/onboarding`
4. Public-access bypass: `/privacy`, `/terms`, `/unsubscribe`, `/api/inngest`, `/api/email/inbound`, `/api/auth/*`

## Key Lib Files

| File | Purpose |
|------|---------|
| `lib/ai.ts` | AI client factories. `getAIClient()` = OpenAI/local. `getClaudeClient()` = Anthropic. `claudeComplete()` = single-turn Claude. `chatComplete()` = multi-turn, vendor-configurable with structured JSON output |
| `lib/graph.ts` | Narrative graph types, `mergeExtraction()`, `buildGraphBriefing()`, `emptyGraph()`, faith detection |
| `lib/synthesize-graph.ts` | `synthesizeGraph()` -- Claude rewrites rolling_summary as biographer's working notes |
| `lib/craft-system.ts` | 4-layer prompt craft system for question generation |
| `lib/crypto.ts` | `encrypt()`, `decrypt()` (AES-256-GCM), `createUnsubscribeToken()`, `verifyUnsubscribeToken()` |
| `lib/email.ts` | `sendPrompt()` via Resend with HTML/text templates, reply-to routing, unsubscribe headers |
| `lib/supabase/server.ts` | `createClient()` (user-scoped, cookie-based), `createServiceClient()` (service role, bypasses RLS) |
| `lib/supabase/client.ts` | Browser-side Supabase client |

## External Services

| Service | What it does | Key env vars |
|---------|-------------|--------------|
| **Supabase** | Database, auth, RLS | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Inngest** | Background job orchestration | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| **Resend** | Outbound email (prompts) | `RESEND_API_KEY`, `RESEND_FROM` |
| **OpenAI** | Extraction, chat, cleanup | `OPENAI_API_KEY` |
| **Anthropic** | Question generation, synthesis, quality checks | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| **Vercel** | Hosting, auto-deploy on push to main | (managed via Vercel dashboard) |
