import { describe, it, expect } from 'vitest'
import {
  SendOTPSchema,
  OnboardingCompleteSchema,
  SettingsUpdateSchema,
  ConversationChatSchema,
  ConversationAppendSchema,
  ConversationSettleSchema,
  ConversationContinueSchema,
  StoryGenerateSchema,
  StorySaveSchema,
  CleanupSchema,
  TitleGenerateSchema,
  TitleSaveSchema,
  ClarificationAnswerSchema,
  EntryFreeSchema,
  EntryDraftCreateSchema,
  EntryDraftUpdateSchema,
  BiographerStartSchema,
  PromptSubmitSchema,
  PromptEmailSchema,
} from './schemas'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const ANOTHER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectFail(schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const result = schema.safeParse(input)
  expect(result.success, `Expected validation to fail for: ${JSON.stringify(input)}`).toBe(false)
}

function expectPass(schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, input: unknown) {
  const result = schema.safeParse(input)
  expect(result.success, `Expected validation to pass for: ${JSON.stringify(input)}`).toBe(true)
  return (result as { success: true; data: unknown }).data
}

// ---------------------------------------------------------------------------
// POST /api/auth/send-otp
// ---------------------------------------------------------------------------

describe('SendOTPSchema', () => {
  it('accepts a valid email', () => {
    expectPass(SendOTPSchema, { email: 'user@example.com' })
  })

  it('accepts emails with subdomains', () => {
    expectPass(SendOTPSchema, { email: 'user@mail.example.co.uk' })
  })

  it('rejects missing email field', () => {
    expectFail(SendOTPSchema, {})
  })

  it('rejects empty string email', () => {
    expectFail(SendOTPSchema, { email: '' })
  })

  it('rejects null email', () => {
    expectFail(SendOTPSchema, { email: null })
  })

  it('rejects non-email string', () => {
    expectFail(SendOTPSchema, { email: 'not-an-email' })
  })

  it('rejects email without domain', () => {
    expectFail(SendOTPSchema, { email: 'user@' })
  })

  it('rejects email without @', () => {
    expectFail(SendOTPSchema, { email: 'userexample.com' })
  })

  it('rejects numeric email', () => {
    expectFail(SendOTPSchema, { email: 12345 })
  })
})

// ---------------------------------------------------------------------------
// POST /api/onboarding/complete
// ---------------------------------------------------------------------------

describe('OnboardingCompleteSchema', () => {
  it('accepts valid displayName', () => {
    expectPass(OnboardingCompleteSchema, { displayName: 'Alice' })
  })

  it('accepts displayName with onboardingProfile', () => {
    expectPass(OnboardingCompleteSchema, {
      displayName: 'Bob',
      onboardingProfile: { age: 30, interests: ['reading'] },
    })
  })

  it('strips leading/trailing whitespace from displayName', () => {
    const result = expectPass(OnboardingCompleteSchema, { displayName: '  Alice  ' }) as { displayName: string }
    expect(result.displayName).toBe('Alice')
  })

  it('rejects missing displayName', () => {
    expectFail(OnboardingCompleteSchema, {})
  })

  it('rejects empty displayName', () => {
    expectFail(OnboardingCompleteSchema, { displayName: '' })
  })

  it('rejects whitespace-only displayName', () => {
    expectFail(OnboardingCompleteSchema, { displayName: '   ' })
  })

  it('rejects null displayName', () => {
    expectFail(OnboardingCompleteSchema, { displayName: null })
  })

  it('rejects oversized displayName (>100 chars)', () => {
    expectFail(OnboardingCompleteSchema, { displayName: 'A'.repeat(101) })
  })

  it('accepts exactly 100-char displayName', () => {
    expectPass(OnboardingCompleteSchema, { displayName: 'A'.repeat(100) })
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/settings
// ---------------------------------------------------------------------------

describe('SettingsUpdateSchema', () => {
  it('accepts display_name only', () => {
    expectPass(SettingsUpdateSchema, { display_name: 'Alice' })
  })

  it('accepts is_active only', () => {
    expectPass(SettingsUpdateSchema, { is_active: false })
  })

  it('accepts cadence only', () => {
    expectPass(SettingsUpdateSchema, { cadence: 'weekly' })
  })

  it('accepts all fields together', () => {
    expectPass(SettingsUpdateSchema, { display_name: 'Bob', cadence: 'few_per_week', is_active: true })
  })

  it('rejects empty object (no valid fields)', () => {
    expectFail(SettingsUpdateSchema, {})
  })

  it('rejects empty display_name', () => {
    expectFail(SettingsUpdateSchema, { display_name: '' })
  })

  it('rejects whitespace-only display_name', () => {
    expectFail(SettingsUpdateSchema, { display_name: '   ' })
  })

  it('rejects invalid cadence value', () => {
    expectFail(SettingsUpdateSchema, { cadence: 'biweekly' })
  })

  it('rejects cadence as number instead of string', () => {
    expectFail(SettingsUpdateSchema, { cadence: 7 })
  })

  it('rejects is_active as string', () => {
    expectFail(SettingsUpdateSchema, { is_active: 'yes' })
  })

  it('rejects oversized display_name (>100 chars)', () => {
    expectFail(SettingsUpdateSchema, { display_name: 'X'.repeat(101) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/chat
// ---------------------------------------------------------------------------

describe('ConversationChatSchema', () => {
  it('accepts valid conversationId and responseText', () => {
    expectPass(ConversationChatSchema, { conversationId: VALID_UUID, responseText: 'Hello' })
  })

  it('trims responseText before min-length check', () => {
    const result = expectPass(ConversationChatSchema, { conversationId: VALID_UUID, responseText: '  hi  ' }) as { responseText: string }
    expect(result.responseText).toBe('hi')
  })

  it('rejects missing conversationId', () => {
    expectFail(ConversationChatSchema, { responseText: 'Hello' })
  })

  it('rejects missing responseText', () => {
    expectFail(ConversationChatSchema, { conversationId: VALID_UUID })
  })

  it('rejects empty responseText', () => {
    expectFail(ConversationChatSchema, { conversationId: VALID_UUID, responseText: '' })
  })

  it('rejects whitespace-only responseText', () => {
    expectFail(ConversationChatSchema, { conversationId: VALID_UUID, responseText: '   ' })
  })

  it('rejects malformed conversationId (not a UUID)', () => {
    expectFail(ConversationChatSchema, { conversationId: 'not-a-uuid', responseText: 'Hello' })
  })

  it('rejects numeric conversationId', () => {
    expectFail(ConversationChatSchema, { conversationId: 12345, responseText: 'Hello' })
  })

  it('rejects null conversationId', () => {
    expectFail(ConversationChatSchema, { conversationId: null, responseText: 'Hello' })
  })

  it('rejects null responseText', () => {
    expectFail(ConversationChatSchema, { conversationId: VALID_UUID, responseText: null })
  })

  it('rejects oversized responseText (>50000 chars)', () => {
    expectFail(ConversationChatSchema, { conversationId: VALID_UUID, responseText: 'x'.repeat(50_001) })
  })

  it('accepts responseText at exactly 50000 chars', () => {
    expectPass(ConversationChatSchema, { conversationId: VALID_UUID, responseText: 'x'.repeat(50_000) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/append
// ---------------------------------------------------------------------------

describe('ConversationAppendSchema', () => {
  it('accepts valid input', () => {
    expectPass(ConversationAppendSchema, { conversationId: VALID_UUID, responseText: 'My response' })
  })

  it('rejects missing conversationId', () => {
    expectFail(ConversationAppendSchema, { responseText: 'text' })
  })

  it('rejects malformed UUID', () => {
    expectFail(ConversationAppendSchema, { conversationId: 'bad-id', responseText: 'text' })
  })

  it('rejects empty responseText', () => {
    expectFail(ConversationAppendSchema, { conversationId: VALID_UUID, responseText: '' })
  })

  it('rejects whitespace-only responseText', () => {
    expectFail(ConversationAppendSchema, { conversationId: VALID_UUID, responseText: '\t\n ' })
  })

  it('rejects oversized responseText', () => {
    expectFail(ConversationAppendSchema, { conversationId: VALID_UUID, responseText: 'a'.repeat(50_001) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/settle
// ---------------------------------------------------------------------------

describe('ConversationSettleSchema', () => {
  it('accepts valid conversationId', () => {
    expectPass(ConversationSettleSchema, { conversationId: VALID_UUID })
  })

  it('rejects missing conversationId', () => {
    expectFail(ConversationSettleSchema, {})
  })

  it('rejects malformed UUID', () => {
    expectFail(ConversationSettleSchema, { conversationId: '12345' })
  })

  it('rejects null conversationId', () => {
    expectFail(ConversationSettleSchema, { conversationId: null })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/continue
// ---------------------------------------------------------------------------

describe('ConversationContinueSchema', () => {
  it('accepts valid conversationId', () => {
    expectPass(ConversationContinueSchema, { conversationId: VALID_UUID })
  })

  it('rejects missing conversationId', () => {
    expectFail(ConversationContinueSchema, {})
  })

  it('rejects malformed UUID', () => {
    expectFail(ConversationContinueSchema, { conversationId: 'abc' })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/[id]/story
// ---------------------------------------------------------------------------

describe('StoryGenerateSchema', () => {
  it('defaults intensity to medium when omitted', () => {
    const result = expectPass(StoryGenerateSchema, {}) as { intensity: string }
    expect(result.intensity).toBe('medium')
  })

  it('accepts light intensity', () => {
    expectPass(StoryGenerateSchema, { intensity: 'light' })
  })

  it('accepts medium intensity', () => {
    expectPass(StoryGenerateSchema, { intensity: 'medium' })
  })

  it('accepts full intensity', () => {
    expectPass(StoryGenerateSchema, { intensity: 'full' })
  })

  it('rejects invalid intensity value', () => {
    expectFail(StoryGenerateSchema, { intensity: 'ultra' })
  })

  it('rejects numeric intensity', () => {
    expectFail(StoryGenerateSchema, { intensity: 1 })
  })

  it('rejects null intensity', () => {
    expectFail(StoryGenerateSchema, { intensity: null })
  })
})

// ---------------------------------------------------------------------------
// PUT /api/conversation/[id]/story
// ---------------------------------------------------------------------------

describe('StorySaveSchema', () => {
  it('accepts non-empty content', () => {
    expectPass(StorySaveSchema, { content: 'My story text' })
  })

  it('accepts empty string content (saving an empty draft is valid)', () => {
    expectPass(StorySaveSchema, { content: '' })
  })

  it('rejects missing content', () => {
    expectFail(StorySaveSchema, {})
  })

  it('rejects null content', () => {
    expectFail(StorySaveSchema, { content: null })
  })

  it('rejects numeric content', () => {
    expectFail(StorySaveSchema, { content: 42 })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/[id]/cleanup
// ---------------------------------------------------------------------------

describe('CleanupSchema', () => {
  it('accepts empty body (force defaults to undefined)', () => {
    expectPass(CleanupSchema, {})
  })

  it('accepts force: true', () => {
    expectPass(CleanupSchema, { force: true })
  })

  it('accepts force: false', () => {
    expectPass(CleanupSchema, { force: false })
  })

  it('rejects force as string', () => {
    expectFail(CleanupSchema, { force: 'true' })
  })

  it('rejects force as number', () => {
    expectFail(CleanupSchema, { force: 1 })
  })
})

// ---------------------------------------------------------------------------
// POST /api/conversation/[id]/title
// ---------------------------------------------------------------------------

describe('TitleGenerateSchema', () => {
  it('defaults style to evocative when omitted', () => {
    const result = expectPass(TitleGenerateSchema, {}) as { style: string }
    expect(result.style).toBe('evocative')
  })

  it('accepts each valid style', () => {
    for (const style of ['evocative', 'witty', 'playful', 'poetic', 'simple']) {
      expectPass(TitleGenerateSchema, { style })
    }
  })

  it('rejects invalid style value', () => {
    expectFail(TitleGenerateSchema, { style: 'dramatic' })
  })

  it('rejects numeric style', () => {
    expectFail(TitleGenerateSchema, { style: 1 })
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/conversation/[id]/title
// ---------------------------------------------------------------------------

describe('TitleSaveSchema', () => {
  it('accepts a valid title', () => {
    expectPass(TitleSaveSchema, { title: 'My Memoir Entry' })
  })

  it('strips surrounding whitespace', () => {
    const result = expectPass(TitleSaveSchema, { title: '  Summer Days  ' }) as { title: string }
    expect(result.title).toBe('Summer Days')
  })

  it('rejects missing title', () => {
    expectFail(TitleSaveSchema, {})
  })

  it('rejects empty title', () => {
    expectFail(TitleSaveSchema, { title: '' })
  })

  it('rejects whitespace-only title', () => {
    expectFail(TitleSaveSchema, { title: '   ' })
  })

  it('rejects null title', () => {
    expectFail(TitleSaveSchema, { title: null })
  })

  it('rejects oversized title (>200 chars)', () => {
    expectFail(TitleSaveSchema, { title: 'T'.repeat(201) })
  })

  it('accepts exactly 200-char title', () => {
    expectPass(TitleSaveSchema, { title: 'T'.repeat(200) })
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/conversation/[id]/clarifications
// ---------------------------------------------------------------------------

describe('ClarificationAnswerSchema', () => {
  it('accepts valid clarificationId and answer', () => {
    expectPass(ClarificationAnswerSchema, { clarificationId: VALID_UUID, answer: 'Yes, that is correct' })
  })

  it('rejects missing clarificationId', () => {
    expectFail(ClarificationAnswerSchema, { answer: 'Yes' })
  })

  it('rejects malformed clarificationId', () => {
    expectFail(ClarificationAnswerSchema, { clarificationId: 'not-a-uuid', answer: 'Yes' })
  })

  it('rejects missing answer', () => {
    expectFail(ClarificationAnswerSchema, { clarificationId: VALID_UUID })
  })

  it('rejects empty answer', () => {
    expectFail(ClarificationAnswerSchema, { clarificationId: VALID_UUID, answer: '' })
  })

  it('rejects whitespace-only answer', () => {
    expectFail(ClarificationAnswerSchema, { clarificationId: VALID_UUID, answer: '   ' })
  })

  it('rejects oversized answer (>10000 chars)', () => {
    expectFail(ClarificationAnswerSchema, { clarificationId: VALID_UUID, answer: 'a'.repeat(10_001) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/entry/free
// ---------------------------------------------------------------------------

describe('EntryFreeSchema', () => {
  it('accepts responseText only', () => {
    expectPass(EntryFreeSchema, { responseText: 'Today I went hiking.' })
  })

  it('accepts responseText with topic', () => {
    expectPass(EntryFreeSchema, { responseText: 'Today I went hiking.', topic: 'Outdoors' })
  })

  it('rejects missing responseText', () => {
    expectFail(EntryFreeSchema, {})
  })

  it('rejects empty responseText', () => {
    expectFail(EntryFreeSchema, { responseText: '' })
  })

  it('rejects whitespace-only responseText', () => {
    expectFail(EntryFreeSchema, { responseText: '   ' })
  })

  it('rejects null responseText', () => {
    expectFail(EntryFreeSchema, { responseText: null })
  })

  it('rejects oversized responseText (>50000 chars)', () => {
    expectFail(EntryFreeSchema, { responseText: 'w'.repeat(50_001) })
  })

  it('rejects oversized topic (>500 chars)', () => {
    expectFail(EntryFreeSchema, { responseText: 'valid', topic: 'T'.repeat(501) })
  })

  it('accepts topic at exactly 500 chars', () => {
    expectPass(EntryFreeSchema, { responseText: 'valid', topic: 'T'.repeat(500) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/entry/draft
// ---------------------------------------------------------------------------

describe('EntryDraftCreateSchema', () => {
  it('accepts responseText only', () => {
    expectPass(EntryDraftCreateSchema, { responseText: 'Draft content here.' })
  })

  it('accepts responseText with topic', () => {
    expectPass(EntryDraftCreateSchema, { responseText: 'Draft content.', topic: 'My topic' })
  })

  it('rejects empty responseText', () => {
    expectFail(EntryDraftCreateSchema, { responseText: '' })
  })

  it('rejects whitespace-only responseText', () => {
    expectFail(EntryDraftCreateSchema, { responseText: '\n\t' })
  })

  it('rejects oversized responseText', () => {
    expectFail(EntryDraftCreateSchema, { responseText: 'd'.repeat(50_001) })
  })

  it('rejects oversized topic', () => {
    expectFail(EntryDraftCreateSchema, { responseText: 'valid', topic: 'T'.repeat(501) })
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/entry/draft
// ---------------------------------------------------------------------------

describe('EntryDraftUpdateSchema', () => {
  it('accepts required fields without publish', () => {
    expectPass(EntryDraftUpdateSchema, { conversationId: VALID_UUID, responseText: 'Updated content' })
  })

  it('accepts publish: true', () => {
    expectPass(EntryDraftUpdateSchema, {
      conversationId: VALID_UUID,
      responseText: 'Updated content',
      publish: true,
    })
  })

  it('accepts publish: false', () => {
    expectPass(EntryDraftUpdateSchema, {
      conversationId: VALID_UUID,
      responseText: 'Updated content',
      publish: false,
    })
  })

  it('rejects missing conversationId', () => {
    expectFail(EntryDraftUpdateSchema, { responseText: 'text' })
  })

  it('rejects malformed conversationId', () => {
    expectFail(EntryDraftUpdateSchema, { conversationId: 'bad', responseText: 'text' })
  })

  it('rejects empty responseText', () => {
    expectFail(EntryDraftUpdateSchema, { conversationId: VALID_UUID, responseText: '' })
  })

  it('rejects publish as string', () => {
    expectFail(EntryDraftUpdateSchema, { conversationId: VALID_UUID, responseText: 'text', publish: 'true' })
  })

  it('rejects oversized responseText', () => {
    expectFail(EntryDraftUpdateSchema, { conversationId: VALID_UUID, responseText: 'z'.repeat(50_001) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/entry/biographer-start
// ---------------------------------------------------------------------------

describe('BiographerStartSchema', () => {
  it('accepts a valid topic', () => {
    expectPass(BiographerStartSchema, { topic: 'My childhood summers' })
  })

  it('strips whitespace from topic', () => {
    const result = expectPass(BiographerStartSchema, { topic: '  My topic  ' }) as { topic: string }
    expect(result.topic).toBe('My topic')
  })

  it('rejects missing topic', () => {
    expectFail(BiographerStartSchema, {})
  })

  it('rejects empty topic', () => {
    expectFail(BiographerStartSchema, { topic: '' })
  })

  it('rejects whitespace-only topic', () => {
    expectFail(BiographerStartSchema, { topic: '   ' })
  })

  it('rejects null topic', () => {
    expectFail(BiographerStartSchema, { topic: null })
  })

  it('rejects oversized topic (>500 chars)', () => {
    expectFail(BiographerStartSchema, { topic: 'T'.repeat(501) })
  })

  it('accepts exactly 500-char topic', () => {
    expectPass(BiographerStartSchema, { topic: 'T'.repeat(500) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/prompt/submit
// ---------------------------------------------------------------------------

describe('PromptSubmitSchema', () => {
  it('accepts valid promptText and responseText', () => {
    expectPass(PromptSubmitSchema, { promptText: 'What is your earliest memory?', responseText: 'I remember...' })
  })

  it('accepts with optional promptCategory', () => {
    expectPass(PromptSubmitSchema, {
      promptText: 'A question',
      responseText: 'An answer',
      promptCategory: 'childhood',
    })
  })

  it('rejects missing promptText', () => {
    expectFail(PromptSubmitSchema, { responseText: 'An answer' })
  })

  it('rejects missing responseText', () => {
    expectFail(PromptSubmitSchema, { promptText: 'A question' })
  })

  it('rejects empty promptText', () => {
    expectFail(PromptSubmitSchema, { promptText: '', responseText: 'answer' })
  })

  it('rejects empty responseText', () => {
    expectFail(PromptSubmitSchema, { promptText: 'question', responseText: '' })
  })

  it('rejects whitespace-only promptText', () => {
    expectFail(PromptSubmitSchema, { promptText: '   ', responseText: 'answer' })
  })

  it('rejects whitespace-only responseText', () => {
    expectFail(PromptSubmitSchema, { promptText: 'question', responseText: '\n\t' })
  })

  it('rejects null promptText', () => {
    expectFail(PromptSubmitSchema, { promptText: null, responseText: 'answer' })
  })

  it('rejects oversized promptText (>10000 chars)', () => {
    expectFail(PromptSubmitSchema, { promptText: 'q'.repeat(10_001), responseText: 'answer' })
  })

  it('rejects oversized responseText (>50000 chars)', () => {
    expectFail(PromptSubmitSchema, { promptText: 'question', responseText: 'r'.repeat(50_001) })
  })
})

// ---------------------------------------------------------------------------
// POST /api/prompt/email
// ---------------------------------------------------------------------------

describe('PromptEmailSchema', () => {
  it('accepts valid promptText', () => {
    expectPass(PromptEmailSchema, { promptText: 'Describe your happiest moment.' })
  })

  it('accepts with optional promptCategory', () => {
    expectPass(PromptEmailSchema, { promptText: 'A question', promptCategory: 'memories' })
  })

  it('rejects missing promptText', () => {
    expectFail(PromptEmailSchema, {})
  })

  it('rejects empty promptText', () => {
    expectFail(PromptEmailSchema, { promptText: '' })
  })

  it('rejects whitespace-only promptText', () => {
    expectFail(PromptEmailSchema, { promptText: '   ' })
  })

  it('rejects null promptText', () => {
    expectFail(PromptEmailSchema, { promptText: null })
  })

  it('rejects oversized promptText (>10000 chars)', () => {
    expectFail(PromptEmailSchema, { promptText: 'p'.repeat(10_001) })
  })

  it('accepts promptText at exactly 10000 chars', () => {
    expectPass(PromptEmailSchema, { promptText: 'p'.repeat(10_000) })
  })
})
