import { z } from 'zod'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const UUIDField = z.string().uuid('Must be a valid UUID')
const TrimmedNonEmpty = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`)

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const SendOTPSchema = z.object({
  email: z.string().email('Must be a valid email address'),
})
export type SendOTPInput = z.infer<typeof SendOTPSchema>

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const OnboardingCompleteSchema = z.object({
  displayName: TrimmedNonEmpty('Display name', 100),
  onboardingProfile: z.record(z.string(), z.unknown()).optional(),
})
export type OnboardingCompleteInput = z.infer<typeof OnboardingCompleteSchema>

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const CADENCE_VALUES = ['daily', 'few_per_week', 'weekly'] as const

export const SettingsUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1, 'Display name must not be empty').max(100).optional(),
    cadence: z.enum(CADENCE_VALUES, { message: 'Cadence must be daily, few_per_week, or weekly' }).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.display_name !== undefined ||
      data.cadence !== undefined ||
      data.is_active !== undefined,
    { message: 'At least one field must be provided' }
  )
export type SettingsUpdateInput = z.infer<typeof SettingsUpdateSchema>

// ---------------------------------------------------------------------------
// Conversation — action bodies
// ---------------------------------------------------------------------------

export const ConversationChatSchema = z.object({
  conversationId: UUIDField,
  responseText: TrimmedNonEmpty('Response text', 50_000),
})
export type ConversationChatInput = z.infer<typeof ConversationChatSchema>

export const ConversationAppendSchema = z.object({
  conversationId: UUIDField,
  responseText: TrimmedNonEmpty('Response text', 50_000),
})
export type ConversationAppendInput = z.infer<typeof ConversationAppendSchema>

export const ConversationSettleSchema = z.object({
  conversationId: UUIDField,
})
export type ConversationSettleInput = z.infer<typeof ConversationSettleSchema>

export const ConversationContinueSchema = z.object({
  conversationId: UUIDField,
})
export type ConversationContinueInput = z.infer<typeof ConversationContinueSchema>

// ---------------------------------------------------------------------------
// Conversation — [id] sub-routes
// ---------------------------------------------------------------------------

export const StoryGenerateSchema = z.object({
  intensity: z.enum(['light', 'medium', 'full']).optional().default('medium'),
})
export type StoryGenerateInput = z.infer<typeof StoryGenerateSchema>

export const StorySaveSchema = z.object({
  content: z.string({ error: 'Content is required' }),
})
export type StorySaveInput = z.infer<typeof StorySaveSchema>

export const CleanupSchema = z.object({
  force: z.boolean().optional(),
})
export type CleanupInput = z.infer<typeof CleanupSchema>

export const TitleGenerateSchema = z.object({
  style: z
    .enum(['evocative', 'witty', 'playful', 'poetic', 'simple'])
    .optional()
    .default('evocative'),
})
export type TitleGenerateInput = z.infer<typeof TitleGenerateSchema>

export const TitleSaveSchema = z.object({
  title: TrimmedNonEmpty('Title', 200),
})
export type TitleSaveInput = z.infer<typeof TitleSaveSchema>

export const ClarificationAnswerSchema = z.object({
  clarificationId: UUIDField,
  answer: TrimmedNonEmpty('Answer', 10_000),
})
export type ClarificationAnswerInput = z.infer<typeof ClarificationAnswerSchema>

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export const EntryFreeSchema = z.object({
  responseText: TrimmedNonEmpty('Entry text', 50_000),
  topic: z.string().trim().max(500, 'Topic must be 500 characters or fewer').optional(),
})
export type EntryFreeInput = z.infer<typeof EntryFreeSchema>

export const EntryDraftCreateSchema = z.object({
  responseText: TrimmedNonEmpty('Entry text', 50_000),
  topic: z.string().trim().max(500, 'Topic must be 500 characters or fewer').optional(),
})
export type EntryDraftCreateInput = z.infer<typeof EntryDraftCreateSchema>

export const EntryDraftUpdateSchema = z.object({
  conversationId: UUIDField,
  responseText: TrimmedNonEmpty('Entry text', 50_000),
  publish: z.boolean().optional(),
})
export type EntryDraftUpdateInput = z.infer<typeof EntryDraftUpdateSchema>

export const BiographerStartSchema = z.object({
  topic: TrimmedNonEmpty('Topic', 500),
})
export type BiographerStartInput = z.infer<typeof BiographerStartSchema>

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const PromptSubmitSchema = z.object({
  promptText: TrimmedNonEmpty('Prompt text', 10_000),
  responseText: TrimmedNonEmpty('Response text', 50_000),
  promptCategory: z.string().optional(),
})
export type PromptSubmitInput = z.infer<typeof PromptSubmitSchema>

export const PromptEmailSchema = z.object({
  promptText: TrimmedNonEmpty('Prompt text', 10_000),
  promptCategory: z.string().optional(),
})
export type PromptEmailInput = z.infer<typeof PromptEmailSchema>

// ---------------------------------------------------------------------------
// API Key (BYOK)
// ---------------------------------------------------------------------------

export const ApiKeySchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required').startsWith('sk-ant-', 'Must be a valid Anthropic API key'),
})
export type ApiKeyInput = z.infer<typeof ApiKeySchema>
